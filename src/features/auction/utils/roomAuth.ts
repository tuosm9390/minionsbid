import { timingSafeEqual } from 'node:crypto'
import type { Role } from '@/features/auction/store/useAuctionStore'

export type RoomAuthRole = Exclude<Role, null>

export const ROOM_AUTH_COLLECTION = 'room_auth_secrets'
export const ROOM_AUTH_TEAM_TOKENS_COLLECTION = 'team_tokens'

export type TokenDocuments = {
  roomAuthData?: Record<string, unknown> | null
  teamTokenData?: Record<string, unknown> | null
}

export type ValidateRoomAuthTokenArgs = {
  roomId: string
  role: RoomAuthRole
  teamId?: string | null
  token: string
  isFixtureEnabled: boolean
  verifyFixtureAccess: (args: {
    roomId: string
    role: RoomAuthRole
    token: string
    teamId?: string | null
  }) => boolean
  loadTokenDocuments: (args: {
    roomId: string
    role: RoomAuthRole
    teamId?: string | null
  }) => Promise<TokenDocuments | null>
}

export function isValidRoomRole(role: string | null | undefined): role is RoomAuthRole {
  return role === 'ORGANIZER' || role === 'LEADER' || role === 'VIEWER'
}

function getOrganizerToken(roomAuthData?: Record<string, unknown> | null) {
  return typeof roomAuthData?.organizer_token === 'string' ? roomAuthData.organizer_token : null
}

function getViewerToken(roomAuthData?: Record<string, unknown> | null) {
  return typeof roomAuthData?.viewer_token === 'string' ? roomAuthData.viewer_token : null
}

function getLeaderToken(teamTokenData?: Record<string, unknown> | null) {
  return typeof teamTokenData?.leader_token === 'string' ? teamTokenData.leader_token : null
}

function timingSafeStringEqual(stored: string | null, submitted: string): boolean {
  if (stored === null) return false
  if (stored.length !== submitted.length) return false
  return timingSafeEqual(Buffer.from(stored, 'utf8'), Buffer.from(submitted, 'utf8'))
}

export async function validateRoomAuthToken(args: ValidateRoomAuthTokenArgs) {
  const { roomId, role, teamId, token, isFixtureEnabled, verifyFixtureAccess, loadTokenDocuments } = args

  if (isFixtureEnabled) {
    return verifyFixtureAccess({ roomId, role, token, teamId })
  }

  const documents = await loadTokenDocuments({ roomId, role, teamId })
  if (!documents) {
    return false
  }

  if (role === 'ORGANIZER') {
    return timingSafeStringEqual(getOrganizerToken(documents.roomAuthData), token)
  }

  if (role === 'VIEWER') {
    return timingSafeStringEqual(getViewerToken(documents.roomAuthData), token)
  }

  if (!teamId) {
    return false
  }

  return timingSafeStringEqual(getLeaderToken(documents.teamTokenData), token)
}
