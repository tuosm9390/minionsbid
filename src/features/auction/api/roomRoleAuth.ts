// 경매방 역할 토큰을 서버에서 검증하는 헬퍼
import { timingSafeEqual } from 'node:crypto'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  ROOM_AUTH_COLLECTION,
  ROOM_AUTH_TEAM_TOKENS_COLLECTION,
} from '@/features/auction/utils/roomAuth'

export const LEADER_AUTH_ERROR = '팀장 권한이 필요합니다.'
export const VIEWER_AUTH_ERROR = '관전자 권한이 필요합니다.'

function isEqualToken(expected: unknown, token?: string | null) {
  if (!token || typeof expected !== 'string' || expected.length !== token.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token))
}

export async function requireRoomLeader(
  roomId: string,
  teamId: string,
  token?: string | null,
): Promise<string | null> {
  if (!teamId || !token) return LEADER_AUTH_ERROR

  const { firestore } = getAuctionServerServices()
  const teamSecretSnap = await firestore
    .collection(ROOM_AUTH_COLLECTION)
    .doc(roomId)
    .collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION)
    .doc(teamId)
    .get()

  return isEqualToken(teamSecretSnap.data()?.leader_token, token) ? null : LEADER_AUTH_ERROR
}

export async function requireRoomViewer(
  roomId: string,
  token?: string | null,
): Promise<string | null> {
  if (!token) return VIEWER_AUTH_ERROR

  const { firestore } = getAuctionServerServices()
  const secretSnap = await firestore.collection(ROOM_AUTH_COLLECTION).doc(roomId).get()

  return isEqualToken(secretSnap.data()?.viewer_token, token) ? null : VIEWER_AUTH_ERROR
}
