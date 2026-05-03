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

describe('useFirebaseRealtime', () => {
  beforeEach(() => {
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

  it('auctionEvent BID_PLACED를 받아 timerEndsAt과 liveBid를 갱신한다', () => {
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

  it('만료 복구는 ORGANIZER에서만 시도한다', () => {
    renderHook(() => useFirebaseRealtime('room-1', 'VIEWER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date(Date.now() - 1000),
        },
        current_player_id: 'player-1',
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
    })

    expect(recoverExpiredAuction).not.toHaveBeenCalled()

    roomSnapshotListeners.length = 0
    genericSnapshotListeners.length = 0
    valueListeners.clear()
    recoverExpiredAuction.mockReset()

    renderHook(() => useFirebaseRealtime('room-1', 'ORGANIZER'))

    act(() => {
      emitRoomSnapshot({
        name: '테스트방',
        timer_ends_at: {
          toDate: () => new Date(Date.now() - 1000),
        },
        current_player_id: 'player-1',
        created_at: {
          toDate: () => new Date('2026-04-29T00:00:00.000Z'),
        },
      })
    })

    expect(recoverExpiredAuction).toHaveBeenCalledWith('room-1')
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

  it('RTDB auctionEvent를 의도적으로 건너뛰어도 room snapshot fallback으로 복구한다', () => {
    window.history.replaceState({}, '', '/?skipAuctionEvent=1')

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
})
