import { describe, expect, it } from 'vitest'
import {
  applyAuctionEventToState,
  type AuctionEventEnvelope,
  type AuctionRealtimeStateSlice,
} from '@/features/auction/utils/auctionRealtime'

function createBaseState(): AuctionRealtimeStateSlice {
  return {
    auctionEventRevision: 2,
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
      {
        id: 'player-2',
        room_id: 'room-1',
        name: 'Beta',
        tier: 'A',
        main_position: 'JGL',
        sub_position: '',
        status: 'UNSOLD',
        team_id: null,
        sold_price: null,
        description: '',
      },
    ],
    teams: [
      {
        id: 'team-1',
        room_id: 'room-1',
        name: 'Blue',
        point_balance: 120,
        leader_name: 'Blue Leader',
        leader_position: 'TOP',
        leader_description: '',
        captain_points: 0,
      },
    ],
    timerEndsAt: '2026-04-29T00:00:05.000Z',
    liveBid: null,
    lotteryPlayer: null,
  }
}

function createEvent(overrides: Partial<AuctionEventEnvelope>): AuctionEventEnvelope {
  return {
    eventId: 'event-3',
    revision: 3,
    roomId: 'room-1',
    type: 'BID_PLACED',
    serverCreatedAt: '2026-04-29T00:00:00.000Z',
    ...overrides,
  }
}

describe('applyAuctionEventToState', () => {
  it('낮은 revision 이벤트는 무시한다', () => {
    const state = createBaseState()
    const result = applyAuctionEventToState(
      state,
      createEvent({
        revision: 2,
        liveBid: {
          id: 'bid-1',
          room_id: 'room-1',
          player_id: 'player-1',
          team_id: 'team-1',
          amount: 110,
          created_at: '2026-04-29T00:00:00.000Z',
        },
      }),
    )

    expect(result.applied).toBe(false)
    expect(result.liveBid).toBeNull()
    expect(result.revision).toBe(2)
  })

  it('BID_PLACED 이벤트는 타이머와 liveBid를 갱신한다', () => {
    const result = applyAuctionEventToState(
      createBaseState(),
      createEvent({
        timerEndsAt: '2026-04-29T00:00:08.000Z',
        liveBid: {
          id: 'bid-2',
          room_id: 'room-1',
          player_id: 'player-1',
          team_id: 'team-1',
          amount: 130,
          created_at: '2026-04-29T00:00:01.000Z',
        },
      }),
    )

    expect(result.applied).toBe(true)
    expect(result.timerEndsAt).toBe('2026-04-29T00:00:08.000Z')
    expect(result.liveBid?.amount).toBe(130)
    expect(result.revision).toBe(3)
  })

  it('RE_AUCTION_STARTED 이벤트는 지정된 유찰 선수를 WAITING으로 되돌린다', () => {
    const result = applyAuctionEventToState(
      createBaseState(),
      createEvent({
        type: 'RE_AUCTION_STARTED',
        playerIdsToWaiting: ['player-2'],
      }),
    )

    const player = result.players.find((entry) => entry.id === 'player-2')
    expect(result.applied).toBe(true)
    expect(player?.status).toBe('WAITING')
    expect(player?.team_id).toBeNull()
    expect(player?.sold_price).toBeNull()
  })
})
