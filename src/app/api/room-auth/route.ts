import { NextRequest, NextResponse } from 'next/server'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  isE2EAuctionFixtureEnabled,
  verifyE2EAuctionFixtureAccess,
} from '@/features/auction/api/e2eAuctionFixture'
import {
  buildRoomAuthCookieName,
  isValidRoomRole,
  ROOM_AUTH_COLLECTION,
  ROOM_AUTH_TEAM_TOKENS_COLLECTION,
  validateRoomAuthToken,
} from '@/features/auction/utils/roomAuth'

const AUTH_DEBUG =
  process.env.NEXT_PUBLIC_DEBUG_LATENCY === '1' ||
  process.env.DEBUG_LATENCY === '1'

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

  if (AUTH_DEBUG) {
    console.info('[room-auth] request', {
      roomId,
      role,
      hasToken: Boolean(token),
      teamId,
      protocol: request.nextUrl.protocol,
      href: request.nextUrl.href,
    })
  }

  const useSecureCookie = request.nextUrl.protocol === 'https:'

  // 역할 화이트리스트 검증
  if (!isValidRoomRole(role)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // 토큰 DB 검증
  if (!token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const isValid = await validateRoomAuthToken({
    roomId,
    role,
    teamId,
    token,
    isFixtureEnabled: isE2EAuctionFixtureEnabled(),
    verifyFixtureAccess: (args) =>
      verifyE2EAuctionFixtureAccess({
        roomId: args.roomId,
        role: args.role,
        token: args.token,
        teamId: args.teamId,
      }),
    loadTokenDocuments: async ({ roomId: targetRoomId, role: targetRole, teamId: targetTeamId }) => {
      const { firestore } = getAuctionServerServices()
      const [roomDoc, roomAuthDoc] = await Promise.all([
        firestore.collection('rooms').doc(targetRoomId).get(),
        firestore.collection(ROOM_AUTH_COLLECTION).doc(targetRoomId).get(),
      ])

      if (!roomDoc.exists) {
        return null
      }

      if (targetRole === 'LEADER' && targetTeamId) {
        const [teamDoc, teamTokenDoc] = await Promise.all([
          firestore.collection('rooms').doc(targetRoomId).collection('teams').doc(targetTeamId).get(),
          firestore
            .collection(ROOM_AUTH_COLLECTION)
            .doc(targetRoomId)
            .collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION)
            .doc(targetTeamId)
            .get(),
        ])
        return {
          roomData: roomDoc.data() ?? {},
          roomAuthData: roomAuthDoc.data() ?? {},
          teamData: teamDoc.data() ?? {},
          teamTokenData: teamTokenDoc.data() ?? {},
        }
      }

      return {
        roomData: roomDoc.data() ?? {},
        roomAuthData: roomAuthDoc.data() ?? {},
      }
    },
  })

  if (!isValid) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const cookieName = buildRoomAuthCookieName(roomId, role, teamId)

  const authData = JSON.stringify({ role, teamId: teamId || null, token })

  // 리다이렉트 URL에 role/teamId 포함 → page.tsx가 올바른 쿠키를 조회할 수 있음
  const redirectUrl = new URL(`/room/${roomId}`, request.url)
  redirectUrl.searchParams.set('role', role)
  redirectUrl.searchParams.set('authToken', token)
  if (role === 'LEADER' && teamId) {
    redirectUrl.searchParams.set('teamId', teamId)
  }

  const response = NextResponse.redirect(redirectUrl)
  response.cookies.set(cookieName, authData, {
    httpOnly: true,
    secure: useSecureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8시간
  })

  if (AUTH_DEBUG) {
    console.info('[room-auth] success', {
      roomId,
      role,
      teamId,
      cookieName,
      redirectTo: redirectUrl.toString(),
      useSecureCookie,
    })
  }

  return response
}
