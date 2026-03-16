'use client'

import { useEffect } from 'react'
import { getDatabase, ref, set, onDisconnect, onValue, serverTimestamp } from 'firebase/database'
import { useAuctionStore, type PresenceUser } from '../store/useAuctionStore'

interface PresenceOptions {
  roomId: string
  teamId: string | null
  role: string | null
  teamName?: string
}

/**
 * Firebase RTDB 기반 Presence 훅.
 * onDisconnect를 활용하여 연결 끊김 시 자동으로 presence 정보를 제거한다.
 */
export function useFirebasePresence({ roomId, teamId, role, teamName }: PresenceOptions) {
  const setRealtimeData = useAuctionStore(s => s.setRealtimeData)

  useEffect(() => {
    if (!roomId || (role !== 'LEADER' && role !== 'ORGANIZER')) return

    const rtdb = getDatabase()
    const sessionId = `${teamId ?? 'organizer'}_${Date.now()}`
    const presenceRef = ref(rtdb, `presence/${roomId}/${sessionId}`)

    // 연결 시 존재 기록
    set(presenceRef, {
      teamId: teamId ?? null,
      teamName: teamName ?? '',
      role,
      connectedAt: serverTimestamp(),
    })

    // 연결 끊기면 자동 삭제
    onDisconnect(presenceRef).remove()

    // 전체 presence 구독
    const allPresenceRef = ref(rtdb, `presence/${roomId}`)
    const unsubPresence = onValue(allPresenceRef, (snapshot) => {
      const data = snapshot.val()
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

    return () => {
      set(presenceRef, null)
      unsubPresence()
    }
  }, [roomId, teamId, role, teamName, setRealtimeData])
}
