'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  useAuctionStore,
  type LiveBidState,
  type Player,
  type Team,
} from '@/features/auction/store/useAuctionStore'
import {
  broadcastBidEvent,
  placeBid,
} from '@/features/auction/api/auctionActions'
import { getServerTime } from './useServerTimeOffset'
import { placeBidDirect } from '@/features/auction/api/placeBidClient'
import { getAuctionBidEligibility } from '@/features/auction/utils/auctionRealtime'
import { bucketAuctionPlayers } from '@/features/auction/store/auctionSelectors'
import {
  EXTEND_THRESHOLD_MS,
  EXTEND_DURATION_MS,
} from '@/features/auction/constants/auctionTimings'

interface UseBiddingControlProps {
  roomId: string
  teamId: string
  currentPlayer: Player | null
  myTeam: Team | null
  isAuctionActive: boolean
  timerEndsAt: string | null
  minBid: number
  isTeamFull: boolean
}

const LATENCY_DEBUG = process.env.NEXT_PUBLIC_DEBUG_LATENCY === '1'
const E2E_AUCTION_FIXTURE = process.env.NEXT_PUBLIC_E2E_AUCTION_FIXTURE === '1'

function isRealtimeDebugEnabled() {
  if (typeof window === 'undefined') return false
  return (
    new URLSearchParams(window.location.search).has('debugRealtime') ||
    window.localStorage.getItem('debugRealtime') === '1'
  )
}

/**
 * BiddingControl 컴포넌트의 비즈니스 로직 Hook.
 *
 * 입찰 상태 관리, 핸들러, 파생 상태 계산을 컴포넌트에서 분리하여
 * 테스트 용이성과 재사용성을 향상합니다.
 */
export function useBiddingControl({
  roomId,
  teamId,
  currentPlayer,
  myTeam,
  isAuctionActive,
  timerEndsAt,
  minBid,
  isTeamFull,
}: UseBiddingControlProps) {
  const [bidAmount, setBidAmount] = useState<number | string>(minBid)
  const [isBidding, setIsBidding] = useState(false)
  const [bidError, setBidError] = useState<string | null>(null)

  const liveBid = useAuctionStore((s) => s.liveBid)
  const setRealtimeData = useAuctionStore((s) => s.setRealtimeData)
  const setLiveBid = useAuctionStore((s) => s.setLiveBid)
  const setAuctionEventRevision = useAuctionStore((s) => s.setAuctionEventRevision)
  const players = useAuctionStore((s) => s.players)
  const { waitingPlayers, soldPlayers } = useMemo(
    () => bucketAuctionPlayers(players),
    [players],
  )

  // ── 파생 데이터 ──
  const activeLiveBid =
    liveBid?.player_id === currentPlayer?.id ? liveBid : null
  const { isLeading, canBid } = getAuctionBidEligibility({
    currentBidAmount: activeLiveBid?.amount ?? null,
    currentBidTeamId: activeLiveBid?.team_id ?? null,
    teamId,
    teamPointBalance: myTeam?.point_balance ?? 0,
    isAuctionActive,
    hasCurrentPlayer: !!currentPlayer,
    isTeamFull,
  })

  const numericBidAmount =
    typeof bidAmount === 'string' ? parseInt(bidAmount) || 0 : bidAmount
  const canSubmitBid = canBid && !isBidding

  const waitingCount = waitingPlayers.length
  const soldCount = soldPlayers.length

  // ── Effects ──
  useEffect(() => {
    setBidAmount((prev) => {
      const val = typeof prev === 'string' ? parseInt(prev) || 0 : prev
      return Math.max(val, minBid)
    })
  }, [minBid])

  useEffect(() => {
    setBidAmount(minBid)
    setBidError(null)
  }, [currentPlayer?.id, minBid])

  useEffect(() => {
    if (!isRealtimeDebugEnabled()) return
    console.info('[debug][canBid]', {
      roomId,
      teamId,
      canBid: canSubmitBid,
      isAuctionActive,
      isBidding,
      currentPlayerId: currentPlayer?.id ?? null,
      currentPlayerName: currentPlayer?.name ?? null,
      isLeading,
      isTeamFull,
      minBid,
      numericBidAmount,
      timerEndsAt,
      now: new Date().toISOString(),
      waitingCount,
      soldCount,
      myTeamPointBalance: myTeam?.point_balance ?? null,
    })
  }, [
    roomId,
    teamId,
    canSubmitBid,
    isAuctionActive,
    isBidding,
    currentPlayer?.id,
    currentPlayer?.name,
    isLeading,
    isTeamFull,
    minBid,
    numericBidAmount,
    timerEndsAt,
    waitingCount,
    soldCount,
    myTeam?.point_balance,
  ])

  // ── 핸들러 ──
  const handleBid = async () => {
    if (!currentPlayer || !roomId || !teamId) return
    const numericAmount =
      typeof bidAmount === 'string' ? parseInt(bidAmount) || 0 : bidAmount
    const finalAmount = Math.max(numericAmount, minBid)
    const previousTimerEndsAt = timerEndsAt
    const previousLiveBid = activeLiveBid
    const bidClickedAtLocal = Date.now()
    const bidClickedAtServer = getServerTime()
    const shouldOptimisticallyResetTimer =
      !!timerEndsAt &&
      new Date(timerEndsAt).getTime() - bidClickedAtServer < EXTEND_THRESHOLD_MS
    const optimisticLiveBid: LiveBidState = {
      player_id: currentPlayer.id,
      team_id: teamId,
      amount: finalAmount,
      created_at: new Date(bidClickedAtServer).toISOString(),
    }

    setBidError(null)
    setIsBidding(true)
    setLiveBid(optimisticLiveBid)

    // 남은 시간 < 5s이면 즉시 낙관적 타이머 리셋 표시
    // 사용자 피드백: 낙관적 UI 업데이트가 오류처럼 느껴짐.
    // if (shouldOptimisticallyResetTimer) {
    //   setRealtimeData({ timerEndsAt: new Date(bidClickedAtServer + EXTEND_DURATION_MS).toISOString() })
    // }

    try {
      const directResult = await placeBidDirect({
        roomId,
        playerId: currentPlayer.id,
        teamId,
        amount: finalAmount,
        resetTimer: shouldOptimisticallyResetTimer,
      })
      if (!directResult.error) {
        const directTimerChanged =
          !!directResult.timerEndsAt &&
          directResult.timerEndsAt !== previousTimerEndsAt

        setLiveBid(optimisticLiveBid)
        setBidAmount(finalAmount + 10)
        if (directResult.revision) {
          setAuctionEventRevision(directResult.revision)
        }
        if (directTimerChanged) {
          setRealtimeData({
            timerEndsAt: directResult.timerEndsAt!,
          })
        }
        if (!E2E_AUCTION_FIXTURE) {
          void broadcastBidEvent(
            roomId,
            currentPlayer.id,
            teamId,
            myTeam?.name ?? '팀',
            finalAmount,
            directResult.timerEndsAt ?? previousTimerEndsAt,
            directResult.revision ?? useAuctionStore.getState().auctionEventRevision,
            directTimerChanged ? EXTEND_DURATION_MS : null,
          )
        }
        if (LATENCY_DEBUG) {
          console.info('[latency][client] placeBidDirect success', {
            roomId,
            teamId,
            amount: finalAmount,
            clientRoundTripMs: Date.now() - bidClickedAtLocal,
          })
        }
        return
      }

      const res = await placeBid(roomId, currentPlayer.id, teamId, finalAmount)
      if (res.error) {
        setLiveBid(previousLiveBid ?? null)
        // if (shouldOptimisticallyResetTimer) {
        //   setRealtimeData({ timerEndsAt: previousTimerEndsAt })
        // }
        setBidError(res.error)
      } else {
        const serverTimerChanged =
          !!res.timerEndsAt &&
          res.timerEndsAt !== previousTimerEndsAt

        setLiveBid(optimisticLiveBid)
        setBidAmount(finalAmount + 10)
        if (res.revision) {
          setAuctionEventRevision(res.revision)
        }
        if (serverTimerChanged) {
          setRealtimeData({
            timerEndsAt: res.timerEndsAt!,
          })
        }
        // timerEndsAt은 RTDB/Firestore 폴백이 브라우저 클럭 기준으로 갱신 — 여기서 덮어쓰지 않음
        if (LATENCY_DEBUG) {
          console.info('[latency][client] placeBid success', {
            roomId,
            teamId,
            amount: finalAmount,
            clientRoundTripMs: Date.now() - bidClickedAtLocal,
          })
        }
      }
    } catch (error) {
      setLiveBid(previousLiveBid ?? null)
      // if (shouldOptimisticallyResetTimer) {
      //   setRealtimeData({ timerEndsAt: previousTimerEndsAt })
      // }
      throw error
    } finally {
      setIsBidding(false)
    }
  }

  const incrementBid = () => {
    setBidAmount((v) => (typeof v === 'string' ? parseInt(v) || 0 : v) + 10)
  }

  const decrementBid = () => {
    setBidAmount((v) =>
      Math.max(minBid, (typeof v === 'string' ? parseInt(v) || 0 : v) - 10),
    )
  }

  return {
    // 상태
    bidAmount,
    setBidAmount,
    isBidding,
    bidError,

    // 파생 데이터
    isLeading,
    numericBidAmount,
    canBid: canSubmitBid,
    waitingCount,
    soldCount,
    myTeam,

    // 핸들러
    handleBid,
    incrementBid,
    decrementBid,
  }
}
