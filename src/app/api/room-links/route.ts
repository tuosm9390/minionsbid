// 방 링크 정보를 주최자 토큰 검증 후 반환한다.
import { NextRequest, NextResponse } from 'next/server'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import { requireRoomOrganizer } from '@/features/auction/api/organizerAuth'
import { ROOM_AUTH_COLLECTION, ROOM_AUTH_TEAM_TOKENS_COLLECTION } from '@/features/auction/utils/roomAuth'
import {
  getE2EAuctionFixtureRoomLinks,
  isE2EAuctionFixtureEnabled,
} from '@/features/auction/api/e2eAuctionFixture'

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('roomId')?.trim()
  const organizerToken = request.nextUrl.searchParams.get('organizerToken')?.trim() ?? ''
  if (!roomId) {
    return NextResponse.json({ error: 'roomId가 필요합니다.' }, { status: 400 })
  }

  if (isE2EAuctionFixtureEnabled()) {
    return NextResponse.json(getE2EAuctionFixtureRoomLinks(roomId))
  }

  try {
    const authError = await requireRoomOrganizer(roomId, organizerToken)
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 })
    }

    const { firestore } = getAuctionServerServices()
    const [roomDoc, teamsSnapshot, teamTokensSnapshot] = await Promise.all([
      firestore.collection('rooms').doc(roomId).get(),
      firestore.collection('rooms').doc(roomId).collection('teams').get(),
      firestore
        .collection(ROOM_AUTH_COLLECTION)
        .doc(roomId)
        .collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION)
        .get(),
    ])

    if (!roomDoc.exists) {
      return NextResponse.json({ error: '링크 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const privateTokensByTeamId = new Map(
      teamTokensSnapshot.docs.map((teamTokenDoc) => [
        teamTokenDoc.id,
        teamTokenDoc.data()?.leader_token,
      ]),
    )

    const captainLinks = teamsSnapshot.docs
      .map((teamDoc) => {
        const teamData = teamDoc.data() ?? {}
        const teamName = typeof teamData.name === 'string' ? teamData.name : ''
        const leaderName = typeof teamData.leader_name === 'string' ? teamData.leader_name : ''
        const privateToken = privateTokensByTeamId.get(teamDoc.id)
        const leaderToken = typeof privateToken === 'string' ? privateToken : ''
        if (!teamName || !leaderToken) return null

        return {
          teamId: teamDoc.id,
          teamName,
          leaderName,
          leaderToken,
        }
      })
      .filter(
        (
          link,
        ): link is {
          teamId: string
          teamName: string
          leaderName: string
          leaderToken: string
        } => link !== null,
      )

    return NextResponse.json({
      captainLinks,
    })
  } catch {
    return NextResponse.json({ error: '링크 정보를 불러오지 못했습니다.' }, { status: 500 })
  }
}
