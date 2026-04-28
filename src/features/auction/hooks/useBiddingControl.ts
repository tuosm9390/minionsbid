'use client'

import { useState, useEffect } from 'react'
import {
  useAuctionStore,
  type LiveBidState,
  type Player,
  type Team,
} from '@/features/auction/store/useAuctionStore'
import { placeBid } from '@/features/auction/api/auctionActions'
import { getAuctionDerivedState } from '@/features/auction/utils/auctionRealtime'

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

const EXTEND_THRESHOLD_MS = 5_000
const EXTEND_DURATION_MS = 5_000
const LATENCY_DEBUG = process.env.NEXT_PUBLIC_DEBUG_LATENCY === '1'

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

  const bids = useAuctionStore((s) => s.bids)
  const liveBid = useAuctionStore((s) => s.liveBid)
  const setRealtimeData = useAuctionStore((s) => s.setRealtimeData)
  const setLiveBid = useAuctionStore((s) => s.setLiveBid)
  const appendBid = useAuctionStore((s) => s.appendBid)
  const removeBid = useAuctionStore((s) => s.removeBid)
  const players = useAuctionStore((s) => s.players)

  // ── 파생 데이터 ──
  const { activeLiveBid, isLeading } = getAuctionDerivedState({
    bids,
    currentPlayerId: currentPlayer?.id,
    liveBid,
    teamId,
  })

  const numericBidAmount =
    typeof bidAmount === 'string' ? parseInt(bidAmount) || 0 : bidAmount
  const canBid =
    isAuctionActive &&
    !isBidding &&
    !!currentPlayer &&
    !isLeading &&
    !isTeamFull

  const waitingCount = players.filter((p) => p.status === 'WAITING').length
  const soldCount = players.filter((p) => p.status === 'SOLD').length

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

  // ── 핸들러 ──
  const handleBid = async () => {
    if (!currentPlayer || !roomId || !teamId) return
    const numericAmount =
      typeof bidAmount === 'string' ? parseInt(bidAmount) || 0 : bidAmount
    const finalAmount = Math.max(numericAmount, minBid)
    const optimisticBidId = `temp-bid-${teamId}-${Date.now()}`
    const previousTimerEndsAt = timerEndsAt
    const previousLiveBid = activeLiveBid
    const bidClickedAt = Date.now()
    const shouldOptimisticallyExtend =
      !!timerEndsAt &&
      new Date(timerEndsAt).getTime() - Date.now() < EXTEND_THRESHOLD_MS
    const optimisticLiveBid: LiveBidState = {
      player_id: currentPlayer.id,
      team_id: teamId,
      amount: finalAmount,
      created_at: new Date().toISOString(),
    }

    setBidError(null)
    setIsBidding(true)

    setLiveBid(optimisticLiveBid)

    if (shouldOptimisticallyExtend) {
      const optimisticTimerEndsAt = new Date(
        Date.now() + EXTEND_DURATION_MS,
      ).toISOString()
      setRealtimeData({ timerEndsAt: optimisticTimerEndsAt })
    }

    appendBid({
      id: optimisticBidId,
      room_id: roomId,
      player_id: currentPlayer.id,
      team_id: teamId,
      amount: finalAmount,
      created_at: new Date().toISOString(),
    })
    try {
      const res = await placeBid(roomId, currentPlayer.id, teamId, finalAmount)
      if (res.error) {
        removeBid(optimisticBidId)
        setLiveBid(previousLiveBid ?? null)
        if (shouldOptimisticallyExtend) {
          setRealtimeData({ timerEndsAt: previousTimerEndsAt })
        }
        setBidError(res.error)
      } else {
        setLiveBid(optimisticLiveBid)
        if (LATENCY_DEBUG) {
          console.info('[latency][client] placeBid response', {
            roomId,
            teamId,
            amount: finalAmount,
            clientRoundTripMs: Date.now() - bidClickedAt,
            server: res.debug ?? null,
            optimisticExtend: shouldOptimisticallyExtend,
          })
        }
        setBidAmount(finalAmount + 10)
        // 타이머 연장 시 실시간 이벤트 대기 없이 즉시 반영 (Optimistic Update)
        if (res.timerEndsAt) {
          setRealtimeData({ timerEndsAt: res.timerEndsAt })
        }
      }
    } catch (error) {
      removeBid(optimisticBidId)
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
    canBid,
    waitingCount,
    soldCount,
    myTeam,

    // 핸들러
    handleBid,
    incrementBid,
    decrementBid,
  }
}
