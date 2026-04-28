'use client'

import { useEffect, useRef } from 'react'
import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limitToLast,
  where,
  Unsubscribe,
  Timestamp,
} from 'firebase/firestore'
import { getDatabase, ref, onValue } from 'firebase/database'
import { useAuctionStore } from '../store/useAuctionStore'
import type { Bid, Team, Player, Message } from '../store/useAuctionStore'
import { normalizeCaptainMode } from '../utils/roster'
import { recoverExpiredAuction } from '../api/auctionActions'

// Firestore 문서 데이터 → Store 타입 변환 헬퍼
interface FirestoreRoomData {
  name?: string
  base_point?: number
  members_per_team?: number
  captain_mode?: string
  total_teams?: number
  timer_ends_at?: Timestamp | null
  current_player_id?: string | null
  created_at?: Timestamp | null
  roomDeleted?: boolean
}

interface FirestoreTeamData {
  name?: string
  point_balance?: number
  leader_name?: string
  leader_position?: string
  leader_description?: string
  captain_points?: number
}

interface FirestorePlayerData {
  name?: string
  tier?: string
  main_position?: string
  sub_position?: string
  status?: string
  team_id?: string | null
  sold_price?: number | null
  description?: string
  room_id?: string
}

interface FirestoreBidData {
  player_id?: string
  team_id?: string
  amount?: number
  created_at?: Timestamp | null
}

interface FirestoreMessageData {
  event_id?: string
  sender_name?: string
  sender_role?: string
  content?: string
  created_at?: Timestamp | null
}

const LATENCY_DEBUG = process.env.NEXT_PUBLIC_DEBUG_LATENCY === '1'

function timestampToISO(ts: Timestamp | null | undefined): string | null {
  if (!ts) return null
  return ts.toDate().toISOString()
}

/**
 * Firebase Firestore + RTDB 기반 실시간 구독 훅.
 *
 * Supabase Broadcast-primary 아키텍처를 대체:
 * - Firestore onSnapshot: rooms, teams, players, messages, bids 실시간 동기화
 * - RTDB onValue: CLOSE_LOTTERY 신호 감시
 *
 * onSnapshot이 초기 데이터 + 실시간 변경을 자동 제공하므로 fetchAll 불필요.
 */
export function useFirebaseRealtime(roomId: string) {
  const setRealtimeData = useAuctionStore(s => s.setRealtimeData)
  const setRoomNotFound = useAuctionStore(s => s.setRoomNotFound)
  const setLotteryPlayer = useAuctionStore(s => s.setLotteryPlayer)
  const setLiveBid = useAuctionStore(s => s.setLiveBid)
  const appendMessage = useAuctionStore(s => s.appendMessage)

  const currentPlayerIdRef = useRef<string | null>(null)
  const bidsUnsubRef = useRef<Unsubscribe | null>(null)
  const lastRecoveryKeyRef = useRef<string | null>(null)
  // CLOSE_LOTTERY 초기값 무시를 위한 ref
  const closeLotteryInitRef = useRef(true)
  const timerExtendedInitRef = useRef(true)
  const latestBidInitRef = useRef(true)
  const latestMessageInitRef = useRef(true)
  const lastLiveMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!roomId) return

    const unsubs: Unsubscribe[] = []

    // 1. Room 문서 구독
    const roomUnsub = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
      if (!snap.exists()) {
        setRoomNotFound()
        return
      }
      const data = snap.data() as FirestoreRoomData

      if (data.roomDeleted) {
        setRoomNotFound()
        return
      }

      setRealtimeData({
        roomName: data.name ?? null,
        basePoint: data.base_point ?? 1000,
        membersPerTeam: data.members_per_team ?? 5,
        captainMode: normalizeCaptainMode(data.captain_mode),
        totalTeams: data.total_teams ?? 0,
        timerEndsAt: timestampToISO(data.timer_ends_at),
        createdAt: timestampToISO(data.created_at),
      })

      if (LATENCY_DEBUG && data.timer_ends_at) {
        console.info('[latency][client] room snapshot timer', {
          roomId,
          timerEndsAt: timestampToISO(data.timer_ends_at),
          receivedAt: Date.now(),
        })
      }

      const timerEndsAtIso = timestampToISO(data.timer_ends_at)
      const currentPlayerId = data.current_player_id ?? null
      if (timerEndsAtIso && currentPlayerId) {
        const recoveryKey = `${currentPlayerId}:${timerEndsAtIso}`
        const isExpired = new Date(timerEndsAtIso).getTime() <= Date.now()
        if (isExpired && lastRecoveryKeyRef.current !== recoveryKey) {
          lastRecoveryKeyRef.current = recoveryKey
          void recoverExpiredAuction(roomId)
        }
      } else {
        lastRecoveryKeyRef.current = null
      }

      // current_player_id 변경 시 bids 구독 갱신
      const newPlayerId = currentPlayerId
      if (newPlayerId !== currentPlayerIdRef.current) {
        currentPlayerIdRef.current = newPlayerId
        setLiveBid(null)
        bidsUnsubRef.current?.()

        if (newPlayerId) {
          const bidsQuery = query(
            collection(db, 'rooms', roomId, 'bids'),
            where('player_id', '==', newPlayerId),
            orderBy('amount', 'desc'),
          )
          bidsUnsubRef.current = onSnapshot(bidsQuery, (bidsSnap) => {
            const bids: Bid[] = bidsSnap.docs.map((d) => {
              const bd = d.data() as FirestoreBidData
              return {
                id: d.id,
                room_id: roomId,
                player_id: bd.player_id ?? '',
                team_id: bd.team_id ?? '',
                amount: bd.amount ?? 0,
                created_at: timestampToISO(bd.created_at) ?? new Date().toISOString(),
              }
            })
            setRealtimeData({ bids })
          })
        } else {
          bidsUnsubRef.current = null
          setRealtimeData({ bids: [] })
        }
      }
    })
    unsubs.push(roomUnsub)

    // 2. Teams 구독
    const teamsUnsub = onSnapshot(
      collection(db, 'rooms', roomId, 'teams'),
      (snap) => {
        const teams: Team[] = snap.docs.map((d) => {
          const td = d.data() as FirestoreTeamData
          return {
            id: d.id,
            room_id: roomId,
            name: td.name ?? '',
            point_balance: td.point_balance ?? 0,
            leader_name: td.leader_name ?? '',
            leader_position: td.leader_position ?? '',
            leader_description: td.leader_description ?? '',
            captain_points: td.captain_points ?? 0,
          }
        })
        setRealtimeData({ teams })
      },
    )
    unsubs.push(teamsUnsub)

    // 3. Players 구독
    const playersUnsub = onSnapshot(
      collection(db, 'rooms', roomId, 'players'),
      (snap) => {
        const players: Player[] = snap.docs.map((d) => {
          const pd = d.data() as FirestorePlayerData
          return {
            id: d.id,
            room_id: roomId,
            name: pd.name ?? '',
            tier: pd.tier ?? '',
            main_position: pd.main_position ?? '',
            sub_position: pd.sub_position ?? '',
            status: (pd.status ?? 'WAITING') as Player['status'],
            team_id: pd.team_id ?? null,
            sold_price: pd.sold_price ?? null,
            description: pd.description ?? '',
          }
        })
        setRealtimeData({ players })
      },
    )
    unsubs.push(playersUnsub)

    // 4. Messages 구독 (최근 200개)
    const messagesQuery = query(
      collection(db, 'rooms', roomId, 'messages'),
      orderBy('created_at'),
      limitToLast(200),
    )
    const messagesUnsub = onSnapshot(messagesQuery, (snap) => {
      const messages: Message[] = snap.docs.map((d) => {
        const md = d.data() as FirestoreMessageData
        return {
          id: d.id,
          event_id: md.event_id ?? d.id,
          room_id: roomId,
          sender_name: md.sender_name ?? '',
          sender_role: (md.sender_role ?? 'SYSTEM') as Message['sender_role'],
          content: md.content ?? '',
          created_at: timestampToISO(md.created_at) ?? new Date().toISOString(),
        }
      })
      setRealtimeData({ messages })
    })
    unsubs.push(messagesUnsub)

    // 5. RTDB: CLOSE_LOTTERY 신호 감시
    const rtdb = getDatabase()
    const signalRef = ref(rtdb, `signals/${roomId}/closeLottery`)
    closeLotteryInitRef.current = true
    const signalUnsub = onValue(signalRef, (snapshot) => {
      // 초기 로드 시 이미 존재하는 값은 무시
      if (closeLotteryInitRef.current) {
        closeLotteryInitRef.current = false
        return
      }
      if (snapshot.exists()) {
        setLotteryPlayer(null)
      }
    })
    unsubs.push(() => signalUnsub())

    // 6. RTDB: 타이머 연장 신호 감시
    const timerExtendedRef = ref(rtdb, `signals/${roomId}/timerExtended`)
    timerExtendedInitRef.current = true
    const timerExtendedUnsub = onValue(timerExtendedRef, (snapshot) => {
      if (timerExtendedInitRef.current) {
        timerExtendedInitRef.current = false
        return
      }

      const data = snapshot.val() as { timerEndsAt?: string } | null
      if (data?.timerEndsAt) {
        if (LATENCY_DEBUG) {
          console.info('[latency][client] RTDB timerExtended signal', {
            roomId,
            timerEndsAt: data.timerEndsAt,
            receivedAt: Date.now(),
          })
        }
        setRealtimeData({ timerEndsAt: data.timerEndsAt })
      }
    })
    unsubs.push(() => timerExtendedUnsub())

    // 7. RTDB: 실시간 최고 입찰 신호 감시
    const latestBidRef = ref(rtdb, `signals/${roomId}/latestBid`)
    latestBidInitRef.current = true
    const latestBidUnsub = onValue(latestBidRef, (snapshot) => {
      if (latestBidInitRef.current) {
        latestBidInitRef.current = false
        return
      }

      const data = snapshot.val() as Bid | null
      if (!data || !currentPlayerIdRef.current) {
        setLiveBid(null)
        return
      }

      if (data.player_id !== currentPlayerIdRef.current) {
        return
      }

      setLiveBid({
        player_id: data.player_id,
        team_id: data.team_id,
        amount: data.amount,
        created_at: data.created_at,
      })
    })
    unsubs.push(() => latestBidUnsub())

    // 8. RTDB: 실시간 시스템 메시지 감시
    const latestMessageRef = ref(rtdb, `signals/${roomId}/latestMessage`)
    latestMessageInitRef.current = true
    const latestMessageUnsub = onValue(latestMessageRef, (snapshot) => {
      if (latestMessageInitRef.current) {
        latestMessageInitRef.current = false
        return
      }

      const data = snapshot.val() as Message | null
      if (!data?.id) {
        return
      }

      if (lastLiveMessageIdRef.current === data.id) {
        return
      }

      const existingMessages = useAuctionStore.getState().messages
      const liveEventId = data.event_id ?? data.id
      const alreadyExists = existingMessages.some(
        (message) => (message.event_id ?? message.id) === liveEventId,
      )
      if (alreadyExists) {
        lastLiveMessageIdRef.current = data.id
        return
      }

      lastLiveMessageIdRef.current = data.id
      appendMessage(data)
    })
    unsubs.push(() => latestMessageUnsub())

    return () => {
      unsubs.forEach((unsub) => unsub())
      bidsUnsubRef.current?.()
    }
  }, [roomId, setRealtimeData, setRoomNotFound, setLotteryPlayer, setLiveBid, appendMessage])
}
