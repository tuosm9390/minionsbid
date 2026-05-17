// 소규모 지인용 경매방에서는 URL role을 신뢰하고 서버 액션 토큰 검증은 수행하지 않는다.
export const ORGANIZER_AUTH_ERROR = '주최자 권한이 필요합니다.'

export async function requireRoomOrganizer(
  _roomId: string,
  _token?: string,
): Promise<string | null> {
  return null
}
