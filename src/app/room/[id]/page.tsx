import { Metadata } from 'next'
import { cookies } from 'next/headers'
import { RoomClient } from './RoomClient'
import { Role } from '@/features/auction/store/useAuctionStore'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  isE2EAuctionFixtureEnabled,
  verifyE2EAuctionFixtureAccess,
} from '@/features/auction/api/e2eAuctionFixture'
import {
  buildRoomAuthCookieName,
  isRoomAuthCookieMatch,
  isValidRoomRole,
  parseRoomAuthCookie,
  ROOM_AUTH_COLLECTION,
  ROOM_AUTH_TEAM_TOKENS_COLLECTION,
  validateRoomAuthToken,
} from '@/features/auction/utils/roomAuth'

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ role?: string; teamId?: string; authToken?: string }>
const AUTH_DEBUG =
  process.env.NEXT_PUBLIC_DEBUG_LATENCY === '1' ||
  process.env.DEBUG_LATENCY === '1'

export const runtime = 'nodejs'
export const preferredRegion = 'sin1'

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const resolvedParams = await params;
  return {
    title: `경매방 입장 (ID: ${resolvedParams.id})`,
    description: `미니언즈 경매 시스템 - 실시간 경매가 진행 중인 방(${resolvedParams.id})에 참여하세요.`,
    robots: { index: false, follow: false },
  };
}

export default async function RoomPage(props: {
  params: Params
  searchParams: SearchParams
}) {
  const resolvedParams = await props.params
  const resolvedSearchParams = await props.searchParams
  const roomId = resolvedParams.id

  const rawRole = resolvedSearchParams.role
  const authTokenParam = resolvedSearchParams.authToken || null
  const roleParam: Role = isValidRoomRole(rawRole) ? rawRole : null
  const teamIdParam = resolvedSearchParams.teamId || null

  let role: Role | null = null
  let teamId: string | null = null

  if (roleParam) {
    const cookieName = buildRoomAuthCookieName(roomId, roleParam, teamIdParam)

    const cookieStore = await cookies()
    const authCookie = cookieStore.get(cookieName)

    if (authCookie) {
      const parsed = parseRoomAuthCookie(authCookie.value)
      if (parsed && isRoomAuthCookieMatch({ parsed, role: roleParam, teamId: teamIdParam })) {
        role = parsed.role
        teamId = parsed.teamId
      } else {
        console.error('[room-page] auth cookie mismatch')
      }
    }

    if (AUTH_DEBUG) {
      console.info('[room-page] auth resolution', {
        roomId,
        roleParam,
        teamIdParam,
        cookieName,
        hasCookie: Boolean(authCookie),
        resolvedRole: role,
        resolvedTeamId: teamId,
      })
    }
  } else if (AUTH_DEBUG) {
    console.info('[room-page] no valid role param', {
      roomId,
      rawRole,
      teamIdParam,
    })
  }

  if (role === null && roleParam && authTokenParam) {
    try {
      const isValid = await validateRoomAuthToken({
        roomId,
        role: roleParam,
        teamId: teamIdParam,
        token: authTokenParam,
        isFixtureEnabled: isE2EAuctionFixtureEnabled(),
        verifyFixtureAccess: (args) =>
          verifyE2EAuctionFixtureAccess({
            roomId: args.roomId,
            role: args.role,
            token: args.token,
            teamId: args.teamId,
          }),
        loadTokenDocuments: async ({ roomId: targetRoomId, role: targetRole, teamId: targetTeamId }) => {
          const { firestore } = getAuctionServerServices()
          const [roomDoc, roomAuthDoc] = await Promise.all([
            firestore.collection('rooms').doc(targetRoomId).get(),
            firestore.collection(ROOM_AUTH_COLLECTION).doc(targetRoomId).get(),
          ])

          if (!roomDoc.exists) {
            return null
          }

          if (targetRole === 'LEADER' && targetTeamId) {
            const [teamDoc, teamTokenDoc] = await Promise.all([
              firestore.collection('rooms').doc(targetRoomId).collection('teams').doc(targetTeamId).get(),
              firestore
                .collection(ROOM_AUTH_COLLECTION)
                .doc(targetRoomId)
                .collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION)
                .doc(targetTeamId)
                .get(),
            ])
            return {
              roomData: roomDoc.data() ?? {},
              roomAuthData: roomAuthDoc.data() ?? {},
              teamData: teamDoc.data() ?? {},
              teamTokenData: teamTokenDoc.data() ?? {},
            }
          }

          return {
            roomData: roomDoc.data() ?? {},
            roomAuthData: roomAuthDoc.data() ?? {},
          }
        },
      })

      if (isValid) {
        role = roleParam
        teamId = roleParam === 'LEADER' ? teamIdParam : null
        if (AUTH_DEBUG) {
          console.warn('[room-page] token fallback applied', {
            roomId,
            roleParam,
            teamIdParam,
          })
        }
      }
    } catch (error) {
      console.error('[room-page] token fallback failed', error)
    }
  }

  if (AUTH_DEBUG) {
    console.info('[room-page] final auth', {
      roomId,
      rawRole,
      roleParam,
      teamIdParam,
      hasAuthTokenParam: Boolean(authTokenParam),
      resolvedRole: role,
      resolvedTeamId: teamId,
    })
  }

  return (
    <RoomClient
      roomId={roomId}
      roleParam={role}
      teamIdParam={teamId}
    />
  )
}
