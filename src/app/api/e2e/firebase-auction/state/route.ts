// Firebase Emulator 통합 E2E 상태를 진단하는 API route
import { NextRequest, NextResponse } from 'next/server'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import { ROOM_AUTH_COLLECTION, ROOM_AUTH_TEAM_TOKENS_COLLECTION } from '@/features/auction/utils/roomAuth'

function isFirebaseEmulatorE2EEnabled() {
  return process.env.USE_FIREBASE_EMULATOR === '1'
}

export async function GET(request: NextRequest) {
  if (!isFirebaseEmulatorE2EEnabled()) {
    return NextResponse.json({ error: 'firebase emulator e2e disabled' }, { status: 404 })
  }

  const roomId = request.nextUrl.searchParams.get('roomId')?.trim()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId가 필요합니다.' }, { status: 400 })
  }

  const { firestore, rtdb } = getAuctionServerServices()
  const roomRef = firestore.collection('rooms').doc(roomId)
  const roomAuthRef = firestore.collection(ROOM_AUTH_COLLECTION).doc(roomId)

  const [roomSnap, teamsSnap, playersSnap, bidsSnap, authSnap, tokenSnap, presenceSnap] =
    await Promise.all([
      roomRef.get(),
      roomRef.collection('teams').get(),
      roomRef.collection('players').get(),
      roomRef.collection('bids').get(),
      roomAuthRef.get(),
      roomAuthRef.collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION).get(),
      rtdb.ref(`presence/${roomId}`).get(),
    ])

  if (!roomSnap.exists) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 })
  }

  const roomData = roomSnap.data() ?? {}
  const presence = (presenceSnap.val() ?? {}) as Record<string, { role?: string; teamId?: string | null }>
  const presenceRows = Object.entries(presence).map(([sessionId, value]) => ({
    sessionId,
    role: value.role ?? null,
    teamId: value.teamId ?? null,
  }))

  return NextResponse.json({
    roomId,
    room: {
      currentPlayerId: roomData.current_player_id ?? null,
      timerEndsAt: roomData.timer_ends_at?.toDate?.().toISOString?.() ?? null,
      auctionRevision: roomData.auction_revision ?? null,
      activeBid: roomData.active_bid ?? null,
    },
    counts: {
      teams: teamsSnap.size,
      players: playersSnap.size,
      bids: bidsSnap.size,
      teamTokens: tokenSnap.size,
      presences: presenceRows.length,
      leaderPresences: presenceRows.filter((row) => row.role === 'LEADER').length,
    },
    auth: {
      hasRoomAuth: authSnap.exists,
    },
    teams: teamsSnap.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name ?? null,
      pointBalance: doc.data().point_balance ?? null,
    })),
    bids: bidsSnap.docs.map((doc) => ({
      id: doc.id,
      teamId: doc.data().team_id ?? null,
      amount: doc.data().amount ?? null,
    })),
    presence: presenceRows,
  })
}
