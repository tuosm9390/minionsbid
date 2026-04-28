import { Metadata } from 'next'
import { cookies } from 'next/headers'
import { RoomClient } from './RoomClient'
import { Role } from '@/features/auction/store/useAuctionStore'

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ role?: string; teamId?: string }>

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

  const VALID_ROLES = ['ORGANIZER', 'LEADER', 'VIEWER'] as const
  const rawRole = resolvedSearchParams.role
  const roleParam: Role = rawRole && VALID_ROLES.includes(rawRole as typeof VALID_ROLES[number])
    ? (rawRole as Role)
    : null
  const teamIdParam = resolvedSearchParams.teamId || null

  let role: Role | null = null
  let teamId: string | null = null

  if (roleParam) {
    const cookieSuffix =
      roleParam === 'LEADER' && teamIdParam
        ? `LEADER_${teamIdParam}`
        : roleParam.toUpperCase()
    const cookieName = `room_auth_${roomId}_${cookieSuffix}`

    const cookieStore = await cookies()
    const authCookie = cookieStore.get(cookieName)

    if (authCookie) {
      try {
        const parsed = JSON.parse(authCookie.value)
        role = parsed.role || null
        teamId = parsed.teamId || null
      } catch (e) {
        console.error('Failed to parse auth cookie', e)
      }
    }
  }

  return (
    <RoomClient
      roomId={roomId}
      roleParam={role}
      teamIdParam={teamId}
    />
  )
}
