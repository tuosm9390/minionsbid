import { useEffect } from 'react'
import { Role } from '@/features/auction/store/useAuctionStore'

interface UseRoomAuthProps {
  role: Role
  teamId?: string
  organizerToken?: string | null
  roomId: string
  setRoomContext: (roomId: string, role: Role, teamId?: string, organizerToken?: string) => void
}

export function useRoomAuth({ role, teamId, organizerToken, roomId, setRoomContext }: UseRoomAuthProps) {
  useEffect(() => {
    setRoomContext(roomId, role, teamId, organizerToken ?? undefined)
  }, [roomId, role, teamId, organizerToken, setRoomContext])

  return { effectiveRole: role, isTokenChecked: true }
}
