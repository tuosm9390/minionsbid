// 주최자 토큰을 Firestore room_auth_secrets에서 검증한다.
import { timingSafeEqual } from 'node:crypto'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'

export const ORGANIZER_AUTH_ERROR = '주최자 권한이 필요합니다.'

export async function requireRoomOrganizer(
  roomId: string,
  token?: string,
): Promise<string | null> {
  if (!token) return ORGANIZER_AUTH_ERROR

  const { firestore } = getAuctionServerServices()
  const secretSnap = await firestore
    .collection('room_auth_secrets')
    .doc(roomId)
    .get()

  const expected = secretSnap.data()?.organizer_token
  if (typeof expected !== 'string' || expected.length !== token.length) {
    return ORGANIZER_AUTH_ERROR
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(token)) ? null : ORGANIZER_AUTH_ERROR
}
