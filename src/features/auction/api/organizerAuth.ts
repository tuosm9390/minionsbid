// 경매방 주최자 권한을 서버 쿠키와 저장된 토큰으로 검증한다.
import { cookies } from 'next/headers'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  buildRoomAuthCookieName,
  parseRoomAuthCookie,
  ROOM_AUTH_COLLECTION,
  validateRoomAuthToken,
} from '@/features/auction/utils/roomAuth'
import {
  isE2EAuctionFixtureEnabled,
  verifyE2EAuctionFixtureAccess,
} from '@/features/auction/api/e2eAuctionFixture'

export const ORGANIZER_AUTH_ERROR = '주최자 권한이 필요합니다.'

export async function requireRoomOrganizer(roomId: string): Promise<string | null> {
  const cookieStore = await cookies()
  const cookieName = buildRoomAuthCookieName(roomId, 'ORGANIZER')
  const authCookie = cookieStore.get(cookieName)
  const parsed = parseRoomAuthCookie(authCookie?.value)

  if (
    !parsed ||
    parsed.role !== 'ORGANIZER' ||
    parsed.teamId !== null ||
    typeof parsed.token !== 'string'
  ) {
    return ORGANIZER_AUTH_ERROR
  }

  const isValid = await validateRoomAuthToken({
    roomId,
    role: 'ORGANIZER',
    token: parsed.token,
    isFixtureEnabled: isE2EAuctionFixtureEnabled(),
    verifyFixtureAccess: (args) =>
      verifyE2EAuctionFixtureAccess({
        roomId: args.roomId,
        role: args.role,
        token: args.token,
        teamId: args.teamId,
      }),
    loadTokenDocuments: async ({ roomId: targetRoomId }) => {
      const { firestore } = getAuctionServerServices()
      const [roomDoc, roomAuthDoc] = await Promise.all([
        firestore.collection('rooms').doc(targetRoomId).get(),
        firestore.collection(ROOM_AUTH_COLLECTION).doc(targetRoomId).get(),
      ])

      if (!roomDoc.exists) {
        return null
      }

      return {
        roomData: roomDoc.data() ?? {},
        roomAuthData: roomAuthDoc.data() ?? {},
      }
    },
  })

  return isValid ? null : ORGANIZER_AUTH_ERROR
}
