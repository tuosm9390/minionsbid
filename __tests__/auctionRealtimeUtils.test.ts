import { describe, expect, it } from 'vitest'
import {
  applyAuctionEventToState,
  getAuctionExpiryWakeUpDelay,
  getAuctionBidEligibility,
  getAuctionRecoveryKey,
  getNextReAuctionRoundState,
  shouldRecoverExpiredAuction,
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
    currentPlayerId: 'player-1',
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

  it('shared bid eligibility는 canonical active bid 기준으로 선두 여부와 최소 입찰가를 계산한다', () => {
    const result = getAuctionBidEligibility({
      currentBidAmount: 120,
      currentBidTeamId: 'team-1',
      teamId: 'team-1',
      teamPointBalance: 500,
      isAuctionActive: true,
      hasCurrentPlayer: true,
      isTeamFull: false,
    })

    expect(result.highestBid).toBe(120)
    expect(result.minBid).toBe(130)
    expect(result.isLeading).toBe(true)
    expect(result.canBid).toBe(false)
  })

  it('expired recovery helper는 revision 포함 recovery key로 중복 호출을 막는다', () => {
    const recoveryKey = getAuctionRecoveryKey({
      currentPlayerId: 'player-1',
      timerEndsAt: '2026-04-29T00:00:00.000Z',
      revision: 42,
    })

    const result = shouldRecoverExpiredAuction({
      effectiveRole: 'ORGANIZER',
      currentPlayerId: 'player-1',
      timerEndsAt: '2026-04-29T00:00:00.000Z',
      recoveryKey,
      lastRecoveryKey: recoveryKey,
    })

    expect(recoveryKey).toBe('player-1:2026-04-29T00:00:00.000Z:42')
    expect(result.shouldRecover).toBe(false)
  })

  it('expiry wake-up delay는 남은 시간을 0 이하로 내리지 않는다', () => {
    expect(getAuctionExpiryWakeUpDelay('2026-04-29T00:00:05.000Z', Date.parse('2026-04-29T00:00:03.000Z'))).toBe(2000)
    expect(getAuctionExpiryWakeUpDelay('2026-04-29T00:00:05.000Z', Date.parse('2026-04-29T00:00:03.000Z'), 1500)).toBe(3500)
    expect(getAuctionExpiryWakeUpDelay('2026-04-29T00:00:05.000Z', Date.parse('2026-04-29T00:00:06.000Z'))).toBe(0)
    expect(getAuctionExpiryWakeUpDelay('2099-12-31T23:59:59.000Z', 0)).toBe(2147483647)
  })

  it('재경매 플래그는 RE_AUCTION_STARTED에서 true가 되고 PLAYER_AWARDED/UNSOLD에서 false로 닫힌다', () => {
    expect(
      getNextReAuctionRoundState({
        current: false,
        eventType: 'RE_AUCTION_STARTED',
      }),
    ).toBe(true)
    expect(
      getNextReAuctionRoundState({
        current: true,
        eventType: 'AUCTION_STARTED',
      }),
    ).toBe(true)
    expect(
      getNextReAuctionRoundState({
        current: true,
        eventType: 'PLAYER_UNSOLD',
      }),
    ).toBe(false)
  })
})
