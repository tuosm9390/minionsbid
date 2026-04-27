import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { adminDb } from '@/lib/firebaseAdmin'

const ROOM_AUTH_COLLECTION = 'room_auth_secrets'
const ROOM_AUTH_TEAM_TOKENS_COLLECTION = 'team_tokens'

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('roomId')?.trim()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId가 필요합니다.' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const authCookie = cookieStore.get(`room_auth_${roomId}_ORGANIZER`)
  if (!authCookie) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const parsed = JSON.parse(authCookie.value)
    if (parsed?.role !== 'ORGANIZER' || typeof parsed?.token !== 'string') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const [roomDoc, roomAuthDoc, teamsSnapshot] = await Promise.all([
      adminDb.collection('rooms').doc(roomId).get(),
      adminDb.collection(ROOM_AUTH_COLLECTION).doc(roomId).get(),
      adminDb.collection('rooms').doc(roomId).collection('teams').get(),
    ])

    if (!roomDoc.exists) {
      return NextResponse.json({ error: '링크 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const roomData = roomDoc.data() ?? {}
    const roomAuthData = roomAuthDoc.data() ?? {}
    const organizerToken =
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

    if (!organizerToken || organizerToken !== parsed.token) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const teamTokenSnapshots = await Promise.all(
      teamsSnapshot.docs.map((teamDoc) =>
        roomAuthDoc.ref.collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION).doc(teamDoc.id).get()
      )
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
          link
        ): link is {
          teamId: string
          teamName: string
          leaderName: string
          token: string
        } => link !== null
      )

    return NextResponse.json({
      organizerToken,
      viewerToken,
      captainLinks,
    })
  } catch {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }
}
