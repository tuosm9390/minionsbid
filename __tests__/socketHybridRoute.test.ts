// Socket hybrid fixture API의 HTTP 계약을 검증한다.
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixtureRoomState = {
  roomId: 'fixture-room',
  currentPlayerId: 'player-1',
  timerEndsAt: new Date(Date.now() + 5_000).toISOString(),
  teams: [
    {
      id: 'team-blue',
      name: 'Blue',
      point_balance: 1000,
      roster_slots_used: 0,
      roster_slots_total: 2,
    },
    {
      id: 'team-red',
      name: 'Red',
      point_balance: 1000,
      roster_slots_used: 0,
      roster_slots_total: 2,
    },
  ],
}

vi.mock('@/features/auction/api/e2eAuctionFixture', () => ({
  isE2EAuctionFixtureEnabled: () => true,
  getE2EAuctionFixtureRoomState: () => fixtureRoomState,
}))

function postRequest(payload: unknown) {
  return new NextRequest('http://localhost/api/e2e/socket-hybrid/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

describe('POST /api/e2e/socket-hybrid/command', () => {
  beforeEach(async () => {
    const route = await import('@/app/api/e2e/socket-hybrid/command/route')
    route.resetSocketHybridFixtureEnginesForTest()
  })

  it('fixture room state를 Socket hybrid snapshot으로 동기화한다', async () => {
    const { POST } = await import('@/app/api/e2e/socket-hybrid/command/route')

    const response = await POST(postRequest({
      roomId: 'fixture-room',
      action: 'sync',
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.type).toBe('auction:sync')
    expect(body.state).toMatchObject({
      roomId: 'fixture-room',
      currentPlayerId: 'player-1',
      sequence: 0,
    })
  })

  it('bid command는 같은 requestId 재전송 시 같은 sequence를 반환한다', async () => {
    const { POST } = await import('@/app/api/e2e/socket-hybrid/command/route')
    const payload = {
      roomId: 'fixture-room',
      action: 'bid',
      requestId: 'request-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
    }

    const first = await POST(postRequest(payload))
    const replay = await POST(postRequest(payload))
    const firstBody = await first.json()
    const replayBody = await replay.json()

    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(firstBody).toEqual(replayBody)
    expect(firstBody.state.sequence).toBe(1)
  })

  it('route module이 다시 평가되어도 fixture engine idempotency 상태를 유지한다', async () => {
    const firstRoute = await import('@/app/api/e2e/socket-hybrid/command/route')
    const payload = {
      roomId: 'fixture-room',
      action: 'bid',
      requestId: 'request-persisted',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
    }

    const first = await firstRoute.POST(postRequest(payload))
    vi.resetModules()
    const reloadedRoute = await import('@/app/api/e2e/socket-hybrid/command/route')
    const replay = await reloadedRoute.POST(postRequest(payload))
    const firstBody = await first.json()
    const replayBody = await replay.json()

    expect(firstBody).toEqual(replayBody)
    expect(replayBody.state.sequence).toBe(1)
  })
})
