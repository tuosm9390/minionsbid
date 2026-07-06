// Socket.IO hybrid 공개 입찰 엔진의 sequence와 멱등성을 검증한다.
import { describe, expect, it } from 'vitest'
import { createInitialSocketAuctionState } from '@/features/auction/socket/socketContracts'
import { createSocketAuctionEngine } from '@/features/auction/socket/socketAuctionEngine'

function makeEngine() {
  const state = createInitialSocketAuctionState({
    roomId: 'room-1',
    currentPlayerId: 'player-1',
    timerEndsAt: new Date(Date.now() + 3_000).toISOString(),
    teams: [
      {
        id: 'team-blue',
        name: 'Blue',
        pointBalance: 1000,
        rosterSlotsUsed: 0,
        rosterSlotsTotal: 2,
      },
      {
        id: 'team-red',
        name: 'Red',
        pointBalance: 1000,
        rosterSlotsUsed: 0,
        rosterSlotsTotal: 2,
      },
    ],
  })
  return createSocketAuctionEngine(state)
}

describe('socket auction engine', () => {
  it('Firestore snapshot에서 복원한 revision과 active bid를 초기 sequence와 최고 입찰로 사용한다', () => {
    const engine = createSocketAuctionEngine(
      createInitialSocketAuctionState({
        roomId: 'room-1',
        sequence: 7,
        currentPlayerId: 'player-1',
        currentBid: {
          eventId: 'existing-event',
          requestId: 'existing-request',
          playerId: 'player-1',
          teamId: 'team-blue',
          amount: 40,
          createdAt: '2030-01-01T00:00:00.000Z',
        },
        timerEndsAt: new Date(Date.now() + 3_000).toISOString(),
        teams: [
          {
            id: 'team-blue',
            name: 'Blue',
            pointBalance: 960,
            rosterSlotsUsed: 0,
            rosterSlotsTotal: 2,
          },
          {
            id: 'team-red',
            name: 'Red',
            pointBalance: 1000,
            rosterSlotsUsed: 0,
            rosterSlotsTotal: 2,
          },
        ],
      }),
    )

    const result = engine.submitBid({
      roomId: 'room-1',
      requestId: 'request-after-hydrate',
      playerId: 'player-1',
      teamId: 'team-red',
      amount: 50,
      sentAt: Date.now(),
    })

    expect(result.type).toBe('bid:accepted')
    expect(result.state.sequence).toBe(8)
    expect(result.state.currentBid).toMatchObject({
      requestId: 'request-after-hydrate',
      teamId: 'team-red',
      amount: 50,
    })
    expect(result.state.teams.find((team) => team.id === 'team-blue')).toMatchObject({
      pointBalance: 1000,
    })
    expect(result.state.teams.find((team) => team.id === 'team-red')).toMatchObject({
      pointBalance: 950,
    })
  })

  it('Firestore에서 복원한 currentBid와 같은 requestId 재전송은 sequence를 올리지 않고 같은 accepted state를 반환한다', () => {
    const engine = createSocketAuctionEngine(
      createInitialSocketAuctionState({
        roomId: 'room-1',
        sequence: 7,
        currentPlayerId: 'player-1',
        currentBid: {
          eventId: 'existing-event',
          requestId: 'existing-request',
          playerId: 'player-1',
          teamId: 'team-blue',
          amount: 40,
          createdAt: '2030-01-01T00:00:00.000Z',
        },
        timerEndsAt: new Date(Date.now() + 3_000).toISOString(),
        teams: [
          {
            id: 'team-blue',
            name: 'Blue',
            pointBalance: 960,
            rosterSlotsUsed: 0,
            rosterSlotsTotal: 2,
          },
        ],
      }),
    )

    const replay = engine.submitBid({
      roomId: 'room-1',
      requestId: 'existing-request',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 40,
      sentAt: Date.now(),
    })

    expect(replay).toMatchObject({
      type: 'bid:accepted',
      requestId: 'existing-request',
      eventId: 'existing-event',
      state: {
        sequence: 7,
        currentBid: {
          eventId: 'existing-event',
          requestId: 'existing-request',
          teamId: 'team-blue',
          amount: 40,
        },
      },
    })
    expect(engine.getSnapshot().sequence).toBe(7)
  })

  it('입찰을 수락하면 sequence를 증가시키고 같은 state를 broadcast payload로 반환한다', () => {
    const engine = makeEngine()

    const result = engine.submitBid({
      roomId: 'room-1',
      requestId: 'request-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      sentAt: Date.now(),
    })

    expect(result.type).toBe('bid:accepted')
    expect(result.state.sequence).toBe(1)
    expect(result.state.currentBid).toMatchObject({
      requestId: 'request-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
    })
    expect(result.state.teams.find((team) => team.id === 'team-blue')).toMatchObject({
      pointBalance: 990,
    })
  })

  it('같은 requestId 재전송은 같은 결과를 반환하고 sequence를 다시 증가시키지 않는다', () => {
    const engine = makeEngine()

    const first = engine.submitBid({
      roomId: 'room-1',
      requestId: 'request-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      sentAt: Date.now(),
    })
    const replay = engine.submitBid({
      roomId: 'room-1',
      requestId: 'request-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      sentAt: Date.now(),
    })

    expect(replay).toEqual(first)
    expect(engine.getSnapshot().sequence).toBe(1)
  })

  it('최고 입찰 팀의 재입찰과 낮은 금액은 거부하고 state sequence를 유지한다', () => {
    const engine = makeEngine()
    engine.submitBid({
      roomId: 'room-1',
      requestId: 'request-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 20,
      sentAt: Date.now(),
    })

    const leadingTeamReplay = engine.submitBid({
      roomId: 'room-1',
      requestId: 'request-2',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 30,
      sentAt: Date.now(),
    })
    const lowBid = engine.submitBid({
      roomId: 'room-1',
      requestId: 'request-3',
      playerId: 'player-1',
      teamId: 'team-red',
      amount: 20,
      sentAt: Date.now(),
    })

    expect(leadingTeamReplay).toMatchObject({
      type: 'bid:rejected',
      reason: '현재 최고 입찰자입니다. 추가 입찰이 불가합니다.',
    })
    expect(lowBid).toMatchObject({
      type: 'bid:rejected',
      reason: '최소 입찰액은 30P입니다.',
    })
    expect(engine.getSnapshot().sequence).toBe(1)
  })

  it('정수가 아니거나 10P 단위가 아닌 금액은 거부하고 state sequence를 유지한다', () => {
    const engine = makeEngine()

    const decimalBid = engine.submitBid({
      roomId: 'room-1',
      requestId: 'request-decimal',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10.5,
      sentAt: Date.now(),
    })
    const offStepBid = engine.submitBid({
      roomId: 'room-1',
      requestId: 'request-off-step',
      playerId: 'player-1',
      teamId: 'team-red',
      amount: 15,
      sentAt: Date.now(),
    })

    expect(decimalBid).toMatchObject({
      type: 'bid:rejected',
      reason: '양의 정수 금액을 입력하세요.',
    })
    expect(offStepBid).toMatchObject({
      type: 'bid:rejected',
      reason: '10P 단위로 입찰해야 합니다.',
    })
    expect(engine.getSnapshot().sequence).toBe(0)
  })
})
