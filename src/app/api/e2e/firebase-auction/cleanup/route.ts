// Firebase Emulator 통합 E2E 데이터를 정리하는 API route
import { NextRequest, NextResponse } from 'next/server'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import { ROOM_AUTH_COLLECTION } from '@/features/auction/utils/roomAuth'

function isFirebaseEmulatorE2EEnabled() {
  return process.env.USE_FIREBASE_EMULATOR === '1'
}

export async function POST(request: NextRequest) {
  if (!isFirebaseEmulatorE2EEnabled()) {
    return NextResponse.json({ error: 'firebase emulator e2e disabled' }, { status: 404 })
  }

  const body = (await request.json().catch(() => null)) as { roomId?: string } | null
  const roomId = body?.roomId?.trim()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId가 필요합니다.' }, { status: 400 })
  }

  const { firestore, rtdb } = getAuctionServerServices()
  const roomRef = firestore.collection('rooms').doc(roomId)
  const roomAuthRef = firestore.collection(ROOM_AUTH_COLLECTION).doc(roomId)

  const errors: string[] = []
  await Promise.all([
    firestore.recursiveDelete(roomRef).catch((error) => {
      errors.push(error instanceof Error ? error.message : String(error))
    }),
    firestore.recursiveDelete(roomAuthRef).catch((error) => {
      errors.push(error instanceof Error ? error.message : String(error))
    }),
    rtdb.ref(`presence/${roomId}`).remove().catch((error) => {
      errors.push(error instanceof Error ? error.message : String(error))
    }),
    rtdb.ref(`signals/${roomId}`).remove().catch((error) => {
      errors.push(error instanceof Error ? error.message : String(error))
    }),
  ])

  return NextResponse.json({ ok: errors.length === 0, errors })
}
