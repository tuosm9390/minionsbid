import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  isE2EAuctionFixtureEnabled,
  verifyE2EAuctionFixtureAccess,
} from '@/features/auction/api/e2eAuctionFixture'

const VALID_ROLES = ['ORGANIZER', 'LEADER', 'VIEWER'] as const
type ValidRole = typeof VALID_ROLES[number]
const ROOM_AUTH_COLLECTION = 'room_auth_secrets'
const ROOM_AUTH_TEAM_TOKENS_COLLECTION = 'team_tokens'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const roomId = searchParams.get('roomId')
  const role = searchParams.get('role')
  const token = searchParams.get('token')
  let teamId = searchParams.get('teamId')
  if (teamId === 'undefined' || teamId === 'null' || teamId === '') {
    teamId = null
  }

  if (!roomId || !role) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // 역할 화이트리스트 검증
  if (!VALID_ROLES.includes(role as ValidRole)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // 토큰 DB 검증
  if (!token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (isE2EAuctionFixtureEnabled()) {
    const valid = verifyE2EAuctionFixtureAccess({
      roomId,
      role: role as ValidRole,
      token,
      teamId,
    })
    if (!valid) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    const cookieSuffix = role === 'LEADER' && teamId ? `LEADER_${teamId}` : role.toUpperCase()
    const cookieName = `room_auth_${roomId}_${cookieSuffix}`
    const authData = JSON.stringify({ role, teamId: teamId || null, token })
    const cookieStore = await cookies()
    cookieStore.set(cookieName, authData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    })

    const redirectUrl = new URL(`/room/${roomId}`, request.url)
    redirectUrl.searchParams.set('role', role)
    if (role === 'LEADER' && teamId) {
      redirectUrl.searchParams.set('teamId', teamId)
    }
    return NextResponse.redirect(redirectUrl)
  }

  const [roomDoc, roomAuthDoc] = await Promise.all([
    getAuctionServerServices().firestore.collection('rooms').doc(roomId).get(),
    getAuctionServerServices().firestore.collection(ROOM_AUTH_COLLECTION).doc(roomId).get(),
  ])
  if (!roomDoc.exists) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const roomData = roomDoc.data()!
  const roomAuthData = roomAuthDoc.data() ?? {}
  const organizerToken =
    typeof roomAuthData.organizer_token === 'string'
      ? roomAuthData.organizer_token
      : roomData.organizer_token
  const viewerToken =
    typeof roomAuthData.viewer_token === 'string'
      ? roomAuthData.viewer_token
      : roomData.viewer_token

  if (role === 'ORGANIZER') {
    if (organizerToken !== token) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  } else if (role === 'VIEWER') {
    if (viewerToken !== token) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  } else if (role === 'LEADER' && teamId) {
    const teamDoc = await getAuctionServerServices().firestore
      .collection('rooms')
      .doc(roomId)
      .collection('teams')
      .doc(teamId)
      .get()
    const teamTokenDoc = await getAuctionServerServices().firestore
      .collection(ROOM_AUTH_COLLECTION)
      .doc(roomId)
      .collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION)
      .doc(teamId)
      .get()
    const leaderToken = teamTokenDoc.exists
      ? teamTokenDoc.data()?.leader_token
      : teamDoc.data()?.leader_token
    if (!leaderToken || leaderToken !== token) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  } else {
    // LEADER인데 teamId가 없는 경우
    return NextResponse.redirect(new URL('/', request.url))
  }

  // 역할+팀ID별 고유 쿠키 이름 — 같은 브라우저에서 여러 팀장이 열어도 덮어쓰지 않음
  const cookieSuffix = role === 'LEADER' && teamId ? `LEADER_${teamId}` : role.toUpperCase()
  const cookieName = `room_auth_${roomId}_${cookieSuffix}`

  const authData = JSON.stringify({ role, teamId: teamId || null, token })

  const cookieStore = await cookies()
  cookieStore.set(cookieName, authData, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8시간
  })

  // 리다이렉트 URL에 role/teamId 포함 → page.tsx가 올바른 쿠키를 조회할 수 있음
  const redirectUrl = new URL(`/room/${roomId}`, request.url)
  redirectUrl.searchParams.set('role', role)
  if (role === 'LEADER' && teamId) {
    redirectUrl.searchParams.set('teamId', teamId)
  }

  return NextResponse.redirect(redirectUrl)
}
