import * as admin from 'firebase-admin'
import '@/lib/firebaseAdmin'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildRoomAuthCookieName,
  isValidRoomRole,
  parseRoomAuthCookie,
} from '@/features/auction/utils/roomAuth'

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

  const cookieStore = await cookies()
  const cookieName = buildRoomAuthCookieName(roomId, role, teamId)
  const authCookie = cookieStore.get(cookieName)
  const parsed = parseRoomAuthCookie(authCookie?.value)

  if (
    !parsed ||
    parsed.role !== role ||
    (role === 'LEADER' ? parsed.teamId !== teamId : parsed.teamId !== null)
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const uid = `room:${roomId}:${role}:${role === 'LEADER' ? teamId : 'none'}`
  const token = await admin.auth().createCustomToken(uid, {
    roomId,
    role,
    teamId: role === 'LEADER' ? teamId : null,
  })

  return NextResponse.json({ token })
}
