import { useEffect } from 'react'
import { Role } from '@/features/auction/store/useAuctionStore'

interface UseRoomAuthProps {
  role: Role
  teamId?: string
  roomAuthToken?: string | null
  roomId: string
  setRoomContext: (roomId: string, role: Role, teamId?: string, roomAuthToken?: string) => void
}

export function useRoomAuth({ role, teamId, roomAuthToken, roomId, setRoomContext }: UseRoomAuthProps) {
  useEffect(() => {
    setRoomContext(roomId, role, teamId, roomAuthToken ?? undefined)
  }, [roomId, role, teamId, roomAuthToken, setRoomContext])

  return { effectiveRole: role, isTokenChecked: true }
}
