// 전달받은 방 토큰을 DB로 검증한 뒤 Firebase custom token을 발급한다.
import * as admin from 'firebase-admin'
import '@/lib/firebaseAdmin'
import { NextRequest, NextResponse } from 'next/server'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  isE2EAuctionFixtureEnabled,
  verifyE2EAuctionFixtureAccess,
} from '@/features/auction/api/e2eAuctionFixture'
import {
  ROOM_AUTH_COLLECTION,
  ROOM_AUTH_TEAM_TOKENS_COLLECTION,
  isValidRoomRole,
  validateRoomAuthToken,
} from '@/features/auction/utils/roomAuth'

export const runtime = 'nodejs'

type FirebaseTokenPayload = {
  roomId?: string
  role?: string | null
  teamId?: string | null
  token?: string | null
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as FirebaseTokenPayload | null
  const roomId = payload?.roomId
  const role = payload?.role ?? null
  const teamId = payload?.teamId ?? null
  const token = payload?.token ?? null

  if (!roomId || !isValidRoomRole(role)) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }
  if (role === 'LEADER' && !teamId) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
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
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const uid = `room:${roomId}:${role}:${role === 'LEADER' ? teamId : 'none'}`
  const customToken = await admin.auth().createCustomToken(uid, {
    roomId,
    role,
    teamId: role === 'LEADER' ? teamId : null,
  })

  return NextResponse.json({ token: customToken })
}
