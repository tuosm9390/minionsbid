'use client'

import { useEffect, useRef } from 'react'
import { pauseAuction, resumeAuction } from '@/features/auction/api/auctionActions'
import type { Role } from '@/features/auction/store/useAuctionStore'

interface UseAuctionPresenceGuardProps {
  roomId: string
  effectiveRole: Role
  isPresenceLoaded: boolean
  allConnected: boolean
  currentPlayerId: string | null
  timerEndsAt: string | null
  lotteryPlayerId: string | null
}

type GuardPhase = 'idle' | 'pausing' | 'paused' | 'resuming'

export function useAuctionPresenceGuard({
  roomId,
  effectiveRole,
  isPresenceLoaded,
  allConnected,
  currentPlayerId,
  timerEndsAt,
  lotteryPlayerId,
}: UseAuctionPresenceGuardProps) {
  const phaseRef = useRef<GuardPhase>('idle')

  useEffect(() => {
    if (effectiveRole !== 'ORGANIZER' || !roomId || !isPresenceLoaded) {
      return
    }

    if (!currentPlayerId) {
      phaseRef.current = 'idle'
      return
    }

    const isAuctionRunning = !!timerEndsAt
    const isLotteryPhase = !!lotteryPlayerId

    if (!allConnected && isAuctionRunning && phaseRef.current === 'idle') {
      phaseRef.current = 'pausing'
      void pauseAuction(roomId).then((result) => {
        if (result.error) {
          phaseRef.current = 'idle'
          return
        }
        phaseRef.current = 'paused'
      })
      return
    }

    if (
      allConnected &&
      phaseRef.current === 'paused' &&
      !timerEndsAt &&
      !isLotteryPhase
    ) {
      phaseRef.current = 'resuming'
      void resumeAuction(roomId).then((result) => {
        if (result.error) {
          phaseRef.current = 'paused'
          return
        }
        phaseRef.current = 'idle'
      })
    }
  }, [
    allConnected,
    currentPlayerId,
    effectiveRole,
    isPresenceLoaded,
    lotteryPlayerId,
    roomId,
    timerEndsAt,
  ])
}
