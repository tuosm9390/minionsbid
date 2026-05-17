// role/teamId 기반으로 Firebase custom token을 발급한다.
import * as admin from 'firebase-admin'
import '@/lib/firebaseAdmin'
import { NextRequest, NextResponse } from 'next/server'
import { isValidRoomRole } from '@/features/auction/utils/roomAuth'

export const runtime = 'nodejs'

type FirebaseTokenPayload = {
  roomId?: string
  role?: string | null
  teamId?: string | null
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as FirebaseTokenPayload | null
  const roomId = payload?.roomId
  const role = payload?.role ?? null
  const teamId = payload?.teamId ?? null

  if (!roomId || !isValidRoomRole(role)) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }
  if (role === 'LEADER' && !teamId) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  const uid = `room:${roomId}:${role}:${role === 'LEADER' ? teamId : 'none'}`
  const customToken = await admin.auth().createCustomToken(uid, {
    roomId,
    role,
    teamId: role === 'LEADER' ? teamId : null,
  })

  return NextResponse.json({ token: customToken })
}
