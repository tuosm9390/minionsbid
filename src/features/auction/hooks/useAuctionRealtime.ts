'use client'

import { useEffect, useRef } from 'react'
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
import { ref, onValue } from 'firebase/database'
import { useAuctionStore } from '../store/useAuctionStore'
import type { Bid, Team, Player, Message, Role, PresenceUser, LiveBidState } from '../store/useAuctionStore'
import { normalizeCaptainMode } from '../utils/roster'
import { recoverExpiredAuction } from '../api/auctionActions'
import { applyAuctionEventToState, type AuctionEventEnvelope } from '../utils/auctionRealtime'
import { getAuctionClientServices } from '../realtime/clientAdapter'

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
const E2E_AUCTION_FIXTURE = process.env.NEXT_PUBLIC_E2E_AUCTION_FIXTURE === '1'

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
export function useFirebaseRealtime(roomId: string, effectiveRole?: Role | null) {
  const setRealtimeData = useAuctionStore(s => s.setRealtimeData)
  const setRoomNotFound = useAuctionStore(s => s.setRoomNotFound)
  const setLotteryPlayer = useAuctionStore(s => s.setLotteryPlayer)
  const setLiveBid = useAuctionStore(s => s.setLiveBid)
  const appendMessage = useAuctionStore(s => s.appendMessage)
  const setAuctionEventRevision = useAuctionStore(s => s.setAuctionEventRevision)

  const currentPlayerIdRef = useRef<string | null>(null)
  const bidsUnsubRef = useRef<Unsubscribe | null>(null)
  const lastRecoveryKeyRef = useRef<string | null>(null)
  // CLOSE_LOTTERY 초기값 무시를 위한 ref
  const auctionEventInitRef = useRef(true)
  const latestMessageInitRef = useRef(true)
  const lastLiveMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!roomId) return

    if (E2E_AUCTION_FIXTURE) {
      let cancelled = false
      const sync = async () => {
        try {
          const response = await fetch(
            `/api/e2e/auction-fixture/state?roomId=${encodeURIComponent(roomId)}`,
            { cache: 'no-store' },
          )
          if (!response.ok) {
            if (response.status === 404) setRoomNotFound()
            return
          }

          const data = (await response.json()) as {
            roomName: string
            basePoint: number
            totalTeams: number
            membersPerTeam: number
            captainMode: string
            timerEndsAt: string | null
            createdAt: string
            teams: Team[]
            players: Player[]
            bids: Bid[]
            messages: Message[]
            presences: PresenceUser[]
            lotteryPlayer: Player | null
            liveBid: LiveBidState | null
            revision: number
          }
          if (cancelled) return

          setAuctionEventRevision(data.revision)
          setLiveBid(data.liveBid ?? null)
          setLotteryPlayer(data.lotteryPlayer ?? null)
          setRealtimeData({
            roomName: data.roomName,
            basePoint: data.basePoint,
            totalTeams: data.totalTeams,
            membersPerTeam: data.membersPerTeam,
            captainMode: normalizeCaptainMode(data.captainMode),
            timerEndsAt: data.timerEndsAt,
            createdAt: data.createdAt,
            teams: data.teams,
            players: data.players,
            bids: data.bids,
            messages: data.messages,
            presences: data.presences,
          })

          const currentPlayerId =
            data.players.find((player) => player.status === 'IN_AUCTION')?.id ?? null
          if (data.timerEndsAt && currentPlayerId) {
            const recoveryKey = `${currentPlayerId}:${data.timerEndsAt}`
            const isExpired = new Date(data.timerEndsAt).getTime() <= Date.now()
            if (
              effectiveRole === 'ORGANIZER' &&
              isExpired &&
              lastRecoveryKeyRef.current !== recoveryKey
            ) {
              lastRecoveryKeyRef.current = recoveryKey
              void recoverExpiredAuction(roomId)
            }
          } else {
            lastRecoveryKeyRef.current = null
          }
        } catch {
          // polling retry on next tick
        }
      }

      void sync()
      const intervalId = window.setInterval(() => {
        void sync()
      }, 200)
      return () => {
        cancelled = true
        window.clearInterval(intervalId)
      }
    }

    const { firestore, rtdb } = getAuctionClientServices()

    const unsubs: Unsubscribe[] = []

    // 1. Room 문서 구독
    const roomUnsub = onSnapshot(doc(firestore, 'rooms', roomId), (snap) => {
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
        if (
          effectiveRole === 'ORGANIZER' &&
          isExpired &&
          lastRecoveryKeyRef.current !== recoveryKey
        ) {
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
            collection(firestore, 'rooms', roomId, 'bids'),
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
      collection(firestore, 'rooms', roomId, 'teams'),
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
      collection(firestore, 'rooms', roomId, 'players'),
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
      collection(firestore, 'rooms', roomId, 'messages'),
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

    const applyAuctionEvent = (event: AuctionEventEnvelope) => {
      const state = useAuctionStore.getState()
      const next = applyAuctionEventToState(state, event)
      if (!next.applied) {
        return
      }
      setLiveBid(next.liveBid)
      setLotteryPlayer(next.lotteryPlayer)
      setAuctionEventRevision(next.revision)
      setRealtimeData({
        players: next.players,
        teams: next.teams,
        timerEndsAt: next.timerEndsAt,
      })
    }

    // 5. RTDB: 단일 경매 이벤트 감시
    const auctionEventRef = ref(rtdb, `signals/${roomId}/auctionEvent`)
    auctionEventInitRef.current = true
    const auctionEventUnsub = onValue(auctionEventRef, (snapshot) => {
      if (auctionEventInitRef.current) {
        auctionEventInitRef.current = false
        return
      }
      const data = snapshot.val() as AuctionEventEnvelope | null
      if (!data?.eventId) {
        return
      }
      applyAuctionEvent(data)
    })
    unsubs.push(() => auctionEventUnsub())

    // 6. RTDB: 실시간 시스템 메시지 감시
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
  }, [
    roomId,
    effectiveRole,
    setRealtimeData,
    setRoomNotFound,
    setLotteryPlayer,
    setLiveBid,
    appendMessage,
    setAuctionEventRevision,
  ])
}
