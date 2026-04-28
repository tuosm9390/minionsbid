import { NextRequest, NextResponse } from 'next/server'
import {
  getE2EAuctionFixtureRoomState,
  isE2EAuctionFixtureEnabled,
} from '@/features/auction/api/e2eAuctionFixture'

export async function GET(request: NextRequest) {
  if (!isE2EAuctionFixtureEnabled()) {
    return NextResponse.json({ error: 'fixture disabled' }, { status: 404 })
  }

  const roomId = request.nextUrl.searchParams.get('roomId')?.trim()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId가 필요합니다.' }, { status: 400 })
  }

  const room = getE2EAuctionFixtureRoomState(roomId)
  if (!room) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 })
  }

  return NextResponse.json(room)
}
