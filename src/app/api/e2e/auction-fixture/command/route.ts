import { NextRequest, NextResponse } from 'next/server'
import {
  closeFixtureLottery,
  drawFixtureNextPlayer,
  isE2EAuctionFixtureEnabled,
  placeFixtureBid,
  setFixtureLeaderPresence,
  startFixtureAuction,
} from '@/features/auction/api/e2eAuctionFixture'
import { AUCTION_DURATION_MS } from '@/features/auction/constants/auctionTimings'

type CommandPayload =
  | { roomId?: string; action?: 'draw' }
  | { roomId?: string; action?: 'closeLottery'; playerName?: string }
  | { roomId?: string; action?: 'startAuction'; durationMs?: number }
  | { roomId?: string; action?: 'placeBid'; playerId?: string; teamId?: string; amount?: number; resetTimer?: boolean }
  | { roomId?: string; action?: 'setLeaderPresence'; teamId?: string; connected?: boolean }

export async function POST(request: NextRequest) {
  if (!isE2EAuctionFixtureEnabled()) {
    return NextResponse.json({ error: 'fixture mode is disabled' }, { status: 404 })
  }

  const payload = (await request.json().catch(() => null)) as CommandPayload | null
  const roomId = payload?.roomId
  const action = payload?.action

  if (!roomId || !action) {
    return NextResponse.json({ error: 'roomId와 action이 필요합니다.' }, { status: 400 })
  }

  if (action === 'draw') {
    const result = await drawFixtureNextPlayer(roomId)
    return NextResponse.json(result, { status: result.error ? 400 : 200 })
  }

  if (action === 'closeLottery') {
    const playerName = payload.playerName?.trim()
    if (!playerName) {
      return NextResponse.json({ error: 'playerName이 필요합니다.' }, { status: 400 })
    }
    const result = await closeFixtureLottery(roomId, playerName)
    return NextResponse.json(result, { status: result.error ? 400 : 200 })
  }

  if (action === 'startAuction') {
    const durationMs =
      typeof payload.durationMs === 'number' && payload.durationMs > 0
        ? payload.durationMs
        : AUCTION_DURATION_MS
    const result = await startFixtureAuction(roomId, durationMs)
    return NextResponse.json(result, { status: result.error ? 400 : 200 })
  }

  if (action === 'placeBid') {
    const playerId = payload.playerId?.trim()
    const teamId = payload.teamId?.trim()
    const amount =
      typeof payload.amount === 'number' && payload.amount > 0 ? payload.amount : null
    if (!playerId || !teamId || !amount) {
      return NextResponse.json(
        { error: 'playerId, teamId, amount가 필요합니다.' },
        { status: 400 },
      )
    }
    const result = await placeFixtureBid(
      roomId,
      playerId,
      teamId,
      amount,
      payload.resetTimer === true,
    )
    return NextResponse.json(result, { status: result.error ? 400 : 200 })
  }

  if (action === 'setLeaderPresence') {
    const teamId = payload.teamId?.trim()
    if (!teamId || typeof payload.connected !== 'boolean') {
      return NextResponse.json(
        { error: 'teamId와 connected(boolean)가 필요합니다.' },
        { status: 400 },
      )
    }
    const result = await setFixtureLeaderPresence(roomId, teamId, payload.connected)
    return NextResponse.json(result, { status: result.error ? 400 : 200 })
  }

  return NextResponse.json({ error: '지원하지 않는 action입니다.' }, { status: 400 })
}
