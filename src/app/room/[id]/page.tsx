import { cookies } from 'next/headers'
import { RoomClient } from './RoomClient'
import { Role } from '@/features/auction/store/useAuctionStore'

type Params = Promise<{ id: string }>

export default async function RoomPage(props: {
  params: Params
}) {
  const resolvedParams = await props.params
  const roomId = resolvedParams.id
  
  const cookieStore = await cookies()
  const cookieName = `room_auth_${roomId}`

  const authCookie = cookieStore.get(cookieName)
  let role: Role | null = null
  let teamId: string | null = null
  let token: string | null = null

  if (authCookie) {
    try {
      const parsed = JSON.parse(authCookie.value)
      role = parsed.role || null
      teamId = parsed.teamId || null
      token = parsed.token || null
    } catch (e) {
      console.error('Failed to parse auth cookie', e)
    }
  }

  return (
    <RoomClient
      roomId={roomId}
      roleParam={role}
      teamIdParam={teamId}
      tokenParam={token}
    />
  )
}