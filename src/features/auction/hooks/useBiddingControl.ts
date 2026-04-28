'use client'

import { useState, useEffect } from 'react'
import {
  useAuctionStore,
  type Player,
  type Team,
} from '@/features/auction/store/useAuctionStore'
import { placeBid } from '@/features/auction/api/auctionActions'

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
  const setRealtimeData = useAuctionStore((s) => s.setRealtimeData)
  const appendBid = useAuctionStore((s) => s.appendBid)
  const removeBid = useAuctionStore((s) => s.removeBid)
  const players = useAuctionStore((s) => s.players)

  // ── 파생 데이터 ──
  const playerBids = bids.filter((b) => b.player_id === currentPlayer?.id)
  const highestBid =
    playerBids.length > 0 ? Math.max(...playerBids.map((b) => b.amount)) : 0
  const topBid = playerBids.find((b) => b.amount === highestBid)
  const isLeading = topBid?.team_id === teamId

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
    const shouldOptimisticallyExtend =
      !!timerEndsAt &&
      new Date(timerEndsAt).getTime() - Date.now() < EXTEND_THRESHOLD_MS

    setBidError(null)
    setIsBidding(true)

    if (shouldOptimisticallyExtend) {
      setRealtimeData({
        timerEndsAt: new Date(Date.now() + EXTEND_DURATION_MS).toISOString(),
      })
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
        if (shouldOptimisticallyExtend) {
          setRealtimeData({ timerEndsAt: previousTimerEndsAt })
        }
        setBidError(res.error)
      } else {
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
