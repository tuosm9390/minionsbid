import { useEffect, useRef, useState } from 'react'
import { Role, Team } from '@/features/auction/store/useAuctionStore'

interface UseRoomAuthProps {
  role: Role
  teamId?: string
  tokenParam: string | null
  isRoomLoaded: boolean
  roomExists: boolean
  storeOrganizerToken: string | null
  storeViewerToken: string | null
  teams: Team[]
  roomId: string
  setRoomContext: (roomId: string, role: Role, teamId?: string) => void
}

export function useRoomAuth({
  role,
  teamId,
  tokenParam,
  isRoomLoaded,
  roomExists,
  storeOrganizerToken,
  storeViewerToken,
  teams,
  roomId,
  setRoomContext
}: UseRoomAuthProps) {
  const [effectiveRole, setEffectiveRole] = useState<Role>(role)
  const tokenCheckedRef = useRef(false)

  useEffect(() => {
    setRoomContext(roomId, role, teamId)
  }, [roomId, role, teamId, setRoomContext])

  useEffect(() => {
    if (tokenCheckedRef.current || !isRoomLoaded || !roomExists) return
    // LEADER 역할일 때 teams 데이터가 아직 로드되지 않은 경우 검증을 지연
    if (role === 'LEADER' && teams.length === 0) return

    let valid = false
    if (role === 'ORGANIZER') {
      valid = tokenParam === storeOrganizerToken
    } else if (role === 'VIEWER') {
      valid = tokenParam === storeViewerToken
    } else if (role === 'LEADER') {
      const myTeam = teams.find(t => t.id === teamId)
      valid = !!myTeam && tokenParam === myTeam.leader_token
    } else {
      tokenCheckedRef.current = true
      return
    }

    tokenCheckedRef.current = true
    if (!valid) {
      console.warn('Invalid token or unauthorized access. Downgrading to null role.')
      setEffectiveRole(null)
      setRoomContext(roomId, null, undefined)
    }
  }, [storeOrganizerToken, storeViewerToken, teams, role, tokenParam, roomId, teamId, setRoomContext, isRoomLoaded, roomExists])

  return { effectiveRole }
}
