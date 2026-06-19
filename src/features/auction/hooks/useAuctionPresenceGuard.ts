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
  isAuctionStarted: boolean
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
  isAuctionStarted,
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

  useEffect(() => {
    latestStateRef.current = {
      allConnected,
      currentPlayerId,
      timerEndsAt,
      lotteryPlayerId,
    }
  }, [allConnected, currentPlayerId, lotteryPlayerId, timerEndsAt])

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

    const isLotteryPhase = !!lotteryPlayerId

    if (!allConnected && isAuctionStarted && phaseRef.current === 'idle') {
      if (pauseTimeoutRef.current === null) {
        pauseTimeoutRef.current = window.setTimeout(() => {
          pauseTimeoutRef.current = null
          const latest = latestStateRef.current
          if (
            latest.allConnected ||
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

    if (allConnected || !isAuctionStarted || isLotteryPhase) {
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
    isAuctionStarted,
    isPresenceLoaded,
    lotteryPlayerId,
    organizerToken,
    roomId,
    timerEndsAt,
  ])
}
