import { Metadata } from 'next'
import { RoomClient } from './RoomClient'
import { Role } from '@/features/auction/store/useAuctionStore'
import { isValidRoomRole } from '@/features/auction/utils/roomAuth'

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ role?: string; teamId?: string }>

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
  const role: Role = isValidRoomRole(rawRole) ? rawRole : null
  const teamId = role === 'LEADER' ? (resolvedSearchParams.teamId || null) : null

  return (
    <RoomClient
      roomId={roomId}
      roleParam={role}
      teamIdParam={teamId}
    />
  )
}
