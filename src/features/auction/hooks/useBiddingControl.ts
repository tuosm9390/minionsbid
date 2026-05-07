'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  useAuctionStore,
  type LiveBidState,
  type Player,
  type Team,
} from '@/features/auction/store/useAuctionStore'
import { placeBid, broadcastBidEvent } from '@/features/auction/api/auctionActions'
import { placeBidDirect } from '@/features/auction/api/placeBidClient'
import { getAuctionBidEligibility } from '@/features/auction/utils/auctionRealtime'
import { recordAuctionLatencyMarker } from '@/features/auction/utils/latencyDebug'
import { bucketAuctionPlayers } from '@/features/auction/store/auctionSelectors'
import {
  EXTEND_DURATION_MS,
  EXTEND_THRESHOLD_MS,
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
    const bidClickedAt = Date.now()
    const shouldOptimisticallyResetTimer =
      !!timerEndsAt &&
      new Date(timerEndsAt).getTime() - bidClickedAt < EXTEND_THRESHOLD_MS
    const optimisticLiveBid: LiveBidState = {
      player_id: currentPlayer.id,
      team_id: teamId,
      amount: finalAmount,
      created_at: new Date().toISOString(),
    }

    setBidError(null)
    setIsBidding(true)

    setLiveBid(optimisticLiveBid)

    if (shouldOptimisticallyResetTimer) {
      const optimisticTimerEndsAt = new Date(
        Date.now() + EXTEND_DURATION_MS,
      ).toISOString()
      setRealtimeData({ timerEndsAt: optimisticTimerEndsAt })
    }
    try {
      // 1차: 클라이언트 직접 입찰 (Vercel Function 경유 없이 Firestore 직접 트랜잭션)
      const directRes = await placeBidDirect({
        roomId,
        playerId: currentPlayer.id,
        teamId,
        amount: finalAmount,
        resetTimer: shouldOptimisticallyResetTimer,
      })

      if (directRes.error) {
        // 클라이언트 직접 입찰 실패 → Server Action 폴백
        if (LATENCY_DEBUG) {
          console.info('[bid] direct failed, falling back to server action', directRes.error)
        }
        const res = await placeBid(roomId, currentPlayer.id, teamId, finalAmount)
        if (res.error) {
          setLiveBid(previousLiveBid ?? null)
          if (shouldOptimisticallyResetTimer) {
            setRealtimeData({ timerEndsAt: previousTimerEndsAt })
          }
          setBidError(res.error)
        } else {
          setLiveBid(optimisticLiveBid)
          setBidAmount(finalAmount + 10)
          if (res.timerEndsAt) {
            setRealtimeData({ timerEndsAt: res.timerEndsAt })
          }
          if (typeof res.revision === 'number' && res.revision > 0) {
            setAuctionEventRevision(res.revision)
          }
        }
      } else {
        // 클라이언트 직접 입찰 성공
        setLiveBid(optimisticLiveBid)
        if (LATENCY_DEBUG) {
          console.info('[latency][client] placeBidDirect success', {
            roomId,
            teamId,
            amount: finalAmount,
            clientRoundTripMs: Date.now() - bidClickedAt,
            optimisticTimerReset: shouldOptimisticallyResetTimer,
          })
        }
        setBidAmount(finalAmount + 10)
        // Firestore onSnapshot이 자동으로 다른 클라이언트에 전파
        if (directRes.timerEndsAt) {
          setRealtimeData({ timerEndsAt: directRes.timerEndsAt })
        }
        if (typeof directRes.revision === 'number' && directRes.revision > 0) {
          setAuctionEventRevision(directRes.revision)
        }
        // RTDB 이벤트 전파 + 시스템 메시지 (fire-and-forget, 레이턴시에 영향 없음)
        const teamName = myTeam?.name ?? teamId
        const effectiveTimer = directRes.timerEndsAt ?? useAuctionStore.getState().timerEndsAt ?? null
        void broadcastBidEvent(
          roomId,
          currentPlayer.id,
          teamId,
          teamName,
          finalAmount,
          effectiveTimer,
          directRes.revision ?? 0,
        ).catch(() => { /* 입찰 성공에는 영향 없음 */ })
      }
    } catch (error) {
      setLiveBid(previousLiveBid ?? null)
      if (shouldOptimisticallyResetTimer) {
        setRealtimeData({ timerEndsAt: previousTimerEndsAt })
      }
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
