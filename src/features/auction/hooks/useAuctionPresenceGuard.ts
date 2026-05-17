'use client'

import { useEffect, useRef } from 'react'
import { pauseAuction, resumeAuction } from '@/features/auction/api/auctionActions'
import { useAuctionStore, type Role } from '@/features/auction/store/useAuctionStore'

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
const PRESENCE_DISCONNECT_GRACE_MS = 3_000

export function useAuctionPresenceGuard({
  roomId,
  effectiveRole,
  isPresenceLoaded,
  allConnected,
  currentPlayerId,
  timerEndsAt,
  lotteryPlayerId,
}: UseAuctionPresenceGuardProps) {
  const organizerToken = useAuctionStore((s) => s.organizerToken)
  const phaseRef = useRef<GuardPhase>('idle')
  const pauseTimeoutRef = useRef<number | null>(null)
  const latestStateRef = useRef({
    allConnected,
    currentPlayerId,
    timerEndsAt,
    lotteryPlayerId,
  })

  latestStateRef.current = {
    allConnected,
    currentPlayerId,
    timerEndsAt,
    lotteryPlayerId,
  }

  useEffect(() => {
    const clearPendingPause = () => {
      if (pauseTimeoutRef.current !== null) {
        window.clearTimeout(pauseTimeoutRef.current)
        pauseTimeoutRef.current = null
      }
    }

    if (effectiveRole !== 'ORGANIZER' || !roomId || !isPresenceLoaded) {
      clearPendingPause()
      return
    }

    if (!currentPlayerId) {
      clearPendingPause()
      phaseRef.current = 'idle'
      return
    }

    const isAuctionRunning = !!timerEndsAt
    const isLotteryPhase = !!lotteryPlayerId

    if (!allConnected && isAuctionRunning && phaseRef.current === 'idle') {
      if (pauseTimeoutRef.current === null) {
        pauseTimeoutRef.current = window.setTimeout(() => {
          pauseTimeoutRef.current = null
          const latest = latestStateRef.current
          if (
            latest.allConnected ||
            !latest.currentPlayerId ||
            !latest.timerEndsAt ||
            latest.lotteryPlayerId ||
            phaseRef.current !== 'idle'
          ) {
            return
          }

          phaseRef.current = 'pausing'
          void pauseAuction(roomId, organizerToken ?? '').then((result) => {
            if (result.error) {
              phaseRef.current = 'idle'
              return
            }
            phaseRef.current = 'paused'
          })
        }, PRESENCE_DISCONNECT_GRACE_MS)
      }
      return () => {
        clearPendingPause()
      }
    }

    if (allConnected || !isAuctionRunning || isLotteryPhase) {
      clearPendingPause()
    }

    if (
      allConnected &&
      phaseRef.current === 'paused' &&
      !timerEndsAt &&
      !isLotteryPhase
    ) {
      phaseRef.current = 'resuming'
      void resumeAuction(roomId, organizerToken ?? '').then((result) => {
        if (result.error) {
          phaseRef.current = 'paused'
          return
        }
        phaseRef.current = 'idle'
      })
      return
    }

    return () => {
      clearPendingPause()
    }
  }, [
    allConnected,
    currentPlayerId,
    effectiveRole,
    isPresenceLoaded,
    lotteryPlayerId,
    organizerToken,
    roomId,
    timerEndsAt,
  ])
}
