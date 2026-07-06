// fixture 방에서 Socket hybrid 공개 입찰 엔진 계약을 HTTP로 검증한다.
import { NextRequest, NextResponse } from 'next/server'
import {
  getE2EAuctionFixtureRoomState,
  isE2EAuctionFixtureEnabled,
} from '@/features/auction/api/e2eAuctionFixture'
import { createSocketAuctionEngine } from '@/features/auction/socket/socketAuctionEngine'
import {
  createInitialSocketAuctionState,
  type SocketAuctionState,
} from '@/features/auction/socket/socketContracts'

type SocketHybridPayload =
  | { roomId?: string; action?: 'sync' }
  | {
      roomId?: string
      action?: 'bid'
      requestId?: string
      playerId?: string
      teamId?: string
      amount?: number
    }

type SocketHybridEngine = ReturnType<typeof createSocketAuctionEngine>

const SOCKET_HYBRID_FIXTURE_KEY = '__socketHybridFixtureEngines__'

function getEngineStore() {
  const globalStore = globalThis as typeof globalThis & {
    [SOCKET_HYBRID_FIXTURE_KEY]?: Map<string, SocketHybridEngine>
  }
  if (!globalStore[SOCKET_HYBRID_FIXTURE_KEY]) {
    globalStore[SOCKET_HYBRID_FIXTURE_KEY] = new Map()
  }
  return globalStore[SOCKET_HYBRID_FIXTURE_KEY]
}

export function resetSocketHybridFixtureEnginesForTest() {
  getEngineStore().clear()
}

function getEngine(roomId: string): SocketHybridEngine | null {
  const engines = getEngineStore()
  const existing = engines.get(roomId)
  if (existing) return existing

  const fixture = getE2EAuctionFixtureRoomState(roomId)
  if (!fixture) return null

  const initialState: SocketAuctionState = createInitialSocketAuctionState({
    roomId,
    currentPlayerId: fixture.currentPlayerId,
    timerEndsAt: fixture.timerEndsAt,
    teams: fixture.teams.map((team) => ({
      id: team.id,
      name: team.name,
      pointBalance: team.point_balance,
      rosterSlotsUsed: team.roster_slots_used ?? 0,
      rosterSlotsTotal: team.roster_slots_total ?? fixture.membersPerTeam,
    })),
  })
  const engine = createSocketAuctionEngine(initialState)
  engines.set(roomId, engine)
  return engine
}

export async function POST(request: NextRequest) {
  if (!isE2EAuctionFixtureEnabled()) {
    return NextResponse.json({ error: 'fixture mode is disabled' }, { status: 404 })
  }

  const payload = (await request.json().catch(() => null)) as SocketHybridPayload | null
  const roomId = payload?.roomId?.trim()
  const action = payload?.action
  if (!roomId || !action) {
    return NextResponse.json({ error: 'roomId와 action이 필요합니다.' }, { status: 400 })
  }

  const engine = getEngine(roomId)
  if (!engine) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 })
  }

  if (action === 'sync') {
    return NextResponse.json(engine.sync('MANUAL'))
  }

  if (action === 'bid') {
    const requestId = payload.requestId?.trim()
    const playerId = payload.playerId?.trim()
    const teamId = payload.teamId?.trim()
    const amount =
      typeof payload.amount === 'number' && Number.isInteger(payload.amount)
        ? payload.amount
        : null
    if (!requestId || !playerId || !teamId || !amount) {
      return NextResponse.json(
        { error: 'requestId, playerId, teamId, amount가 필요합니다.' },
        { status: 400 },
      )
    }
    const result = engine.submitBid({
      roomId,
      requestId,
      playerId,
      teamId,
      amount,
      sentAt: Date.now(),
    })
    return NextResponse.json(result, { status: result.type === 'bid:accepted' ? 200 : 400 })
  }

  return NextResponse.json({ error: '지원하지 않는 action입니다.' }, { status: 400 })
}
