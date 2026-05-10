import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFirebaseRealtime } from '@/features/auction/hooks/useAuctionRealtime'
import { useAuctionStore } from '@/features/auction/store/useAuctionStore'

const {
  roomSnapshotListeners,
  genericSnapshotListeners,
  valueListeners,
  recoverExpiredAuction,
} = vi.hoisted(() => ({
  roomSnapshotListeners: [] as Array<
    (snap: { exists: () => boolean; data: () => unknown }) => void
  >,
  genericSnapshotListeners: [] as Array<
    (snap: { docs: Array<{ id: string; data: () => unknown }> }) => void
  >,
  valueListeners: new Map<
    string,
    (snap: { val: () => unknown; exists: () => boolean }) => void
  >(),
  recoverExpiredAuction: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  app: {},
  db: {},
}))

vi.mock('@/features/auction/api/auctionActions', () => ({
  recoverExpiredAuction,
}))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => ({ kind: 'doc', path: args.join('/') }),
  collection: (...args: unknown[]) => ({ kind: 'collection', path: args.join('/') }),
  query: (...args: unknown[]) => ({ kind: 'query', args }),
  where: (...args: unknown[]) => ({ kind: 'where', args }),
  orderBy: (...args: unknown[]) => ({ kind: 'orderBy', args }),
  limitToLast: (count: number) => ({ kind: 'limitToLast', count }),
  onSnapshot: (
    target: { kind: string; path?: string },
    callback: (snap: unknown) => void,
  ) => {
    if (target.kind === 'doc') {
      roomSnapshotListeners.push(callback as (snap: { exists: () => boolean; data: () => unknown }) => void)
    } else {
      genericSnapshotListeners.push(callback as (snap: { docs: Array<{ id: string; data: () => unknown }> }) => void)
    }
    return () => undefined
  },
  Timestamp: class {},
}))

vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path: string) => ({ path }),
  onValue: (
    target: { path: string },
    callback: (snap: { val: () => unknown; exists: () => boolean }) => void,
  ) => {
    valueListeners.set(target.path, callback)
    return () => {
      valueListeners.delete(target.path)
    }
  },
}))

function emitRoomSnapshot(data: Record<string, unknown>) {
  for (const listener of roomSnapshotListeners) {
    listener({
      exists: () => true,
      data: () => data,
    })
  }
}

function emitAuctionEvent(path: string, value: unknown) {
  const listener = valueListeners.get(path)
  if (!listener) {
    throw new Error(`No listener for path ${path}`)
  }
  listener({
    val: () => value,
    exists: () => value != null,
  })
}

function emitAuctionEventHistory(roomId: string, events: Array<Record<string, unknown>>) {
  emitAuctionEvent(
    `signals/${roomId}/auctionEvents`,
    Object.fromEntries(events.map((event) => [String(event.eventId), event])),
  )
}

function setNow(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

function emitCollectionSnapshot(
  index: number,
  docs: Array<{ id: string; data: Record<string, unknown> }>,
) {
  const listener = genericSnapshotListeners[index]
  if (!listener) {
    throw new Error(`No generic snapshot listener at index ${index}`)
  }
  listener({
    docs: docs.map((doc) => ({
      id: doc.id,
      data: () => doc.data,
    })),
  })
}

describe('useFirebaseRealtime', () => {
  beforeEach(() => {
    vi.useRealTimers()
    window.history.replaceState({}, '', '/')
    window.localStorage.clear()
    roomSnapshotListeners.length = 0
    genericSnapshotListeners.length = 0
    valueListeners.clear()
    recoverExpiredAuction.mockReset()
    useAuctionStore.setState({
      roomId: 'room-1',
      roomName: null,
      role: 'VIEWER',
      teamId: 'team-1',
      captainMode: 'IN_ROSTER',
      basePoint: 1000,
      totalTeams: 2,
      membersPerTeam: 5,
      timerEndsAt: null,
      createdAt: null,
      roomExists: true,
      isRoomLoaded: false,
      isReAuctionRound: false,
      auctionEventRevision: 0,
      teams: [],
      bids: [],
      liveBid: null,
      players: [],
      messagesById: {},
      orderedMessageIds: [],
      presences: [],
      isPresenceLoaded: false,
      isLocalConnected: true,
      lotteryPlayer: null,
    })
  })

  it('auctionEvent BID_PLACED를 받으면 서버의 timerEndsAt을 사용한다', () => {
    setNow('2026-04-29T00:00:01.000Z')
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
        current_player_id: 'player-1',
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
    })

    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', null)
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'bid-1',
        revision: 10,
        roomId: 'room-1',
        type: 'BID_PLACED',
        serverCreatedAt: '2026-04-29T00:00:01.000Z',
        timerEndsAt: '2026-04-29T00:00:05.000Z',
        liveBid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-04-29T00:00:01.000Z',
        },
      })
    })

    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:05.000Z')
    expect(useAuctionStore.getState().liveBid).toMatchObject({
      player_id: 'player-1',
      team_id: 'team-2',
      amount: 110,
    })
    expect(useAuctionStore.getState().auctionEventRevision).toBe(10)
  })

  it('append-only auctionEvents history도 더 최신 revision을 적용한다', () => {
    setNow('2026-04-29T00:00:01.000Z')
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
        current_player_id: 'player-1',
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
      emitAuctionEventHistory('room-1', [
        {
          eventId: 'bid-history-1',
          revision: 11,
          roomId: 'room-1',
          type: 'BID_PLACED',
          serverCreatedAt: '2026-04-29T00:00:01.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-04-29T00:00:05.000Z',
          liveBid: {
            player_id: 'player-1',
            team_id: 'team-2',
            amount: 110,
            created_at: '2026-04-29T00:00:01.000Z',
          },
        },
      ])
    })

    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:05.000Z')
    expect(useAuctionStore.getState().liveBid).toMatchObject({
      team_id: 'team-2',
      amount: 110,
    })
    expect(useAuctionStore.getState().auctionEventRevision).toBe(11)
  })

  it('더 낮은 revision의 auctionEvent는 무시한다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
        current_player_id: 'player-1',
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
      emitAuctionEvent('signals/room-1/auctionEvent', null)
    })

    useAuctionStore.setState({
      timerEndsAt: '2026-04-29T00:00:09.000Z',
      liveBid: {
        player_id: 'player-1',
        team_id: 'team-1',
        amount: 200,
        created_at: '2026-04-29T00:00:02.000Z',
      },
      auctionEventRevision: 20,
    })

    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'bid-old',
        revision: 10,
        roomId: 'room-1',
        type: 'BID_PLACED',
        serverCreatedAt: '2026-04-29T00:00:01.000Z',
        timerEndsAt: '2026-04-29T00:00:05.000Z',
        liveBid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-04-29T00:00:01.000Z',
        },
      })
    })

    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:09.000Z')
    expect(useAuctionStore.getState().liveBid).toMatchObject({
      team_id: 'team-1',
      amount: 200,
    })
    expect(useAuctionStore.getState().auctionEventRevision).toBe(20)
  })

  it('만료 복구는 모든 역할에서 시도한다', () => {
    // VIEWER도 만료된 경매를 감지하면 복구 시도 (서버 액션 멱등성 보장)
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date(Date.now() - 2_000),
        },
        current_player_id: 'player-1',
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
    })

    expect(recoverExpiredAuction).toHaveBeenCalledWith('room-1')

    roomSnapshotListeners.length = 0
    genericSnapshotListeners.length = 0
    valueListeners.clear()
    recoverExpiredAuction.mockReset()

    // ORGANIZER도 동일하게 복구 시도
    renderHook(() => useFirebaseRealtime('room-1', 'ORGANIZER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date(Date.now() - 2_000),
        },
        current_player_id: 'player-1',
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
    })

    expect(recoverExpiredAuction).toHaveBeenCalledWith('room-1')
  })

  it('미래 만료 시각은 시간 경과만으로 recoverExpiredAuction을 깨운다', async () => {
    vi.useFakeTimers()
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date(Date.now() + 3_000),
        },
        current_player_id: 'player-1',
        auction_revision: 7,
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
    })

    expect(recoverExpiredAuction).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500)
    })

    expect(recoverExpiredAuction).toHaveBeenCalledTimes(1)
    expect(recoverExpiredAuction).toHaveBeenCalledWith('room-1')
  })

  it('같은 recovery key에서는 wake-up과 snapshot이 겹쳐도 중복 복구를 막는다', async () => {
    vi.useFakeTimers()
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    const expiredAt = new Date(Date.now() + 2_000)
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => expiredAt,
        },
        current_player_id: 'player-1',
        auction_revision: 9,
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500)
    })

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => expiredAt,
        },
        current_player_id: 'player-1',
        auction_revision: 9,
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
    })

    expect(recoverExpiredAuction).toHaveBeenCalledTimes(1)
  })

  it('재경매 플래그는 RE_AUCTION_STARTED에서 올라오고 AUCTION_STARTED에서도 유지된다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', null)
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'reauction-1',
        revision: 3,
        roomId: 'room-1',
        type: 'RE_AUCTION_STARTED',
        serverCreatedAt: '2026-04-29T00:00:00.000Z',
        playerIdsToWaiting: ['player-1'],
      })
    })

    expect(useAuctionStore.getState().isReAuctionRound).toBe(true)

    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'start-4',
        revision: 4,
        roomId: 'room-1',
        type: 'AUCTION_STARTED',
        serverCreatedAt: '2026-04-29T00:00:01.000Z',
        currentPlayerId: 'player-1',
        timerEndsAt: '2026-04-29T00:00:06.000Z',
      })
    })

    expect(useAuctionStore.getState().isReAuctionRound).toBe(true)
  })

  it('players snapshot이 SOLD terminal 상태를 내리면 stale currentPlayerId를 비운다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    useAuctionStore.setState({
      currentPlayerId: 'player-1',
      players: [
        {
          id: 'player-1',
          room_id: 'room-1',
          name: 'Alpha',
          tier: 'S',
          main_position: 'TOP',
          sub_position: '',
          status: 'IN_AUCTION',
          team_id: null,
          sold_price: null,
          description: '',
        },
      ],
    })

    act(() => {
      emitCollectionSnapshot(1, [
        {
          id: 'player-1',
          data: {
            room_id: 'room-1',
            name: 'Alpha',
            tier: 'S',
            main_position: 'TOP',
            sub_position: '',
            status: 'SOLD',
            team_id: 'team-1',
            sold_price: 100,
            description: '',
          },
        },
      ])
    })

    expect(useAuctionStore.getState().currentPlayerId).toBeNull()
    expect(useAuctionStore.getState().players[0]).toMatchObject({
      status: 'SOLD',
      team_id: 'team-1',
      sold_price: 100,
    })
  })

  it('입찰 시 RTDB BID_PLACED 이벤트로 서버의 timerEndsAt이 적용된다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    // 경매 시작: 10초 타이머, revision 5
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-04-29T00:00:10.000Z') },
        current_player_id: 'player-1',
        auction_revision: 5,
        last_auction_event: {
          eventId: 'start-1',
          revision: 5,
          roomId: 'room-1',
          type: 'AUCTION_STARTED',
          serverCreatedAt: '2026-04-29T00:00:00.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-04-29T00:00:10.000Z',
          liveBid: null,
        },
        created_at: { toDate: () => new Date('2026-04-29T00:00:00.000Z') },
      })
      emitAuctionEvent('signals/room-1/auctionEvent', null)
    })

    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:10.000Z')
    expect(useAuctionStore.getState().auctionEventRevision).toBe(5)

    // 타이머 4초 남은 상황에서 다른 팀장 입찰 → RTDB 수신 시점에 5초 누적
    setNow('2026-04-29T00:00:06.000Z')
    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'bid-6',
        revision: 6,
        roomId: 'room-1',
        type: 'BID_PLACED',
        serverCreatedAt: '2026-04-29T00:00:06.000Z',
        currentPlayerId: 'player-1',
        timerEndsAt: '2026-04-29T00:00:11.000Z',
        liveBid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-04-29T00:00:06.000Z',
        },
      })
    })

    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:11.000Z')
    expect(useAuctionStore.getState().auctionEventRevision).toBe(6)
    expect(useAuctionStore.getState().liveBid).toMatchObject({
      team_id: 'team-2',
      amount: 110,
    })
  })

  it('Firestore snapshot이 RTDB보다 먼저 도착해도 timerEndsAt이 올바르게 갱신된다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    // 경매 시작: 10초 타이머, revision 5
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-04-29T00:00:10.000Z') },
        current_player_id: 'player-1',
        auction_revision: 5,
        last_auction_event: {
          eventId: 'start-1',
          revision: 5,
          roomId: 'room-1',
          type: 'AUCTION_STARTED',
          serverCreatedAt: '2026-04-29T00:00:00.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-04-29T00:00:10.000Z',
          liveBid: null,
        },
        created_at: { toDate: () => new Date('2026-04-29T00:00:00.000Z') },
      })
      emitAuctionEvent('signals/room-1/auctionEvent', null)
    })

    expect(useAuctionStore.getState().auctionEventRevision).toBe(5)

    // Firestore snapshot이 먼저 도착해도 BID_PLACED 이벤트 적용 시점에 5초 누적
    setNow('2026-04-29T00:00:06.000Z')
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-04-29T00:00:11.000Z') },
        current_player_id: 'player-1',
        active_bid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-04-29T00:00:06.000Z',
        },
        auction_revision: 6,
        last_auction_event: {
          eventId: 'bid-6',
          revision: 6,
          roomId: 'room-1',
          type: 'BID_PLACED',
          serverCreatedAt: '2026-04-29T00:00:06.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-04-29T00:00:11.000Z',
          liveBid: {
            player_id: 'player-1',
            team_id: 'team-2',
            amount: 110,
            created_at: '2026-04-29T00:00:06.000Z',
          },
        },
        created_at: { toDate: () => new Date('2026-04-29T00:00:00.000Z') },
      })
    })

    // Firestore fallback도 같은 BID_PLACED 적용 함수를 타며 서버의 timerEndsAt을 사용한다.
    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:11.000Z')
    expect(useAuctionStore.getState().auctionEventRevision).toBe(6)

    // RTDB가 뒤늦게 도착 - revision 이미 6이므로 SKIP
    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'bid-6',
        revision: 6,
        roomId: 'room-1',
        type: 'BID_PLACED',
        serverCreatedAt: '2026-04-29T00:00:06.000Z',
        currentPlayerId: 'player-1',
        timerEndsAt: '2026-04-29T00:00:11.000Z',
        liveBid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-04-29T00:00:06.000Z',
        },
      })
    })

    // RTDB 스킵 후에도 서버 timerEndsAt이 유지
    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:11.000Z')
    expect(useAuctionStore.getState().auctionEventRevision).toBe(6)
    expect(useAuctionStore.getState().liveBid).toMatchObject({
      team_id: 'team-2',
      amount: 110,
    })
  })

  it('RTDB가 먼저 적용된 후 오래된 Firestore 스냅샷이 와도 timerEndsAt을 덮어쓰지 않는다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    // 경매 시작: revision 5, 타이머 10초
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-04-29T00:00:10.000Z') },
        current_player_id: 'player-1',
        auction_revision: 5,
        last_auction_event: {
          eventId: 'start-1',
          revision: 5,
          roomId: 'room-1',
          type: 'AUCTION_STARTED',
          serverCreatedAt: '2026-04-29T00:00:00.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-04-29T00:00:10.000Z',
          liveBid: null,
        },
        created_at: { toDate: () => new Date('2026-04-29T00:00:00.000Z') },
      })
      emitAuctionEvent('signals/room-1/auctionEvent', null)
    })

    expect(useAuctionStore.getState().auctionEventRevision).toBe(5)

    // RTDB가 먼저 도착: revision 6, 서버가 12초로 갱신
    setNow('2026-04-29T00:00:07.000Z')
    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'bid-6',
        revision: 6,
        roomId: 'room-1',
        type: 'BID_PLACED',
        serverCreatedAt: '2026-04-29T00:00:07.000Z',
        currentPlayerId: 'player-1',
        timerEndsAt: '2026-04-29T00:00:12.000Z',
        liveBid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-04-29T00:00:07.000Z',
        },
      })
    })

    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:12.000Z')
    expect(useAuctionStore.getState().auctionEventRevision).toBe(6)

    // 오래된 Firestore 스냅샷 도착 (revision 5, 구형 타이머) → snapshotIsCurrentOrNewer=false → 무시
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-04-29T00:00:10.000Z') },
        current_player_id: 'player-1',
        auction_revision: 5,
        last_auction_event: {
          eventId: 'start-1',
          revision: 5,
          roomId: 'room-1',
          type: 'AUCTION_STARTED',
          serverCreatedAt: '2026-04-29T00:00:00.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-04-29T00:00:10.000Z',
          liveBid: null,
        },
        created_at: { toDate: () => new Date('2026-04-29T00:00:00.000Z') },
      })
    })

    // RTDB가 적용한 서버 timerEndsAt이 유지되어야 함
    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:12.000Z')
    expect(useAuctionStore.getState().auctionEventRevision).toBe(6)
  })

  it('last_auction_event 없는 Firestore snapshot은 timerEndsAt과 liveBid를 덮어쓰지 않는다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    // step1: AUCTION_STARTED fallback event로 타이머 세팅
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-04-29T00:00:10.000Z') },
        current_player_id: 'player-1',
        auction_revision: 5,
        last_auction_event: {
          eventId: 'start-1',
          revision: 5,
          roomId: 'room-1',
          type: 'AUCTION_STARTED',
          serverCreatedAt: '2026-04-29T00:00:00.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-04-29T00:00:10.000Z',
          liveBid: null,
        },
        created_at: { toDate: () => new Date('2026-04-29T00:00:00.000Z') },
      })
    })

    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:10.000Z')

    // step2: active_bid는 있지만 last_auction_event 없는 snapshot — timerEndsAt/liveBid 변경 안 됨
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-04-29T00:00:06.000Z') },
        current_player_id: 'player-1',
        active_bid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-04-29T00:00:01.000Z',
        },
        auction_revision: 6,
        created_at: { toDate: () => new Date('2026-04-29T00:00:00.000Z') },
      })
    })

    // timerEndsAt은 step1 fallback 값 그대로 유지
    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:10.000Z')
    // liveBid는 AUCTION_STARTED에 의해 null — active_bid로 덮어쓰지 않음
    expect(useAuctionStore.getState().liveBid).toBeNull()
  })

  it('direct bid room snapshot만 먼저 와도 이후 RTDB BID_PLACED가 서버의 timerEndsAt을 올바르게 적용한다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    // step1: revision 5 스냅샷, timer = 12:00:03
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-05-04T12:00:03.000Z') },
        current_player_id: 'player-1',
        auction_revision: 5,
        created_at: { toDate: () => new Date('2026-05-04T12:00:00.000Z') },
      })
      emitAuctionEvent('signals/room-1/auctionEvent', null)
    })

    // step2: revision 6 Firestore 스냅샷, active_bid, 서버가 타이머를 12:00:07로 연장
    // last_auction_event 없음 → auctionEventRevision = 0 유지
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-05-04T12:00:07.000Z') },
        current_player_id: 'player-1',
        active_bid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-05-04T12:00:02.000Z',
        },
        auction_revision: 6,
        last_auction_event: null,
        created_at: { toDate: () => new Date('2026-05-04T12:00:00.000Z') },
      })
    })

    // Firestore last_auction_event 없어 timerEndsAt 미갱신, auctionEventRevision = 0
    expect(useAuctionStore.getState().timerEndsAt).toBeNull()
    expect(useAuctionStore.getState().auctionEventRevision).toBe(0)

    // step3: RTDB BID_PLACED 도착, Firestore와 같은 서버 값 timerEndsAt = 12:00:07
    // revision 6 > 0 → apply → auctionEventRevision = 6
    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'bid-6',
        revision: 6,
        roomId: 'room-1',
        type: 'BID_PLACED',
        serverCreatedAt: '2026-05-04T12:00:02.000Z',
        currentPlayerId: 'player-1',
        timerEndsAt: '2026-05-04T12:00:07.000Z',
        liveBid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-05-04T12:00:02.000Z',
        },
      })
    })

    // 서버의 timerEndsAt이 그대로 적용되어야 함
    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-05-04T12:00:07.000Z')
    expect(useAuctionStore.getState().auctionEventRevision).toBe(6)
  })

  it('이미 더 최신 revision을 적용한 뒤 오래된 room snapshot은 만료 복구 타이머도 예약하지 않는다', async () => {
    vi.useFakeTimers()
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    useAuctionStore.setState({
      auctionEventRevision: 6,
      timerEndsAt: new Date(Date.now() + 8_000).toISOString(),
      currentPlayerId: 'player-1',
    })

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date(Date.now() + 1_000) },
        current_player_id: 'player-1',
        auction_revision: 5,
        created_at: { toDate: () => new Date('2026-05-04T12:00:00.000Z') },
      })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    expect(recoverExpiredAuction).not.toHaveBeenCalled()
  })

  it('채팅, 입찰 기록, 선수 snapshot fanout은 적용된 timerEndsAt을 변경하지 않는다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2099-05-04T12:00:07.000Z') },
        current_player_id: 'player-1',
        auction_revision: 6,
        created_at: { toDate: () => new Date('2026-05-04T12:00:00.000Z') },
      })
    })

    useAuctionStore.setState({
      timerEndsAt: '2099-05-04T12:00:07.000Z',
      auctionEventRevision: 6,
      currentPlayerId: 'player-1',
      liveBid: {
        player_id: 'player-1',
        team_id: 'team-2',
        amount: 110,
        created_at: '2026-05-04T12:00:02.000Z',
      },
    })

    act(() => {
      emitAuctionEvent('signals/room-1/latestMessage', null)
      emitAuctionEvent('signals/room-1/latestMessage', {
        id: 'msg-bid-6',
        event_id: 'bid-6:system',
        room_id: 'room-1',
        sender_name: '시스템',
        sender_role: 'SYSTEM',
        content: '💰 Red이 20P에 입찰했습니다!',
        created_at: '2026-05-04T12:00:02.100Z',
      })
      emitCollectionSnapshot(2, [
        {
          id: 'msg-bid-6',
          data: {
            event_id: 'bid-6:system',
            sender_name: '시스템',
            sender_role: 'SYSTEM',
            content: '💰 Red이 20P에 입찰했습니다!',
            created_at: { toDate: () => new Date('2026-05-04T12:00:02.100Z') },
          },
        },
      ])
      emitCollectionSnapshot(1, [
        {
          id: 'player-1',
          data: {
            room_id: 'room-1',
            name: 'Alpha',
            tier: 'S',
            main_position: 'TOP',
            sub_position: '',
            status: 'IN_AUCTION',
            team_id: null,
            sold_price: null,
            description: '',
          },
        },
      ])
    })

    expect(useAuctionStore.getState().timerEndsAt).toBe('2099-05-04T12:00:07.000Z')
    expect(useAuctionStore.getState().auctionEventRevision).toBe(6)
  })

  it('RTDB 이벤트를 놓쳐도 room snapshot의 last_auction_event로 즉시 복구한다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date('2026-04-29T00:00:05.000Z'),
        },
        current_player_id: 'player-1',
        active_bid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-04-29T00:00:01.000Z',
        },
        auction_revision: 11,
        last_auction_event: {
          eventId: 'bid-fallback-1',
          revision: 11,
          roomId: 'room-1',
          type: 'BID_PLACED',
          serverCreatedAt: '2026-04-29T00:00:01.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-04-29T00:00:05.000Z',
          liveBid: {
            player_id: 'player-1',
            team_id: 'team-2',
            amount: 110,
            created_at: '2026-04-29T00:00:01.000Z',
          },
        },
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
    })

    expect(useAuctionStore.getState().liveBid).toMatchObject({
      team_id: 'team-2',
      amount: 110,
    })
    expect(useAuctionStore.getState().auctionEventRevision).toBe(11)
  })

  it('last_auction_event 없는 room snapshot이 먼저 와도 같은 revision RTDB 낙찰 이벤트를 무시하지 않는다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    useAuctionStore.setState({
      auctionEventRevision: 37,
      timerEndsAt: '2026-05-06T00:39:28.161Z',
      currentPlayerId: 'player-1',
      players: [
        {
          id: 'player-1',
          room_id: 'room-1',
          name: 'Alpha',
          tier: 'S',
          main_position: 'TOP',
          sub_position: '',
          status: 'IN_AUCTION',
          team_id: null,
          sold_price: null,
          description: '',
        },
      ],
      teams: [
        {
          id: 'team-1',
          room_id: 'room-1',
          name: 'Team A',
          point_balance: 100,
          leader_name: '',
          leader_position: '',
          leader_description: '',
          captain_points: 0,
        },
      ],
      liveBid: {
        player_id: 'player-1',
        team_id: 'team-1',
        amount: 30,
        created_at: '2026-05-06T00:39:23.091Z',
      },
    })

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: null,
        current_player_id: null,
        active_bid: null,
        auction_revision: 38,
        created_at: { toDate: () => new Date('2026-05-06T00:00:00.000Z') },
      })
    })

    expect(useAuctionStore.getState().auctionEventRevision).toBe(37)

    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'award-38',
        revision: 38,
        roomId: 'room-1',
        type: 'PLAYER_AWARDED',
        serverCreatedAt: '2026-05-06T00:39:29.700Z',
        currentPlayerId: null,
        timerEndsAt: null,
        liveBid: null,
        player: {
          id: 'player-1',
          status: 'SOLD',
          team_id: 'team-1',
          sold_price: 30,
        },
        team: {
          id: 'team-1',
          point_balance: 70,
        },
      })
    })

    expect(useAuctionStore.getState().auctionEventRevision).toBe(38)
    expect(useAuctionStore.getState().timerEndsAt).toBeNull()
    expect(useAuctionStore.getState().currentPlayerId).toBeNull()
    expect(useAuctionStore.getState().players[0]).toMatchObject({
      status: 'SOLD',
      team_id: 'team-1',
      sold_price: 30,
    })
    expect(useAuctionStore.getState().teams[0].point_balance).toBe(70)
  })

  it('RTDB auctionEvent를 의도적으로 건너뛰어도 room snapshot fallback으로 복구한다', () => {
    window.history.replaceState({}, '', '/?skipAuctionEvent=1')
    setNow('2026-04-29T00:00:01.000Z')

    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
        current_player_id: 'player-1',
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'bid-skipped-1',
        revision: 10,
        roomId: 'room-1',
        type: 'BID_PLACED',
        serverCreatedAt: '2026-04-29T00:00:01.000Z',
        currentPlayerId: 'player-1',
        timerEndsAt: '2026-04-29T00:00:05.000Z',
        liveBid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-04-29T00:00:01.000Z',
        },
      })
    })

    expect(useAuctionStore.getState().auctionEventRevision).toBe(0)
    expect(useAuctionStore.getState().liveBid).toBeNull()

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date('2026-04-29T00:00:05.000Z'),
        },
        current_player_id: 'player-1',
        active_bid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 110,
          created_at: '2026-04-29T00:00:01.000Z',
        },
        auction_revision: 10,
        last_auction_event: {
          eventId: 'bid-skipped-1',
          revision: 10,
          roomId: 'room-1',
          type: 'BID_PLACED',
          serverCreatedAt: '2026-04-29T00:00:01.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-04-29T00:00:05.000Z',
          liveBid: {
            player_id: 'player-1',
            team_id: 'team-2',
            amount: 110,
            created_at: '2026-04-29T00:00:01.000Z',
          },
        },
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
    })

    expect(useAuctionStore.getState().liveBid).toMatchObject({
      team_id: 'team-2',
      amount: 110,
    })
    expect(useAuctionStore.getState().timerEndsAt).toBe('2026-04-29T00:00:05.000Z')
    expect(useAuctionStore.getState().auctionEventRevision).toBe(10)
  })

  it('클라이언트 타이머 만료 후 지연된 RTDB BID_PLACED 도착 시 timerEndsAt이 5초로 갱신된다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    // 경매 시작: 타이머가 이미 만료된 과거 시간 (RTDB 지연 시뮬레이션)
    const expiredTimerAt = '2020-01-01T00:00:02.000Z' // 클라이언트 기준 만료된 시간
    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date(expiredTimerAt) },
        current_player_id: 'player-1',
        auction_revision: 5,
        last_auction_event: {
          eventId: 'start-1',
          revision: 5,
          roomId: 'room-1',
          type: 'AUCTION_STARTED',
          serverCreatedAt: '2020-01-01T00:00:00.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: expiredTimerAt,
          liveBid: null,
        },
        created_at: { toDate: () => new Date('2020-01-01T00:00:00.000Z') },
      })
      emitAuctionEvent('signals/room-1/auctionEvent', null)
    })

    expect(useAuctionStore.getState().timerEndsAt).toBe(expiredTimerAt)
    expect(useAuctionStore.getState().auctionEventRevision).toBe(5)

    // 지연된 RTDB BID_PLACED 도착 — 클라이언트 수신 시점부터 5초 누적
    const extendedTimerAt = '2099-12-31T23:59:59.000Z' // 이벤트 payload는 이 실험에서 타이머 계산에 쓰지 않는다.
    setNow('2099-12-31T23:59:54.000Z')
    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'bid-late-1',
        revision: 6,
        roomId: 'room-1',
        type: 'BID_PLACED',
        serverCreatedAt: '2020-01-01T00:00:02.500Z',
        currentPlayerId: 'player-1',
        timerEndsAt: extendedTimerAt,
        liveBid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 120,
          created_at: '2020-01-01T00:00:02.500Z',
        },
      })
    })

    // 만료됐던 타이머가 수신 시점 기준 5초 뒤로 갱신되어야 함
    expect(useAuctionStore.getState().timerEndsAt).toBe(extendedTimerAt)
    expect(useAuctionStore.getState().auctionEventRevision).toBe(6)
    expect(useAuctionStore.getState().liveBid).toMatchObject({
      team_id: 'team-2',
      amount: 120,
    })
  })

  it('RTDB-first와 Firestore-first 두 경로가 동일한 최종 상태를 만든다 (다중 클라이언트 일관성)', () => {
    setNow('2026-05-04T12:00:02.000Z')
    // ── Client A 시뮬레이션: RTDB 먼저 ──
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-05-04T12:00:03.000Z') },
        current_player_id: 'player-1',
        auction_revision: 5,
        last_auction_event: {
          eventId: 'start-1',
          revision: 5,
          roomId: 'room-1',
          type: 'AUCTION_STARTED',
          serverCreatedAt: '2026-05-04T12:00:00.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-05-04T12:00:03.000Z',
          liveBid: null,
        },
        created_at: { toDate: () => new Date('2026-05-04T12:00:00.000Z') },
      })
      emitAuctionEvent('signals/room-1/auctionEvent', null)
    })

    // RTDB 먼저 도착
    act(() => {
      emitAuctionEvent('signals/room-1/auctionEvent', {
        eventId: 'bid-mc-1',
        revision: 6,
        roomId: 'room-1',
        type: 'BID_PLACED',
        serverCreatedAt: '2026-05-04T12:00:02.000Z',
        currentPlayerId: 'player-1',
        timerEndsAt: '2026-05-04T12:00:07.000Z',
        liveBid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 200,
          created_at: '2026-05-04T12:00:02.000Z',
        },
      })
    })

    const clientAState = {
      timerEndsAt: useAuctionStore.getState().timerEndsAt,
      auctionEventRevision: useAuctionStore.getState().auctionEventRevision,
      liveBidAmount: useAuctionStore.getState().liveBid?.amount,
    }

    // ── Client B 시뮬레이션: Firestore 먼저 ──
    useAuctionStore.setState({
      timerEndsAt: '2026-05-04T12:00:03.000Z',
      auctionEventRevision: 5,
      currentPlayerId: 'player-1',
      liveBid: null,
      players: [],
      teams: [],
    })

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: { toDate: () => new Date('2026-05-04T12:00:07.000Z') },
        current_player_id: 'player-1',
        active_bid: {
          player_id: 'player-1',
          team_id: 'team-2',
          amount: 200,
          created_at: '2026-05-04T12:00:02.000Z',
        },
        auction_revision: 6,
        last_auction_event: {
          eventId: 'bid-mc-1',
          revision: 6,
          roomId: 'room-1',
          type: 'BID_PLACED',
          serverCreatedAt: '2026-05-04T12:00:02.000Z',
          currentPlayerId: 'player-1',
          timerEndsAt: '2026-05-04T12:00:07.000Z',
          liveBid: {
            player_id: 'player-1',
            team_id: 'team-2',
            amount: 200,
            created_at: '2026-05-04T12:00:02.000Z',
          },
        },
        created_at: { toDate: () => new Date('2026-05-04T12:00:00.000Z') },
      })
    })

    const clientBState = {
      timerEndsAt: useAuctionStore.getState().timerEndsAt,
      auctionEventRevision: useAuctionStore.getState().auctionEventRevision,
      liveBidAmount: useAuctionStore.getState().liveBid?.amount,
    }

    // 두 클라이언트의 최종 상태가 동일해야 함
    expect(clientAState.timerEndsAt).toBe(clientBState.timerEndsAt)
    expect(clientAState.auctionEventRevision).toBe(clientBState.auctionEventRevision)
    expect(clientAState.liveBidAmount).toBe(clientBState.liveBidAmount)
    expect(clientAState.timerEndsAt).toBe('2026-05-04T12:00:07.000Z')
    expect(clientAState.auctionEventRevision).toBe(6)
    expect(clientAState.liveBidAmount).toBe(200)
  })
})
