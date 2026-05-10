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
import {
  applyAuctionEventToState,
  getAuctionExpiryWakeUpDelay,
  getAuctionRecoveryKey,
  getNextReAuctionRoundState,
  shouldRecoverExpiredAuction,
  type AuctionEventEnvelope,
} from '../utils/auctionRealtime'
import { recordAuctionLatencyMarker } from '../utils/latencyDebug'
import { getAuctionClientServices } from '../realtime/clientAdapter'
import { bucketAuctionPlayers, findCurrentAuctionPlayerId } from '../store/auctionSelectors'

// Firestore 문서 데이터 → Store 타입 변환 헬퍼
interface FirestoreRoomData {
  name?: string
  base_point?: number
  members_per_team?: number
  captain_mode?: string
  total_teams?: number
  timer_ends_at?: Timestamp | null
  current_player_id?: string | null
  active_bid?: LiveBidState | null
  auction_revision?: number
  last_auction_event?: AuctionEventEnvelope | null
  created_at?: Timestamp | null
  roomDeleted?: boolean
  next_auction_duration_ms?: number | null
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
const RECOVERY_GRACE_MS = 1_500

function timestampToISO(ts: Timestamp | null | undefined): string | null {
  if (!ts) return null
  return ts.toDate().toISOString()
}

function shouldSkipRealtimeAuctionEvent() {
  if (typeof window === 'undefined') return false
  const searchParams = new URLSearchParams(window.location.search)
  return (
    searchParams.get('skipAuctionEvent') === '1' ||
    window.localStorage.getItem('skipAuctionEvent') === '1'
  )
}

function recordBidLatencyFromEvent(
  event: AuctionEventEnvelope,
  source: 'rtdb' | 'room-fallback',
) {
  if (event.type !== 'BID_PLACED') return
  recordAuctionLatencyMarker({
    eventId: event.eventId,
    roomId: event.roomId,
    playerId: event.currentPlayerId ?? event.liveBid?.player_id ?? null,
    teamId: event.liveBid?.team_id ?? null,
    amount: event.liveBid?.amount ?? null,
    revision: event.revision,
    serverCreatedAt: event.serverCreatedAt,
    appliedAt: Date.now(),
    source,
  })
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
  const setMessages = useAuctionStore(s => s.setMessages)
  const appendMessage = useAuctionStore(s => s.appendMessage)
  const setAuctionEventRevision = useAuctionStore(s => s.setAuctionEventRevision)
  const setReAuctionRound = useAuctionStore(s => s.setReAuctionRound)

  const currentPlayerIdRef = useRef<string | null>(null)
  const bidsUnsubRef = useRef<Unsubscribe | null>(null)
  const lastRecoveryKeyRef = useRef<string | null>(null)
  const expiryWakeUpTimeoutRef = useRef<number | null>(null)
  const latestMessageInitRef = useRef(true)
  const lastLiveMessageIdRef = useRef<string | null>(null)
  const auctionEventHistoryInitRef = useRef(true)
  const auctionEventLiveRef = useRef(false)

  useEffect(() => {
    if (!roomId) return
    auctionEventLiveRef.current = false

    const clearExpiryWakeUp = () => {
      if (expiryWakeUpTimeoutRef.current !== null) {
        window.clearTimeout(expiryWakeUpTimeoutRef.current)
        expiryWakeUpTimeoutRef.current = null
      }
    }

    const triggerRecovery = (
      timerEndsAt: string | null,
      currentPlayerId: string | null,
      revision: number,
    ) => {
      if (!timerEndsAt || !currentPlayerId) {
        lastRecoveryKeyRef.current = null
        return
      }
      const recovery = shouldRecoverExpiredAuction({
        effectiveRole,
        currentPlayerId,
        timerEndsAt,
        graceMs: RECOVERY_GRACE_MS,
        recoveryKey: getAuctionRecoveryKey({
          currentPlayerId,
          timerEndsAt,
          revision,
        }),
        lastRecoveryKey: lastRecoveryKeyRef.current,
      })
      if (recovery.shouldRecover && recovery.recoveryKey) {
        lastRecoveryKeyRef.current = recovery.recoveryKey
        void recoverExpiredAuction(roomId)
      }
    }

    const scheduleExpiryWakeUp = (
      timerEndsAt: string | null,
      currentPlayerId: string | null,
      revision: number,
    ) => {
      clearExpiryWakeUp()
      if (!timerEndsAt || !currentPlayerId) {
        lastRecoveryKeyRef.current = null
        return
      }

      const delay = getAuctionExpiryWakeUpDelay(
        timerEndsAt,
        Date.now(),
        RECOVERY_GRACE_MS,
      )
      expiryWakeUpTimeoutRef.current = window.setTimeout(() => {
        expiryWakeUpTimeoutRef.current = null
        triggerRecovery(timerEndsAt, currentPlayerId, revision)
      }, delay)
    }

    if (E2E_AUCTION_FIXTURE) {
      let cancelled = false
      const fixtureFallbackMode =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('fixtureFallbackMode') === '1'
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
            lastAuctionEvent?: AuctionEventEnvelope | null
            revision: number
          }
          if (cancelled) return

          if (!fixtureFallbackMode) {
            setAuctionEventRevision(data.revision)
            setLiveBid(data.liveBid ?? null)
          }
          setLotteryPlayer(data.lotteryPlayer ?? null)
          setRealtimeData({
            roomName: data.roomName,
            basePoint: data.basePoint,
            totalTeams: data.totalTeams,
            membersPerTeam: data.membersPerTeam,
            captainMode: normalizeCaptainMode(data.captainMode),
            timerEndsAt: data.timerEndsAt,
            currentPlayerId: findCurrentAuctionPlayerId(data.players),
            createdAt: data.createdAt,
            teams: data.teams,
            players: data.players,
            bids: data.bids,
            presences: data.presences,
          })
          setMessages(data.messages)

          if (fixtureFallbackMode && data.lastAuctionEvent?.eventId) {
            const next = applyAuctionEventToState(useAuctionStore.getState(), data.lastAuctionEvent)
            if (next.applied) {
              recordBidLatencyFromEvent(data.lastAuctionEvent, 'room-fallback')
              setLiveBid(next.liveBid)
              setLotteryPlayer(next.lotteryPlayer)
              setAuctionEventRevision(next.revision)
              setRealtimeData({
                players: next.players,
                teams: next.teams,
                timerEndsAt: next.timerEndsAt,
                currentPlayerId: next.currentPlayerId,
              })
            }
          }
          if (
            !fixtureFallbackMode &&
            data.lastAuctionEvent?.eventId &&
            data.lastAuctionEvent.revision >= data.revision
          ) {
            recordBidLatencyFromEvent(data.lastAuctionEvent, 'rtdb')
          }

          const currentPlayerId = findCurrentAuctionPlayerId(data.players)
          if (data.timerEndsAt && currentPlayerId) {
          }
          scheduleExpiryWakeUp(data.timerEndsAt, currentPlayerId, data.revision)
          triggerRecovery(data.timerEndsAt, currentPlayerId, data.revision)
        } catch {
          // polling retry on next tick
        }
      }

      void sync()
      const intervalId = window.setInterval(() => {
        void sync()
      }, 100)
      return () => {
        cancelled = true
        window.clearInterval(intervalId)
      }
    }

    const { firestore, rtdb } = getAuctionClientServices()

    const projectCurrentPlayerIntoStore = (currentPlayerId: string | null) => {
      if (!currentPlayerId) return
      const state = useAuctionStore.getState()
      if (state.players.length === 0) return
      const alreadyProjected = state.players.some(
        (player) =>
          player.id === currentPlayerId && player.status === 'IN_AUCTION',
      )
      if (alreadyProjected) return
      const hasCurrentPlayer = state.players.some((player) => player.id === currentPlayerId)
      if (!hasCurrentPlayer) return

      setRealtimeData({
        players: state.players.map((player) =>
          player.id === currentPlayerId
            ? { ...player, status: 'IN_AUCTION' }
            : player.status === 'IN_AUCTION'
              ? { ...player, status: 'WAITING' }
              : player,
        ),
        currentPlayerId,
      })
    }

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

      const roomRevision = data.auction_revision ?? 0
      const currentAuctionRevision = useAuctionStore.getState().auctionEventRevision
      // RTDB 이벤트가 이미 더 최신 상태를 적용했으면 Firestore 스냅샷의 경매 상태값으로 덮어쓰지 않음
      // >= 대신 > 사용: 같은 revision의 RTDB 이벤트가 먼저 적용되었을 때 Firestore snapshot이 덮어쓰는 것 방지
      const snapshotIsCurrentOrNewer = roomRevision > currentAuctionRevision
      const fallbackEvent = data.last_auction_event ?? null

      setRealtimeData({
        roomName: data.name ?? null,
        basePoint: data.base_point ?? 1000,
        membersPerTeam: data.members_per_team ?? 5,
        captainMode: normalizeCaptainMode(data.captain_mode),
        totalTeams: data.total_teams ?? 0,
        createdAt: timestampToISO(data.created_at),
        nextAuctionDurationMs: data.next_auction_duration_ms ?? null,
        ...(snapshotIsCurrentOrNewer && {
          // 더 최신 revision의 Firestore snapshot은 정본이다.
          // threshold 기반 입찰 연장은 로컬 상태보다 짧은 타이머를 내릴 수 있다.
          // 테스트용 RTDB BID_PLACED 누적 타이머 확인을 위해 입찰 snapshot의 timer 덮어쓰기를 막는다.
          // timerEndsAt: (() => {
          //   const newTimer = timestampToISO(data.timer_ends_at)
          //   const newPlayerId = data.current_player_id ?? null
          //   // 경매 종료(currentPlayerId=null) 시에는 timerEndsAt도 null로 정리
          //   if (!newPlayerId) return null
          //   return newTimer
          // })(),
          timerEndsAt: data.current_player_id
            ? timestampToISO(data.timer_ends_at)
            : null,
          currentPlayerId: data.current_player_id ?? null,
        }),
      })
      if (snapshotIsCurrentOrNewer) {
        setLiveBid(data.active_bid ?? null)
      }

      if (fallbackEvent?.eventId && roomRevision > useAuctionStore.getState().auctionEventRevision) {
        // Firestore 스냅샷이 RTDB보다 먼저 도착하는 레이스 컨디션 대응:
        // timerDurationMs가 있으면 브라우저 클럭 기준 타이머로 변환 (RTDB live 이벤트와 동일 처리)
        const resolvedFallbackEvent: AuctionEventEnvelope =
          fallbackEvent.timerDurationMs != null &&
          (fallbackEvent.type === 'BID_PLACED' ||
            fallbackEvent.type === 'AUCTION_STARTED' ||
            fallbackEvent.type === 'AUCTION_RESUMED')
            ? {
                ...fallbackEvent,
                timerEndsAt: new Date(Date.now() + fallbackEvent.timerDurationMs).toISOString(),
              }
            : fallbackEvent
        const next = applyAuctionEventToState(useAuctionStore.getState(), resolvedFallbackEvent)
        if (next.applied) {
          setReAuctionRound(
            getNextReAuctionRoundState({
              current: useAuctionStore.getState().isReAuctionRound,
              eventType: fallbackEvent.type,
            }),
          )
          recordBidLatencyFromEvent(fallbackEvent, 'room-fallback')
          setLiveBid(next.liveBid)
          setLotteryPlayer(next.lotteryPlayer)
          setAuctionEventRevision(next.revision)
          setRealtimeData({
            players: next.players,
            teams: next.teams,
            timerEndsAt: next.timerEndsAt,
            currentPlayerId: next.currentPlayerId,
          })
        }
      }
      // 테스트용 RTDB BID_PLACED 누적 타이머 확인을 위해 bid room snapshot의 revision 선반영을 막는다.
      // if (
      //   roomRevision > useAuctionStore.getState().auctionEventRevision &&
      //   data.current_player_id &&
      //   data.timer_ends_at &&
      //   data.active_bid
      // ) {
      //   setAuctionEventRevision(roomRevision)
      // }

      if (LATENCY_DEBUG && data.timer_ends_at) {
        console.info('[latency][client] room snapshot timer', {
          roomId,
          timerEndsAt: timestampToISO(data.timer_ends_at),
          receivedAt: Date.now(),
        })
      }

      const timerEndsAtIso = timestampToISO(data.timer_ends_at)
      const currentPlayerId = data.current_player_id ?? null
      if (roomRevision >= useAuctionStore.getState().auctionEventRevision) {
        scheduleExpiryWakeUp(timerEndsAtIso, currentPlayerId, roomRevision)
        triggerRecovery(timerEndsAtIso, currentPlayerId, roomRevision)
      }

      // current_player_id 변경 시 bids 구독 갱신
      const newPlayerId = currentPlayerId
      if (newPlayerId !== currentPlayerIdRef.current) {
        currentPlayerIdRef.current = newPlayerId
        setLiveBid(data.active_bid ?? null)
        projectCurrentPlayerIntoStore(newPlayerId)
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
        const state = useAuctionStore.getState()
        const { playersById } = bucketAuctionPlayers(players)
        const snapshotCurrentPlayerId = findCurrentAuctionPlayerId(players)

        if (snapshotCurrentPlayerId) {
          setRealtimeData({ players, currentPlayerId: snapshotCurrentPlayerId })
          return
        }

        if (
          state.currentPlayerId &&
          playersById.has(state.currentPlayerId)
        ) {
          const snapshotStatus = playersById.get(state.currentPlayerId)?.status
          // SOLD/UNSOLD는 터미널 상태 — Firestore 정본을 그대로 신뢰하고 IN_AUCTION 강제 금지
          if (snapshotStatus === 'SOLD' || snapshotStatus === 'UNSOLD') {
            setRealtimeData({ players, currentPlayerId: null })
            return
          }
          setRealtimeData({
            players: players.map((player) =>
              player.id === state.currentPlayerId
                ? { ...player, status: 'IN_AUCTION' }
                : player.status === 'IN_AUCTION'
                  ? { ...player, status: 'WAITING' }
                  : player,
            ),
            currentPlayerId: state.currentPlayerId,
          })
          return
        }

        setRealtimeData({ players, currentPlayerId: null })
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
      setMessages(messages)
    })
    unsubs.push(messagesUnsub)

    const applyAuctionEvent = (event: AuctionEventEnvelope) => {
      const state = useAuctionStore.getState()
      const next = applyAuctionEventToState(state, event)
      if (!next.applied) {
        return
      }
      setReAuctionRound(
        getNextReAuctionRoundState({
          current: state.isReAuctionRound,
          eventType: event.type,
        }),
      )
      recordBidLatencyFromEvent(event, 'rtdb')
      setLiveBid(next.liveBid)
      setLotteryPlayer(next.lotteryPlayer)
      setAuctionEventRevision(next.revision)
      setRealtimeData({
        players: next.players,
        teams: next.teams,
        timerEndsAt: next.timerEndsAt,
        currentPlayerId: next.currentPlayerId,
      })
      scheduleExpiryWakeUp(next.timerEndsAt, next.currentPlayerId, next.revision)
      triggerRecovery(next.timerEndsAt, next.currentPlayerId, next.revision)
    }

    const applyAuctionEventHistory = (events: AuctionEventEnvelope[]) => {
      const nextEvents = [...events]
        .filter((event) => !!event?.eventId)
        .sort((a, b) => a.revision - b.revision)

      for (const event of nextEvents) {
        if (event.revision > useAuctionStore.getState().auctionEventRevision) {
          applyAuctionEvent(event)
        }
      }
    }

    // 5. RTDB: 단일 경매 이벤트 감시
    // 실시간 이벤트는 timerDurationMs로 클럭 스큐 없이 타이머를 브라우저 기준 리셋
    const applyLiveAuctionEvent = (event: AuctionEventEnvelope) => {
      const resolved: AuctionEventEnvelope =
        event.timerDurationMs != null &&
        (event.type === 'BID_PLACED' ||
          event.type === 'AUCTION_STARTED' ||
          event.type === 'AUCTION_RESUMED')
          ? {
              ...event,
              timerEndsAt: new Date(
                Date.now() + event.timerDurationMs,
              ).toISOString(),
            }
          : event
      applyAuctionEvent(resolved)
    }

    const auctionEventRef = ref(rtdb, `signals/${roomId}/auctionEvent`)
    const auctionEventUnsub = onValue(auctionEventRef, (snapshot) => {
      if (shouldSkipRealtimeAuctionEvent()) {
        return
      }
      const data = snapshot.val() as AuctionEventEnvelope | null
      if (!data?.eventId) {
        return
      }
      if (!auctionEventLiveRef.current) {
        // 최초 구독 시 수신되는 초기값은 절대 타임스탬프 사용 (과거 이벤트일 수 있음)
        auctionEventLiveRef.current = true
        applyAuctionEvent(data)
      } else {
        applyLiveAuctionEvent(data)
      }
    })
    unsubs.push(() => auctionEventUnsub())

    const auctionEventHistoryRef = ref(rtdb, `signals/${roomId}/auctionEvents`)
    auctionEventHistoryInitRef.current = true
    const auctionEventHistoryUnsub = onValue(auctionEventHistoryRef, (snapshot) => {
      const data = snapshot.val() as Record<string, AuctionEventEnvelope> | null
      if (auctionEventHistoryInitRef.current) {
        auctionEventHistoryInitRef.current = false
      }
      if (!data) {
        return
      }
      applyAuctionEventHistory(Object.values(data))
    })
    unsubs.push(() => auctionEventHistoryUnsub())

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

      const existingState = useAuctionStore.getState()
      const liveEventId = data.event_id ?? data.id
      const alreadyExists =
        !!existingState.messagesById[liveEventId] ||
        existingState.orderedMessageIds.some((id) => {
          const message = existingState.messagesById[id]
          return (message?.event_id ?? message?.id) === liveEventId
        })
      if (alreadyExists) {
        lastLiveMessageIdRef.current = data.id
        return
      }

      lastLiveMessageIdRef.current = data.id
      appendMessage(data)
    })
    unsubs.push(() => latestMessageUnsub())

    return () => {
      clearExpiryWakeUp()
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
    setMessages,
    appendMessage,
    setAuctionEventRevision,
    setReAuctionRound,
  ])
}
