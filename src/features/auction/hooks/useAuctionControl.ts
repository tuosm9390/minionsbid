import { useEffect, useRef } from 'react'
import { useAuctionStore, Player, Role } from '@/features/auction/store/useAuctionStore'
import { awardPlayer, closeLotteryAction } from '@/features/auction/api/auctionActions'

interface UseAuctionControlProps {
  roomId: string
  effectiveRole: Role
  players: Player[]
  currentPlayerId: string | null
  timerEndsAt: string | null
}

const AWARD_GRACE_MS = 1_500

export function useAuctionControl({
  roomId,
  effectiveRole,
  players,
  currentPlayerId,
  timerEndsAt,
}: UseAuctionControlProps) {
  const setLotteryPlayer = useAuctionStore(s => s.setLotteryPlayer)
  const lotteryPlayer = useAuctionStore(s => s.lotteryPlayer)
  const auctionMode = useAuctionStore(s => s.auctionMode)

  // 1. IN_AUCTION 전환 감지 → 추첨 모달 표시
  // lotteryPlayer는 Zustand store로 관리됨.
  // CLOSE_LOTTERY는 useAuctionRealtime에서 setLotteryPlayer(null) 처리.
  const prevPlayersRef = useRef<Player[]>([])

  useEffect(() => {
    const prev = prevPlayersRef.current
    const curr = players

    if (prev.length > 0 && curr.length > 0) {
      const prevActive = prev.find(p => p.status === 'IN_AUCTION')
      const currActive = curr.find(p => p.status === 'IN_AUCTION')

      if (!prevActive && currActive) {
        // RTDB LOTTERY_DRAWN 이벤트가 이미 같은 선수를 설정했으면 재호출 방지
        const currentLotteryPlayer = useAuctionStore.getState().lotteryPlayer
        if (currentLotteryPlayer?.id !== currActive.id) {
          setLotteryPlayer(currActive)
        }
      }
    }
    prevPlayersRef.current = curr
  }, [players, setLotteryPlayer])

  // 2. 추첨 모달 닫기 — Server Action 경유로 CLOSE_LOTTERY 브로드캐스트
  //    (서버에서 시스템 메시지 전송 + STATE_UPDATE + CLOSE_LOTTERY 일괄 처리)
  const handleCloseLottery = async () => {
    if (effectiveRole !== 'ORGANIZER') return
    if (!lotteryPlayer || !roomId) return
    const result = await closeLotteryAction(roomId, lotteryPlayer.name)
    if (result.error) {
      console.error('[Lottery] close failed:', result.error)
      alert(`추첨 종료 오류: ${result.error}`)
      return
    }
    // 서버 정본이 먼저 갱신된 뒤라도 organizer 화면은 즉시 bidding scene으로 넘어가야 한다.
    // RTDB/Firestore 반영이 조금 늦어도 로컬 scene 전환은 낙오되면 안 된다.
    setLotteryPlayer(null)
  }

  // 3. 타이머 만료 시 자동 낙찰 처리 (ORGANIZER 클라이언트만 실행)
  const awardLock = useRef(false)
  const playersRef = useRef(players)
  playersRef.current = players
  const triggerAward = async (playerId: string) => {
    if (auctionMode === 'SEALED_BID') return
    if (awardLock.current) return
    const stillActive = playersRef.current.find(
      p => p.id === playerId && p.status === 'IN_AUCTION',
    )
    if (!stillActive) return

    awardLock.current = true
    try {
      const result = await awardPlayer(roomId, playerId)
      if (result.error) {
        console.error('[Auto-Award] 낙찰 처리 실패:', result.error)
        alert(`낙찰 처리 오류: ${result.error}`)
      }
    } catch (err) {
      console.error('[Auto-Award] Server Action 예외:', err)
    } finally {
      awardLock.current = false
    }
  }

  useEffect(() => {
    // ORGANIZER 클라이언트만 직접 자동 낙찰을 시도한다.
    if (
      effectiveRole !== 'ORGANIZER' ||
      auctionMode === 'SEALED_BID' ||
      !timerEndsAt ||
      !roomId
    ) return

    // 타이머가 갱신(연장)됐으므로 이전 낙찰 시도의 lock을 초기화
    awardLock.current = false

    const cp =
      playersRef.current.find((p) => p.id === currentPlayerId) ??
      playersRef.current.find(p => p.status === 'IN_AUCTION')
    if (!cp) return

    const playerId = cp.id
    const delay = Math.max(0, new Date(timerEndsAt).getTime() - Date.now()) + AWARD_GRACE_MS

    let cancelled = false
    const t = setTimeout(async () => {
      if (cancelled) return
      await triggerAward(playerId)
    }, delay)

    return () => { cancelled = true; clearTimeout(t) }
  }, [timerEndsAt, roomId, effectiveRole, currentPlayerId, auctionMode])

  return {
    lotteryPlayer,
    handleCloseLottery,
    triggerAward,
  }
}
