// 방 링크 정보를 반환한다. 소규모 지인용 운영에서는 주최자 토큰 검증을 수행하지 않는다.
import { NextRequest, NextResponse } from 'next/server'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  getE2EAuctionFixtureRoomLinks,
  isE2EAuctionFixtureEnabled,
} from '@/features/auction/api/e2eAuctionFixture'

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('roomId')?.trim()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId가 필요합니다.' }, { status: 400 })
  }

  if (isE2EAuctionFixtureEnabled()) {
    return NextResponse.json(getE2EAuctionFixtureRoomLinks(roomId))
  }

  try {
    const { firestore } = getAuctionServerServices()
    const [roomDoc, teamsSnapshot] = await Promise.all([
      firestore.collection('rooms').doc(roomId).get(),
      firestore.collection('rooms').doc(roomId).collection('teams').get(),
    ])

    if (!roomDoc.exists) {
      return NextResponse.json({ error: '링크 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const captainLinks = teamsSnapshot.docs
      .map((teamDoc) => {
        const teamData = teamDoc.data() ?? {}
        const teamName = typeof teamData.name === 'string' ? teamData.name : ''
        const leaderName = typeof teamData.leader_name === 'string' ? teamData.leader_name : ''
        if (!teamName) return null

        return {
          teamId: teamDoc.id,
          teamName,
          leaderName,
        }
      })
      .filter(
        (
          link,
        ): link is {
          teamId: string
          teamName: string
          leaderName: string
        } => link !== null,
      )

    return NextResponse.json({
      captainLinks,
    })
  } catch {
    return NextResponse.json({ error: '링크 정보를 불러오지 못했습니다.' }, { status: 500 })
  }
}
