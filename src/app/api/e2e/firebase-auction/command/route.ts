// Firebase Emulator 통합 E2E용 경매 진행 command API
import { NextRequest, NextResponse } from 'next/server'
import { closeLotteryAction, drawNextPlayer, startAuction } from '@/features/auction/api/auctionFlowActions'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'

type CommandPayload = {
  roomId?: string
  organizerToken?: string
  action?: 'startFirstRound'
  durationMs?: number
}

function isFirebaseEmulatorE2EEnabled() {
  return process.env.USE_FIREBASE_EMULATOR === '1'
}

export async function POST(request: NextRequest) {
  if (!isFirebaseEmulatorE2EEnabled()) {
    return NextResponse.json({ error: 'firebase emulator e2e disabled' }, { status: 404 })
  }

  const payload = (await request.json().catch(() => null)) as CommandPayload | null
  const roomId = payload?.roomId?.trim()
  const organizerToken = payload?.organizerToken?.trim()

  if (!roomId || !organizerToken || payload?.action !== 'startFirstRound') {
    return NextResponse.json({ error: 'roomId, organizerToken, action이 필요합니다.' }, { status: 400 })
  }

  const drawResult = await drawNextPlayer(roomId, organizerToken)
  if (drawResult.error) {
    return NextResponse.json(drawResult, { status: 400 })
  }

  const { firestore } = getAuctionServerServices()
  const roomRef = firestore.collection('rooms').doc(roomId)
  const roomSnap = await roomRef.get()
  const currentPlayerId = roomSnap.data()?.current_player_id

  if (typeof currentPlayerId !== 'string') {
    return NextResponse.json({ error: 'current player missing after draw' }, { status: 500 })
  }

  const playerSnap = await roomRef.collection('players').doc(currentPlayerId).get()
  const playerName = playerSnap.data()?.name
  if (typeof playerName !== 'string') {
    return NextResponse.json({ error: 'current player name missing after draw' }, { status: 500 })
  }

  const closeResult = await closeLotteryAction(roomId, playerName, organizerToken)
  if (closeResult.error) {
    return NextResponse.json(closeResult, { status: 400 })
  }

  const startResult = await startAuction(roomId, organizerToken, payload.durationMs ?? 60_000)
  return NextResponse.json(startResult, { status: startResult.error ? 400 : 200 })
}
