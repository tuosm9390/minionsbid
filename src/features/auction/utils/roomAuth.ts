import type { Role } from '@/features/auction/store/useAuctionStore'

export type RoomAuthRole = Exclude<Role, null>

export const ROOM_AUTH_COLLECTION = 'room_auth_secrets'
export const ROOM_AUTH_TEAM_TOKENS_COLLECTION = 'team_tokens'

export type TokenDocuments = {
  roomData?: Record<string, unknown> | null
  roomAuthData?: Record<string, unknown> | null
  teamData?: Record<string, unknown> | null
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

function getOrganizerToken(roomData?: Record<string, unknown> | null, roomAuthData?: Record<string, unknown> | null) {
  return typeof roomAuthData?.organizer_token === 'string'
    ? roomAuthData.organizer_token
    : typeof roomData?.organizer_token === 'string'
      ? roomData.organizer_token
      : null
}

function getViewerToken(roomData?: Record<string, unknown> | null, roomAuthData?: Record<string, unknown> | null) {
  return typeof roomAuthData?.viewer_token === 'string'
    ? roomAuthData.viewer_token
    : typeof roomData?.viewer_token === 'string'
      ? roomData.viewer_token
      : null
}

function getLeaderToken(teamData?: Record<string, unknown> | null, teamTokenData?: Record<string, unknown> | null) {
  return typeof teamTokenData?.leader_token === 'string'
    ? teamTokenData.leader_token
    : typeof teamData?.leader_token === 'string'
      ? teamData.leader_token
      : null
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
    return getOrganizerToken(documents.roomData, documents.roomAuthData) === token
  }

  if (role === 'VIEWER') {
    return getViewerToken(documents.roomData, documents.roomAuthData) === token
  }

  if (!teamId) {
    return false
  }

  return getLeaderToken(documents.teamData, documents.teamTokenData) === token
}
