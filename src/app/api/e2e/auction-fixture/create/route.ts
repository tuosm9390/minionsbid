// 8팀장 visual E2E용 fixture 경매방을 생성하는 API route
import { NextRequest, NextResponse } from 'next/server'
import {
  createE2EAuctionFixtureRoom,
  isE2EAuctionFixtureEnabled,
  type FixtureCreateRoomPayload,
} from '@/features/auction/api/e2eAuctionFixture'

function buildRoomLinks(
  baseUrl: string,
  result: {
    roomId: string
    organizerToken: string
    viewerToken: string
    teams: Array<{ id: string; name: string; leader_token: string }>
  },
) {
  return {
    roomId: result.roomId,
    organizerLink: `${baseUrl}/room/${result.roomId}?role=ORGANIZER&authToken=${result.organizerToken}`,
    viewerLink: `${baseUrl}/room/${result.roomId}?role=VIEWER&authToken=${result.viewerToken}`,
    captainLinks: result.teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      link: `${baseUrl}/room/${result.roomId}?role=LEADER&teamId=${team.id}&authToken=${team.leader_token}`,
    })),
  }
}

export async function POST(request: NextRequest) {
  if (!isE2EAuctionFixtureEnabled()) {
    return NextResponse.json({ error: 'fixture disabled' }, { status: 404 })
  }

  const payload = (await request.json().catch(() => null)) as FixtureCreateRoomPayload | null
  if (!payload || !payload.name || !Array.isArray(payload.captains)) {
    return NextResponse.json({ error: 'fixture room payload가 필요합니다.' }, { status: 400 })
  }

  const result = createE2EAuctionFixtureRoom(payload)
  return NextResponse.json({ ok: true, ...buildRoomLinks(request.nextUrl.origin, result) })
}
