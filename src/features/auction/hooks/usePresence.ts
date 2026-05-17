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
}

type PresenceRecord = {
  teamId: string | null
  teamName: string
  role: string | null
  connectedAt: ReturnType<typeof serverTimestamp>
}

/**
 * Firebase RTDB 기반 Presence 훅.
 * onDisconnect를 활용하여 연결 끊김 시 자동으로 presence 정보를 제거한다.
 */
export function useFirebasePresence({ roomId, teamId, role, teamName, authToken }: PresenceOptions) {
  const setRealtimeData = useAuctionStore(s => s.setRealtimeData)
  const setPresenceLoaded = useAuctionStore(s => s.setPresenceLoaded)
  const setLocalConnected = useAuctionStore(s => s.setLocalConnected)
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
        if (role === 'LEADER' && !teamId) {
          setPresenceLoaded(true)
          return
        }

        const authUid = await ensureRoomFirebaseAuth({
          roomId,
          role,
          teamId,
          token: authToken ?? null,
        })
        if (cancelled) return
        const { rtdb } = getAuctionClientServices()

        // 1. 로컬 연결 상태 모니터링 (FR-006)
        const connectedRef = ref(rtdb, '.info/connected')
        const unsubConnected = onValue(connectedRef, (snap) => {
          setLocalConnected(snap.val() === true)
        })
        unsubs.push(unsubConnected)

        // 1-1. 서버 시간 오프셋 추적 (입찰 타이머 동기화용)
        const offsetRef = ref(rtdb, '.info/serverTimeOffset')
        const unsubOffset = onValue(offsetRef, (snap) => {
          setRealtimeData({ serverTimeOffset: snap.val() || 0 })
        })
        unsubs.push(unsubOffset)

        // 2. 존재 기록 (LEADER 또는 ORGANIZER만 수행, FR-004)
        if (authUid && (role === 'LEADER' || role === 'ORGANIZER')) {
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
        }

        // 3. 전체 presence 구독 (모든 역할 수행, FR-001)
        const allPresenceRef = ref(rtdb, `presence/${roomId}`)
        const unsubPresence = onValue(allPresenceRef, (snapshot) => {
          const data = snapshot.val()

          setPresenceLoaded(true)

          if (!data) {
            const localPresence = localPresenceRef.current
            setRealtimeData({ presences: localPresence ? [localPresence] : [] })
            return
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
          setRealtimeData({
            presences: hasLocalPresence || !localPresence
              ? presences
              : [...presences, localPresence],
          })
        })
        unsubs.push(unsubPresence)
      } catch (error) {
        console.error('[presence] anonymous auth failed', error)
        setPresenceLoaded(true)
      }
    }

    void run()

    return () => {
      cancelled = true
      if (myPresenceRef) {
        set(myPresenceRef, null)
      }
      localPresenceRef.current = null
      unsubs.forEach((unsub) => unsub())
    }
  }, [roomId, teamId, role, teamName, authToken, setRealtimeData, setPresenceLoaded, setLocalConnected])
}
