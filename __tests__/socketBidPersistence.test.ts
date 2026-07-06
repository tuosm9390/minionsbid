// Socket.IO accepted bid Firestore persistence 경계를 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { persistSocketAcceptedBid } from '@/features/auction/socket/socketBidPersistence'
import type { SocketAuctionAcceptedEvent } from '@/features/auction/socket/socketContracts'

const {
  txGet,
  txSet,
  txUpdate,
  runTransaction,
  roomDoc,
  collection,
} = vi.hoisted(() => {
  const txGet = vi.fn()
  const txSet = vi.fn()
  const txUpdate = vi.fn()
  const runTransaction = vi.fn()
  const roomDoc = {
    collection: vi.fn(() => ({
      doc: vi.fn((id: string) => ({ id, path: `rooms/room-1/bids/${id}` })),
    })),
  }
  const collection = vi.fn(() => ({
    doc: vi.fn(() => roomDoc),
  }))
  return { txGet, txSet, txUpdate, runTransaction, roomDoc, collection }
})

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection,
    runTransaction,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: (date: Date) => ({
      toMillis: () => date.getTime(),
      toDate: () => date,
    }),
  },
}))

describe('persistSocketAcceptedBid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    txGet.mockResolvedValue({
      exists: true,
      data: () => ({ auction_revision: 0 }),
    })
    runTransaction.mockImplementation(async (callback) =>
      callback({
        get: txGet,
        update: txUpdate,
        set: txSet,
      }),
    )
  })

  it('accepted bid를 room active_bid와 bids subcollection에 저장한다', async () => {
    const event: SocketAuctionAcceptedEvent = {
      type: 'bid:accepted',
      requestId: 'request-1',
      eventId: 'socket-bid-room-1-1-request-1',
      state: {
        roomId: 'room-1',
        sequence: 1,
        phase: 'ACTIVE',
        currentPlayerId: 'player-1',
        timerEndsAt: '2030-01-01T00:00:08.000Z',
        lastEventId: 'socket-bid-room-1-1-request-1',
        serverTime: new Date('2030-01-01T00:00:00.000Z').getTime(),
        currentBid: {
          eventId: 'socket-bid-room-1-1-request-1',
          requestId: 'request-1',
          playerId: 'player-1',
          teamId: 'team-blue',
          amount: 10,
          createdAt: '2030-01-01T00:00:00.000Z',
        },
        teams: [],
      },
    }

    await persistSocketAcceptedBid(event)

    expect(txUpdate).toHaveBeenCalledWith(
      roomDoc,
      expect.objectContaining({
        current_player_id: 'player-1',
        active_bid: {
          event_id: 'socket-bid-room-1-1-request-1',
          player_id: 'player-1',
          team_id: 'team-blue',
          amount: 10,
          created_at: '2030-01-01T00:00:00.000Z',
        },
        auction_revision: 1,
        last_auction_event: expect.objectContaining({
          eventId: 'socket-bid-room-1-1-request-1',
          type: 'BID_PLACED',
          currentPlayerId: 'player-1',
        }),
      }),
    )
    expect(txSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'socket-bid-room-1-1-request-1' }),
      expect.objectContaining({
        event_id: 'socket-bid-room-1-1-request-1',
        room_id: 'room-1',
        player_id: 'player-1',
        team_id: 'team-blue',
        amount: 10,
      }),
    )
  })

  it('Firestore 정본 current_player_id와 Socket event player가 다르면 저장하지 않고 거부한다', async () => {
    txGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        auction_revision: 0,
        current_player_id: 'other-player',
        timer_ends_at: {
          toMillis: () => new Date('2030-01-01T00:00:08.000Z').getTime(),
        },
      }),
    })
    const event: SocketAuctionAcceptedEvent = {
      type: 'bid:accepted',
      requestId: 'request-1',
      eventId: 'socket-bid-room-1-1-request-1',
      state: {
        roomId: 'room-1',
        sequence: 1,
        phase: 'ACTIVE',
        currentPlayerId: 'player-1',
        timerEndsAt: '2030-01-01T00:00:08.000Z',
        lastEventId: 'socket-bid-room-1-1-request-1',
        serverTime: new Date('2030-01-01T00:00:00.000Z').getTime(),
        currentBid: {
          eventId: 'socket-bid-room-1-1-request-1',
          requestId: 'request-1',
          playerId: 'player-1',
          teamId: 'team-blue',
          amount: 10,
          createdAt: '2030-01-01T00:00:00.000Z',
        },
        teams: [],
      },
    }

    await expect(persistSocketAcceptedBid(event)).rejects.toThrow(
      'Firestore 정본의 현재 경매 선수와 Socket 입찰 선수가 일치하지 않습니다.',
    )
    expect(txUpdate).not.toHaveBeenCalled()
    expect(txSet).not.toHaveBeenCalled()
  })
})
