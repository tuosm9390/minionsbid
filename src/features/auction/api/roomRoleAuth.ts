// 경매방 역할 토큰을 서버에서 검증하는 헬퍼
import { timingSafeEqual } from 'node:crypto'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  ROOM_AUTH_COLLECTION,
  ROOM_AUTH_TEAM_TOKENS_COLLECTION,
} from '@/features/auction/utils/roomAuth'
import { parseRoomInviteToken } from '@/features/auction/utils/roomInviteToken'

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

  const invite = parseRoomInviteToken(token)
  const effectiveTeamId =
    invite?.role === 'LEADER' && invite.roomId === roomId && invite.teamId
      ? invite.teamId
      : teamId
  const effectiveToken =
    invite?.role === 'LEADER' && invite.roomId === roomId && invite.teamId === teamId
      ? invite.token
      : token

  const { firestore } = getAuctionServerServices()
  const teamSecretSnap = await firestore
    .collection(ROOM_AUTH_COLLECTION)
    .doc(roomId)
    .collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION)
    .doc(effectiveTeamId)
    .get()

  return isEqualToken(teamSecretSnap.data()?.leader_token, effectiveToken) ? null : LEADER_AUTH_ERROR
}

export async function requireRoomLeaderInvite(
  roomId: string,
  inviteToken?: string | null,
): Promise<{ error: string } | { teamId: string; leaderToken: string }> {
  if (!inviteToken) return { error: LEADER_AUTH_ERROR }

  const invite = parseRoomInviteToken(inviteToken)
  if (invite?.role !== 'LEADER' || invite.roomId !== roomId || !invite.teamId) {
    return { error: LEADER_AUTH_ERROR }
  }

  const authError = await requireRoomLeader(roomId, invite.teamId, inviteToken)
  if (authError) return { error: authError }

  return { teamId: invite.teamId, leaderToken: invite.token }
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
