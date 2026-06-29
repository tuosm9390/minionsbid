// Firebase Emulator 통합 E2E용 경매방을 생성하는 API route
import { NextRequest, NextResponse } from 'next/server'
import { createRoom, type CreateRoomPayload } from '@/features/auction/api/roomActions'

const TEAM_COUNT = 8
const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP']
const TIERS = ['챌린저', '그랜드마스터', '마스터', '다이아', '에메랄드', '플래티넘', '골드', '실버']

function isFirebaseEmulatorE2EEnabled() {
  return process.env.USE_FIREBASE_EMULATOR === '1'
}

function buildEightLeaderPayload(roomName: string): CreateRoomPayload {
  return {
    name: roomName,
    totalTeams: TEAM_COUNT,
    basePoint: 1000,
    membersPerTeam: 3,
    captainMode: 'COACH_ONLY',
    auctionMode: 'OPEN_ASCENDING',
    captains: Array.from({ length: TEAM_COUNT }, (_, index) => ({
      teamName: `Team ${index + 1}`,
      name: `Leader ${index + 1}`,
      tier: '팀장',
      position: POSITIONS[index % POSITIONS.length],
      description: `Firebase 통합 테스트 팀장 ${index + 1}`,
      captainPoints: 0,
    })),
    players: Array.from({ length: 10 }, (_, index) => ({
      name: `Player ${index + 1}`,
      tier: TIERS[index % TIERS.length],
      mainPosition: POSITIONS[index % POSITIONS.length],
      subPosition: POSITIONS[(index + 1) % POSITIONS.length],
      description: `Firebase 통합 테스트 선수 ${index + 1}`,
    })),
  }
}

export async function POST(request: NextRequest) {
  if (!isFirebaseEmulatorE2EEnabled()) {
    return NextResponse.json({ error: 'firebase emulator e2e disabled' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as { roomName?: string }
  const roomName = body.roomName?.trim() || `Firebase 8팀장 통합 ${Date.now()}`
  const result = await createRoom(buildEightLeaderPayload(roomName))

  if (result.error || !result.roomId || !result.organizerToken || !result.viewerToken || !result.teams) {
    return NextResponse.json(
      { error: result.error ?? 'failed to create room' },
      { status: 500 },
    )
  }

  const baseUrl = request.nextUrl.origin
  return NextResponse.json({
    ok: true,
    roomId: result.roomId,
    organizerLink: `${baseUrl}/room/${result.roomId}?role=ORGANIZER&authToken=${result.organizerToken}`,
    viewerLink: `${baseUrl}/room/${result.roomId}?role=VIEWER&authToken=${result.viewerToken}`,
    organizerToken: result.organizerToken,
    captainLinks: result.teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      token: team.leader_token,
      link: team.invite_token
        ? `${baseUrl}/room/${result.roomId}?invite=${encodeURIComponent(team.invite_token)}`
        : `${baseUrl}/room/${result.roomId}?role=LEADER&teamId=${team.id}&authToken=${team.leader_token}`,
    })),
  })
}
