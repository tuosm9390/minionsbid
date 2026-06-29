import { Metadata } from 'next'
import { RoomClient } from './RoomClient'
import { Role } from '@/features/auction/store/useAuctionStore'
import { isValidRoomRole } from '@/features/auction/utils/roomAuth'
import { parseRoomInviteToken } from '@/features/auction/utils/roomInviteToken'

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ role?: string; teamId?: string; token?: string; authToken?: string; invite?: string }>

export const runtime = 'nodejs'
export const preferredRegion = 'sin1'

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const resolvedParams = await params
  return {
    title: `경매방 입장 (ID: ${resolvedParams.id})`,
    description: `미니언즈 경매 시스템 - 실시간 경매가 진행 중인 방(${resolvedParams.id})에 참여하세요.`,
    robots: { index: false, follow: false },
  }
}

export default async function RoomPage(props: {
  params: Params
  searchParams: SearchParams
}) {
  const resolvedParams = await props.params
  const resolvedSearchParams = await props.searchParams
  const roomId = resolvedParams.id

  const rawRole = resolvedSearchParams.role
  const inviteToken = resolvedSearchParams.invite || null
  const invite = inviteToken ? parseRoomInviteToken(inviteToken) : null
  const isValidInvite = invite?.roomId === roomId
  const role: Role = isValidInvite
    ? invite.role
    : isValidRoomRole(rawRole)
      ? rawRole
      : null
  const teamId = role === 'LEADER'
    ? isValidInvite
      ? invite.teamId ?? null
      : resolvedSearchParams.teamId || null
    : null
  const roomAuthToken = isValidInvite
    ? inviteToken
    : resolvedSearchParams.token || resolvedSearchParams.authToken || null

  return (
    <RoomClient
      roomId={roomId}
      roleParam={role}
      teamIdParam={teamId}
      roomAuthTokenParam={roomAuthToken}
    />
  )
}
