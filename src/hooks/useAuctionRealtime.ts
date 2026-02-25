import { useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuctionStore, PresenceUser, Bid, Message, Player, Team } from '@/store/useAuctionStore'

export function useAuctionRealtime(roomId: string | null) {
  const setRealtimeData = useAuctionStore(s => s.setRealtimeData)
  const setRoomNotFound = useAuctionStore(s => s.setRoomNotFound)
  const setReAuctionRound = useAuctionStore(s => s.setReAuctionRound)
  const updatePlayer = useAuctionStore(s => s.updatePlayer)
  const updateTeam = useAuctionStore(s => s.updateTeam)
  const addBid = useAuctionStore(s => s.addBid)
  const addMessage = useAuctionStore(s => s.addMessage)
  const role = useAuctionStore(s => s.role)
  const teamId = useAuctionStore(s => s.teamId)

  // 동시 fetch 방지: fetchAll 진행 중일 때 중복 요청 스킵
  const fetchingRef = useRef(false)

  // 전체 데이터 로드 — 초기 로드 및 특정 상황(INSERT/DELETE 등)에서 사용
  const fetchAll = useCallback(async () => {
    if (!roomId) return
    if (fetchingRef.current) return  // 이미 fetch 중이면 스킵 (dedup)
    fetchingRef.current = true
    try {
      const [roomRes, teamsRes, playersRes, bidsRes, messagesRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
        supabase.from('teams').select('*').eq('room_id', roomId),
        supabase.from('players').select('*').eq('room_id', roomId),
        supabase.from('bids').select('*').eq('room_id', roomId).order('created_at', { ascending: true }),
        supabase.from('messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).limit(200),
      ])

      if (!roomRes.data) {
        setRoomNotFound()
        return
      }

      if (roomRes.data) {
        setRealtimeData({
          basePoint: roomRes.data.base_point,
          totalTeams: roomRes.data.total_teams,
          membersPerTeam: roomRes.data.members_per_team ?? 5,
          orderPublic: roomRes.data.order_public ?? true,
          timerEndsAt: roomRes.data.timer_ends_at,
          createdAt: roomRes.data.created_at,
          roomName: roomRes.data.name,
          organizerToken: roomRes.data.organizer_token,
          viewerToken: roomRes.data.viewer_token,
        })
      }

      // 재경매 이력 확인
      const hasReAuctionMsg = (messagesRes.data || []).some(m =>
        m.sender_role === 'SYSTEM' && m.content.includes('재경매를 재개합니다')
      )
      if (hasReAuctionMsg) setReAuctionRound(true)

      setRealtimeData({
        teams: teamsRes.data || [],
        bids: bidsRes.data || [],
        players: playersRes.data || [],
        messages: messagesRes.data || [],
      })
    } catch (err) {
      console.error('fetchAll error:', err)
    } finally {
      fetchingRef.current = false
    }
  }, [roomId, setRealtimeData, setRoomNotFound, setReAuctionRound])

  // ── 실시간 구독 ──
  useEffect(() => {
    if (!roomId) return

    fetchAll()

    const channel = supabase
      .channel(`room-data:${roomId}`)
      // rooms 변경: 타이머·토큰 등 필요한 필드만 즉시 반영
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          setRealtimeData({
            timerEndsAt: payload.new.timer_ends_at,
            organizerToken: payload.new.organizer_token,
            viewerToken: payload.new.viewer_token,
            roomName: payload.new.name,
            orderPublic: payload.new.order_public,
          })
        }
      )
      // players 변경 → UPDATE 시 점진적 반영, 그 외(INSERT/DELETE)는 fetchAll
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            updatePlayer(payload.new as Player)
          } else {
            fetchAll()
          }
        }
      )
      // teams 변경 → UPDATE 시 점진적 반영
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            updateTeam(payload.new as Team)
          } else {
            fetchAll()
          }
        }
      )
      // bids INSERT → 즉시 추가 (빠른 반응) + 전체 리프레시
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `room_id=eq.${roomId}` },
        (payload) => {
          addBid(payload.new as Bid)
        }
      )
      // messages INSERT → 즉시 추가
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const msg = payload.new as Message
          if (msg.sender_role === 'SYSTEM' && msg.content.includes('재경매를 재개합니다')) {
            setReAuctionRound(true)
          }
          addMessage(msg)
        }
      )
      .subscribe((status) => {
        // 구독 성공 시 한 번 더 최신 데이터 패치
        if (status === 'SUBSCRIBED') fetchAll()
      })

    return () => { supabase.removeChannel(channel) }
  }, [roomId, fetchAll, setRealtimeData, addBid, addMessage, setReAuctionRound, setRoomNotFound])

  // ── Presence tracking ──
  useEffect(() => {
    if (!roomId || !role) return

    const presenceChannel = supabase.channel(`presence:${roomId}`)

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        const presences = Object.values(state).flat() as unknown as PresenceUser[]
        setRealtimeData({ presences })
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ role, teamId })
        }
      })

    return () => { supabase.removeChannel(presenceChannel) }
  }, [roomId, role, teamId, setRealtimeData])
}
