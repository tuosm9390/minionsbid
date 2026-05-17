// 주최자 토큰을 헤더로 받아 방 링크 정보를 반환한다.
import { NextRequest, NextResponse } from 'next/server'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  getE2EAuctionFixtureRoomLinks,
  isE2EAuctionFixtureEnabled,
} from '@/features/auction/api/e2eAuctionFixture'
import {
  ROOM_AUTH_COLLECTION,
  ROOM_AUTH_TEAM_TOKENS_COLLECTION,
  validateRoomAuthToken,
} from '@/features/auction/utils/roomAuth'

function extractToken(request: NextRequest): string | null {
  const headerToken = request.headers.get('x-organizer-token')
  if (headerToken) return headerToken
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim()
  }
  const queryToken = request.nextUrl.searchParams.get('token')
  return queryToken ? queryToken : null
}

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('roomId')?.trim()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId가 필요합니다.' }, { status: 400 })
  }

  const organizerToken = extractToken(request)
  if (!organizerToken) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  if (isE2EAuctionFixtureEnabled()) {
    const fixtureLinks = getE2EAuctionFixtureRoomLinks(roomId)
    if (fixtureLinks.organizerToken !== organizerToken) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }
    return NextResponse.json(fixtureLinks)
  }

  try {
    const { firestore } = getAuctionServerServices()
    const [roomDoc, roomAuthDoc, teamsSnapshot] = await Promise.all([
      firestore.collection('rooms').doc(roomId).get(),
      firestore.collection(ROOM_AUTH_COLLECTION).doc(roomId).get(),
      firestore.collection('rooms').doc(roomId).collection('teams').get(),
    ])

    if (!roomDoc.exists) {
      return NextResponse.json({ error: '링크 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const isValid = await validateRoomAuthToken({
      roomId,
      role: 'ORGANIZER',
      token: organizerToken,
      isFixtureEnabled: false,
      verifyFixtureAccess: () => false,
      loadTokenDocuments: async () => ({
        roomData: roomDoc.data() ?? {},
        roomAuthData: roomAuthDoc.data() ?? {},
      }),
    })

    if (!isValid) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const roomData = roomDoc.data() ?? {}
    const roomAuthData = roomAuthDoc.data() ?? {}
    const resolvedOrganizerToken =
      typeof roomAuthData.organizer_token === 'string'
        ? roomAuthData.organizer_token
        : typeof roomData.organizer_token === 'string'
          ? roomData.organizer_token
          : null
    const viewerToken =
      typeof roomAuthData.viewer_token === 'string'
        ? roomAuthData.viewer_token
        : typeof roomData.viewer_token === 'string'
          ? roomData.viewer_token
          : null

    const teamTokenSnapshots = await Promise.all(
      teamsSnapshot.docs.map((teamDoc) =>
        roomAuthDoc.ref.collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION).doc(teamDoc.id).get(),
      ),
    )

    const captainLinks = teamsSnapshot.docs
      .map((teamDoc, index) => {
        const teamData = teamDoc.data() ?? {}
        const tokenData = teamTokenSnapshots[index]?.data() ?? {}
        const teamName = typeof teamData.name === 'string' ? teamData.name : ''
        const leaderName = typeof teamData.leader_name === 'string' ? teamData.leader_name : ''
        const token =
          typeof tokenData.leader_token === 'string'
            ? tokenData.leader_token
            : typeof teamData.leader_token === 'string'
              ? teamData.leader_token
              : null
        if (!teamName || !token) return null

        return {
          teamId: teamDoc.id,
          teamName,
          leaderName,
          token,
        }
      })
      .filter(
        (
          link,
        ): link is {
          teamId: string
          teamName: string
          leaderName: string
          token: string
        } => link !== null,
      )

    return NextResponse.json({
      organizerToken: resolvedOrganizerToken,
      viewerToken,
      captainLinks,
    })
  } catch {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }
}
