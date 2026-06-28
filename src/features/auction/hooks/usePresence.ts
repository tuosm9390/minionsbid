'use client'

import { useEffect, useRef } from 'react'
import { ref, set, onDisconnect, onValue, serverTimestamp } from 'firebase/database'
import { useAuctionStore, type PresenceUser } from '../store/useAuctionStore'
import { getAuctionClientServices } from '../realtime/clientAdapter'
import { ensureRoomFirebaseAuth } from '@/lib/firebase'
const E2E_AUCTION_FIXTURE = process.env.NEXT_PUBLIC_E2E_AUCTION_FIXTURE === '1'

interface PresenceOptions {
  roomId: string
  teamId: string | null
  role: string | null
  teamName?: string
  authToken?: string | null
  disableRoomFirebaseAuth?: boolean
}

type PresenceRecord = {
  teamId: string | null
  teamName: string
  role: string | null
  connectedAt: ReturnType<typeof serverTimestamp>
}

function isPresenceDebugEnabled() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.has('debugAuth') || window.localStorage.getItem('debugAuth') === '1'
}

function logPresenceDebug(
  stage: string,
  payload: {
    roomId: string
    role: string | null
    teamId: string | null
    tokenPresent?: boolean
    authUid?: string | null
    connected?: boolean
    presenceCount?: number
    hasLocalPresence?: boolean
    error?: string
  },
) {
  if (!isPresenceDebugEnabled()) return
  console.info('[presence]', stage, payload)
}

/**
 * Firebase RTDB 기반 Presence 훅.
 * onDisconnect를 활용하여 연결 끊김 시 자동으로 presence 정보를 제거한다.
 */
export function useFirebasePresence({
  roomId,
  teamId,
  role,
  teamName,
  authToken,
  disableRoomFirebaseAuth = false,
}: PresenceOptions) {
  const setRealtimeData = useAuctionStore(s => s.setRealtimeData)
  const setPresenceLoaded = useAuctionStore(s => s.setPresenceLoaded)
  const setLocalConnected = useAuctionStore(s => s.setLocalConnected)
  const setPresenceAuthError = useAuctionStore(s => s.setPresenceAuthError)
  const roomAuthToken = useAuctionStore(s => s.roomAuthToken)
  const localPresenceRef = useRef<PresenceUser | null>(null)

  useEffect(() => {
    if (!roomId) return
    if (E2E_AUCTION_FIXTURE) {
      setPresenceLoaded(true)
      setLocalConnected(true)
      return
    }

    let cancelled = false
    const unsubs: (() => void)[] = []
    let myPresenceRef: ReturnType<typeof ref> | null = null

    const run = async () => {
      try {
        logPresenceDebug('setup-start', {
          roomId,
          role,
          teamId,
          tokenPresent: !!(authToken ?? roomAuthToken),
        })
        if (role === 'LEADER' && !teamId) {
          logPresenceDebug('leader-team-missing', { roomId, role, teamId })
          setPresenceLoaded(true)
          return
        }

        const shouldRegisterSelf = role === 'LEADER' || role === 'ORGANIZER'
        const effectiveAuthToken = authToken ?? roomAuthToken
        let authUid: string | null = null

        if (shouldRegisterSelf && disableRoomFirebaseAuth) {
          logPresenceDebug('room-firebase-auth-disabled', {
            roomId,
            role,
            teamId,
            tokenPresent: !!effectiveAuthToken,
          })
          setPresenceLoaded(true)
          if (role === 'LEADER') {
            localPresenceRef.current = {
              teamId: teamId ?? null,
              role: role as PresenceUser['role'],
            }
          }
        } else if (shouldRegisterSelf) {
          if (!effectiveAuthToken) {
            logPresenceDebug('auth-token-missing', {
              roomId,
              role,
              teamId,
              tokenPresent: false,
            })
            setPresenceAuthError(true)
            setPresenceLoaded(true)
            if (role === 'LEADER') {
              localPresenceRef.current = {
                teamId: teamId ?? null,
                role: role as PresenceUser['role'],
              }
            }
          } else {
            try {
              authUid = await ensureRoomFirebaseAuth({
                roomId,
                role,
                teamId,
                token: effectiveAuthToken,
              })
              logPresenceDebug('auth-success', {
                roomId,
                role,
                teamId,
                tokenPresent: true,
                authUid,
              })
              setPresenceAuthError(false)
            } catch (error) {
              logPresenceDebug('auth-failed', {
                roomId,
                role,
                teamId,
                tokenPresent: true,
                error: error instanceof Error ? error.message : String(error),
              })
              console.error('[presence] anonymous auth failed', error)
              setPresenceAuthError(true)
              setPresenceLoaded(true)
              if (role === 'LEADER') {
                localPresenceRef.current = {
                  teamId: teamId ?? null,
                  role: role as PresenceUser['role'],
                }
              }
            }
          }
        }
        if (cancelled) return
        const { rtdb } = getAuctionClientServices()

        // 1. 로컬 연결 상태 모니터링 (FR-006)
        const connectedRef = ref(rtdb, '.info/connected')
        const unsubConnected = onValue(connectedRef, (snap) => {
          const connected = snap.val() === true
          logPresenceDebug('connection-state', {
            roomId,
            role,
            teamId,
            connected,
          })
          setLocalConnected(connected)
        })
        unsubs.push(unsubConnected)

        // 1-1. 서버 시간 오프셋 추적 (입찰 타이머 동기화용)
        const offsetRef = ref(rtdb, '.info/serverTimeOffset')
        const unsubOffset = onValue(offsetRef, (snap) => {
          setRealtimeData({ serverTimeOffset: snap.val() || 0 })
        })
        unsubs.push(unsubOffset)

        // 2. 존재 기록 (LEADER 또는 ORGANIZER만 수행, FR-004)
        if (authUid && shouldRegisterSelf) {
          setPresenceAuthError(false)
          myPresenceRef = ref(rtdb, `presence/${roomId}/${authUid}`)

          const record: PresenceRecord = {
            teamId: teamId ?? null,
            teamName: teamName ?? '',
            role,
            connectedAt: serverTimestamp(),
          }
          onDisconnect(myPresenceRef).remove()
          await set(myPresenceRef, record)
          if (cancelled) return
          localPresenceRef.current = {
            teamId: teamId ?? null,
            role: role as PresenceUser['role'],
          }
          logPresenceDebug('self-registered', {
            roomId,
            role,
            teamId,
            authUid,
          })
        }

        // 3. 전체 presence 구독 (모든 역할 수행, FR-001)
        const allPresenceRef = ref(rtdb, `presence/${roomId}`)
        let presenceDebounceTimer: ReturnType<typeof setTimeout> | null = null
        const unsubPresence = onValue(allPresenceRef, (snapshot) => {
          const data = snapshot.val()

          const nextPresences: PresenceUser[] = (() => {
            if (!data) {
              const localPresence = localPresenceRef.current
              return localPresence ? [localPresence] : []
            }
            const presences: PresenceUser[] = Object.values(
              data as Record<string, { teamId: string | null; role: string | null }>,
            ).map((p) => ({
              teamId: p.teamId ?? null,
              role: (p.role as PresenceUser['role']) ?? null,
            }))
            const localPresence = localPresenceRef.current
            const hasLocalPresence =
              !localPresence ||
              presences.some(
                (presence) =>
                  presence.role === localPresence.role &&
                  presence.teamId === localPresence.teamId,
              )
            return hasLocalPresence || !localPresence
              ? presences
              : [...presences, localPresence]
          })()

          if (presenceDebounceTimer) clearTimeout(presenceDebounceTimer)
          presenceDebounceTimer = setTimeout(() => {
            setPresenceLoaded(true)
            setRealtimeData({ presences: nextPresences })
            logPresenceDebug('snapshot-applied', {
              roomId,
              role,
              teamId,
              presenceCount: nextPresences.length,
              hasLocalPresence: !!localPresenceRef.current,
            })
          }, 50)
        })
        unsubs.push(unsubPresence)
        unsubs.push(() => { if (presenceDebounceTimer) clearTimeout(presenceDebounceTimer) })
      } catch (error) {
        logPresenceDebug('setup-failed', {
          roomId,
          role,
          teamId,
          error: error instanceof Error ? error.message : String(error),
        })
        console.error('[presence] setup failed', error)
        setPresenceAuthError(true)
        setPresenceLoaded(true)
      }
    }

    void run()

    return () => {
      cancelled = true
      logPresenceDebug('cleanup', { roomId, role, teamId })
      if (myPresenceRef) {
        set(myPresenceRef, null)
      }
      localPresenceRef.current = null
      unsubs.forEach((unsub) => unsub())
    }
  }, [
    roomId,
    teamId,
    role,
    teamName,
    authToken,
    roomAuthToken,
    disableRoomFirebaseAuth,
    setRealtimeData,
    setPresenceLoaded,
    setLocalConnected,
    setPresenceAuthError,
  ])
}
