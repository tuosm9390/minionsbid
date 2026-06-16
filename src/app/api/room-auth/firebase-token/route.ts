// role/teamId 기반으로 Firebase custom token을 발급한다.
import { getAuth } from 'firebase-admin/auth'
import '@/lib/firebaseAdmin'
import { NextRequest, NextResponse } from 'next/server'
import {
  isValidRoomRole,
  validateRoomAuthToken,
  ROOM_AUTH_COLLECTION,
  ROOM_AUTH_TEAM_TOKENS_COLLECTION,
} from '@/features/auction/utils/roomAuth'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  isE2EAuctionFixtureEnabled,
  verifyE2EAuctionFixtureAccess,
} from '@/features/auction/api/e2eAuctionFixture'

export const runtime = 'nodejs'

type FirebaseTokenPayload = {
  roomId?: string
  role?: string | null
  teamId?: string | null
  token?: string | null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
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
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  try {
    const { firestore } = getAuctionServerServices()
    const isAuthorized = await validateRoomAuthToken({
      roomId,
      role,
      teamId,
      token,
      isFixtureEnabled: isE2EAuctionFixtureEnabled(),
      verifyFixtureAccess: verifyE2EAuctionFixtureAccess,
      loadTokenDocuments: async ({ roomId: targetRoomId, role: targetRole, teamId: targetTeamId }) => {
        const roomRef = firestore.collection('rooms').doc(targetRoomId)
        const roomAuthRef = firestore.collection(ROOM_AUTH_COLLECTION).doc(targetRoomId)
        const [roomSnap, roomAuthSnap, teamSnap, teamTokenSnap] = await Promise.all([
          roomRef.get(),
          roomAuthRef.get(),
          targetRole === 'LEADER' && targetTeamId
            ? roomRef.collection('teams').doc(targetTeamId).get()
            : Promise.resolve(null),
          targetRole === 'LEADER' && targetTeamId
            ? roomAuthRef.collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION).doc(targetTeamId).get()
            : Promise.resolve(null),
        ])

        return {
          roomData: roomSnap.data() ?? null,
          roomAuthData: roomAuthSnap.data() ?? null,
          teamData: teamSnap?.data() ?? null,
          teamTokenData: teamTokenSnap?.data() ?? null,
        }
      },
    })

    if (!isAuthorized) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const uid = `room:${roomId}:${role}:${role === 'LEADER' ? teamId : 'none'}`
    const customToken = await getAuth().createCustomToken(uid, {
      roomId,
      role,
      teamId: role === 'LEADER' ? teamId : null,
    })

    return NextResponse.json({ token: customToken })
  } catch (error) {
    console.error('[room-auth] firebase token request failed', {
      roomId,
      role,
      teamId: role === 'LEADER' ? teamId : null,
      message: getErrorMessage(error),
    })
    return NextResponse.json({ error: 'firebase auth unavailable' }, { status: 500 })
  }
}
