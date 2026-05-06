'use client'

import { useEffect } from 'react'
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
export function useFirebasePresence({ roomId, teamId, role, teamName }: PresenceOptions) {
  const setRealtimeData = useAuctionStore(s => s.setRealtimeData)
  const setPresenceLoaded = useAuctionStore(s => s.setPresenceLoaded)
  const setLocalConnected = useAuctionStore(s => s.setLocalConnected)

  useEffect(() => {
    if (!roomId) return
    if (E2E_AUCTION_FIXTURE) {
      setPresenceLoaded(true)
      setLocalConnected(true)
      return
    }

    let cancelled = false
    const { rtdb } = getAuctionClientServices()
    const unsubs: (() => void)[] = []
    let myPresenceRef: ReturnType<typeof ref> | null = null

    const run = async () => {
      try {
        const authUid = await ensureRoomFirebaseAuth({
          roomId,
          role,
          teamId,
        })
        if (cancelled) return

        // 1. 로컬 연결 상태 모니터링 (FR-006)
        const connectedRef = ref(rtdb, '.info/connected')
        const unsubConnected = onValue(connectedRef, (snap) => {
          setLocalConnected(snap.val() === true)
        })
        unsubs.push(unsubConnected)

        // 2. 존재 기록 (LEADER 또는 ORGANIZER만 수행, FR-004)
        if (authUid && (role === 'LEADER' || role === 'ORGANIZER')) {
          myPresenceRef = ref(rtdb, `presence/${roomId}/${authUid}`)

          const record: PresenceRecord = {
            teamId: teamId ?? null,
            teamName: teamName ?? '',
            role,
            connectedAt: serverTimestamp(),
          }
          set(myPresenceRef, record)
          onDisconnect(myPresenceRef).remove()
        }

        // 3. 전체 presence 구독 (모든 역할 수행, FR-001)
        const allPresenceRef = ref(rtdb, `presence/${roomId}`)
        const unsubPresence = onValue(allPresenceRef, (snapshot) => {
          const data = snapshot.val()

          setPresenceLoaded(true)

          if (!data) {
            setRealtimeData({ presences: [] })
            return
          }
          const presences: PresenceUser[] = Object.values(
            data as Record<string, { teamId: string | null; role: string | null }>,
          ).map((p) => ({
            teamId: p.teamId ?? null,
            role: (p.role as PresenceUser['role']) ?? null,
          }))
          setRealtimeData({ presences })
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
      unsubs.forEach((unsub) => unsub())
    }
  }, [roomId, teamId, role, teamName, setRealtimeData, setPresenceLoaded, setLocalConnected])
}
