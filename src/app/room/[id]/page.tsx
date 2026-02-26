import { RoomClient } from './RoomClient'
import { Role } from '@/features/auction/store/useAuctionStore'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>
type Params = Promise<{ id: string }>

export default async function RoomPage(props: {
  params: Params
  searchParams: SearchParams
}) {
  const resolvedParams = await props.params
  const resolvedSearchParams = await props.searchParams

  const roleParam = (resolvedSearchParams.role as Role) || null
  const teamIdParam = (resolvedSearchParams.teamId as string) || null
  const tokenParam = (resolvedSearchParams.token as string) || null

  return (
    <RoomClient
      roomId={resolvedParams.id}
      roleParam={roleParam}
      teamIdParam={teamIdParam}
      tokenParam={tokenParam}
    />
  )
}