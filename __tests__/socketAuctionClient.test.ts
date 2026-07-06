// SOCKET_CANARY 클라이언트가 Socket.IO 확정 상태를 store에 적용하는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { io } from 'socket.io-client'
import { placeBidSocketPrimary } from '@/features/auction/socket/socketAuctionClient'
import { useAuctionStore } from '@/features/auction/store/useAuctionStore'

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}))

describe('placeBidSocketPrimary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as typeof window & { __AUCTION_SOCKET_URL__?: string }).__AUCTION_SOCKET_URL__
    delete (window as typeof window & { __auctionSocketClients__?: unknown }).__auctionSocketClients__
    useAuctionStore.setState({
      auctionEventRevision: 0,
      liveBid: null,
      timerEndsAt: null,
      teams: [
        {
          id: 'team-blue',
          room_id: 'room-1',
          name: 'Blue',
          point_balance: 100,
          leader_name: 'Blue Leader',
          leader_position: 'TOP',
          leader_description: '',
          captain_points: 0,
        },
      ],
    })
  })

  it('Socket server accepted state를 liveBid, timerEndsAt, revision에 적용한다', async () => {
    const emitWithAck = vi.fn().mockResolvedValue({
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
        serverTime: 1,
        currentBid: {
          eventId: 'socket-bid-room-1-1-request-1',
          requestId: 'request-1',
          playerId: 'player-1',
          teamId: 'team-blue',
          amount: 10,
          createdAt: '2030-01-01T00:00:00.000Z',
        },
        teams: [
          {
            id: 'team-blue',
            name: 'Blue',
            pointBalance: 90,
            rosterSlotsUsed: 0,
            rosterSlotsTotal: 3,
          },
        ],
      },
    })
    const timeout = vi.fn(() => ({ emitWithAck }))
    vi.mocked(io).mockReturnValue({ timeout, on: vi.fn(), off: vi.fn() } as unknown as ReturnType<typeof io>)
    ;(window as typeof window & { __AUCTION_SOCKET_URL__?: string }).__AUCTION_SOCKET_URL__ =
      'http://127.0.0.1:4100'

    const result = await placeBidSocketPrimary({
      roomId: 'room-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      authToken: 'leader-token',
      requestId: 'request-1',
    })

    expect(result).toEqual({
      eventId: 'socket-bid-room-1-1-request-1',
      timerEndsAt: '2030-01-01T00:00:08.000Z',
      revision: 1,
    })
    expect(emitWithAck).toHaveBeenCalledWith('bid:submit', {
      roomId: 'room-1',
      requestId: 'request-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      sentAt: expect.any(Number),
    })
    expect(useAuctionStore.getState().liveBid).toMatchObject({
      event_id: 'socket-bid-room-1-1-request-1',
      player_id: 'player-1',
      team_id: 'team-blue',
      amount: 10,
    })
    expect(useAuctionStore.getState().timerEndsAt).toBe('2030-01-01T00:00:08.000Z')
    expect(useAuctionStore.getState().auctionEventRevision).toBe(1)
    expect(useAuctionStore.getState().teams[0].point_balance).toBe(90)
  })
})
