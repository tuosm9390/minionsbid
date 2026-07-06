// Socket.IO 서버가 확정한 공개 입찰을 Firestore 정본 상태에 저장한다.
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import type { SocketAuctionAcceptedEvent } from '@/features/auction/socket/socketContracts'
import type {
  AuctionEventEnvelope,
} from '@/features/auction/utils/auctionRealtime'

export async function persistSocketAcceptedBid(event: SocketAuctionAcceptedEvent) {
  const bid = event.state.currentBid
  if (!bid || !event.state.currentPlayerId || !event.state.timerEndsAt) return

  const roomRef = adminDb.collection('rooms').doc(event.state.roomId)
  const bidRef = roomRef.collection('bids').doc(bid.eventId)
  const liveBid = {
    event_id: bid.eventId,
    player_id: bid.playerId,
    team_id: bid.teamId,
    amount: bid.amount,
    created_at: bid.createdAt,
  }
  const timerTimestamp = Timestamp.fromDate(new Date(event.state.timerEndsAt))
  const auctionEvent: AuctionEventEnvelope = {
    eventId: bid.eventId,
    revision: event.state.sequence,
    roomId: event.state.roomId,
    type: 'BID_PLACED',
    serverCreatedAt: new Date(event.state.serverTime || Date.now()).toISOString(),
    currentPlayerId: event.state.currentPlayerId,
    timerEndsAt: event.state.timerEndsAt,
    timerDurationMs: null,
    liveBid,
  }

  await adminDb.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef)
    if (!roomSnap.exists) {
      throw new Error('방을 찾을 수 없습니다.')
    }
    const roomData = roomSnap.exists ? (roomSnap.data() ?? {}) : {}
    const currentRevision =
      typeof roomData.auction_revision === 'number' ? roomData.auction_revision : 0
    if (currentRevision > event.state.sequence) {
      throw new Error('Firestore revision이 Socket sequence보다 최신입니다.')
    }
    if (
      typeof roomData.current_player_id === 'string' &&
      roomData.current_player_id !== event.state.currentPlayerId
    ) {
      throw new Error('Firestore 정본의 현재 경매 선수와 Socket 입찰 선수가 일치하지 않습니다.')
    }
    const currentTimer = roomData.timer_ends_at
    if (
      currentTimer &&
      typeof currentTimer.toMillis === 'function' &&
      currentTimer.toMillis() <= Date.now()
    ) {
      throw new Error('Firestore 정본의 경매 시간이 이미 종료되었습니다.')
    }
    const currentBid = roomData.active_bid
    if (
      currentBid &&
      typeof currentBid.amount === 'number' &&
      currentBid.event_id !== bid.eventId &&
      currentBid.amount >= bid.amount
    ) {
      throw new Error('Firestore 정본의 최고 입찰액보다 높은 금액만 저장할 수 있습니다.')
    }

    tx.update(roomRef, {
      current_player_id: event.state.currentPlayerId,
      timer_ends_at: timerTimestamp,
      active_bid: liveBid,
      auction_revision: event.state.sequence,
      last_auction_event: auctionEvent,
    })
    tx.set(bidRef, {
      event_id: bid.eventId,
      room_id: event.state.roomId,
      player_id: bid.playerId,
      team_id: bid.teamId,
      amount: bid.amount,
      created_at: Timestamp.fromDate(new Date(bid.createdAt)),
    })
  })
}
