import { supabase } from '@/lib/supabase'

const AUCTION_DURATION_MS = 15_000      // 경매 시간 15초
const EXTEND_THRESHOLD_MS = 5_000      // 5초 이하 입찰 시 연장
const EXTEND_DURATION_MS = 5_000      // 5초 연장

async function sysMsg(roomId: string, content: string) {
  await supabase.from('messages').insert([{
    room_id: roomId,
    sender_name: '시스템',
    sender_role: 'SYSTEM',
    content,
  }])
}

/** 랜덤으로 WAITING 선수 1명을 IN_AUCTION으로 전환하고 타이머 시작 */
export async function drawNextPlayer(roomId: string): Promise<{ error?: string }> {
  const { data: waiting } = await supabase
    .from('players')
    .select('id, name')
    .eq('room_id', roomId)
    .eq('status', 'WAITING')

  if (!waiting || waiting.length === 0) {
    return { error: '대기 중인 선수가 없습니다.' }
  }

  const player = waiting[Math.floor(Math.random() * waiting.length)]

  const { error: pErr } = await supabase
    .from('players')
    .update({ status: 'IN_AUCTION' })
    .eq('id', player.id)
  if (pErr) return { error: pErr.message }

  const { error: rErr } = await supabase
    .from('rooms')
    .update({ current_player_id: player.id })
    .eq('id', roomId)
  if (rErr) return { error: rErr.message }

  return {}
}

/** 경매(타이머) 시작 */
export async function startAuction(roomId: string): Promise<{ error?: string }> {
  // 현재 경매중인 선수 조회
  const { data: room } = await supabase
    .from('rooms')
    .select('current_player_id')
    .eq('id', roomId)
    .single()

  if (!room?.current_player_id) return { error: '진행할 선수가 없습니다.' }

  const { data: player } = await supabase
    .from('players')
    .select('name')
    .eq('id', room.current_player_id)
    .single()

  const timerEndsAt = new Date(Date.now() + AUCTION_DURATION_MS).toISOString()
  const { error: rErr } = await supabase
    .from('rooms')
    .update({ timer_ends_at: timerEndsAt })
    .eq('id', roomId)
  if (rErr) return { error: rErr.message }

  await sysMsg(roomId, `▶️ ${player?.name || '현재'} 선수 경매 시작! (${AUCTION_DURATION_MS / 1000}초)`)
  return {}
}

/** 팀장이 입찰. 5초 이하 남았으면 타이머 연장 */
export async function placeBid(
  roomId: string,
  playerId: string,
  teamId: string,
  amount: number,
): Promise<{ error?: string }> {
  // 입찰액 기본 검증
  if (!Number.isInteger(amount) || amount <= 0) {
    return { error: '입찰액은 양의 정수여야 합니다.' }
  }
  if (amount % 10 !== 0) {
    return { error: '입찰액은 10P 단위여야 합니다.' }
  }

  // 경매 진행 중인지 확인 (타이머 유효 여부)
  const { data: room } = await supabase
    .from('rooms')
    .select('timer_ends_at, current_player_id')
    .eq('id', roomId)
    .single()

  if (!room?.timer_ends_at || !room?.current_player_id) {
    return { error: '현재 경매가 진행 중이지 않습니다.' }
  }
  if (new Date(room.timer_ends_at).getTime() <= Date.now()) {
    return { error: '경매 시간이 종료되었습니다.' }
  }
  if (room.current_player_id !== playerId) {
    return { error: '현재 경매 중인 선수가 아닙니다.' }
  }

  // 본인이 이미 최고 입찰자인지 확인 (+ 최솟값 검증용 amount 포함)
  const { data: topBid } = await supabase
    .from('bids')
    .select('team_id, amount')
    .eq('player_id', playerId)
    .eq('room_id', roomId)
    .order('amount', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (topBid && topBid.team_id === teamId) {
    return { error: '현재 최고 입찰자입니다. 추가 입찰이 불가능합니다.' }
  }

  // 서버에서 최소 입찰액 검증
  const minRequired = topBid ? topBid.amount + 10 : 10
  if (amount < minRequired) {
    return { error: `최소 입찰액은 ${minRequired.toLocaleString()}P 입니다.` }
  }

  const { data: team } = await supabase
    .from('teams')
    .select('point_balance, name')
    .eq('id', teamId)
    .single()

  if (!team) return { error: '팀 정보를 불러올 수 없습니다.' }
  if (team.point_balance < amount) {
    return { error: `포인트 부족 (보유: ${team.point_balance.toLocaleString()}P)` }
  }

  // 팀 정원 초과 검증
  const { data: roomInfo } = await supabase
    .from('rooms').select('members_per_team').eq('id', roomId).single()
  const { count: soldCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('status', 'SOLD')
  const maxPlayers = (roomInfo?.members_per_team ?? 5) - 1
  if ((soldCount ?? 0) >= maxPlayers) {
    return { error: '팀 인원이 가득 찼습니다.' }
  }

  const { error: bidErr } = await supabase.from('bids').insert([{
    room_id: roomId,
    player_id: playerId,
    team_id: teamId,
    amount,
  }])
  if (bidErr) return { error: bidErr.message }

  // 타이머 연장 체크
  const { data: currentRoom } = await supabase
    .from('rooms').select('timer_ends_at').eq('id', roomId).single()

  if (currentRoom?.timer_ends_at) {
    const remaining = new Date(currentRoom.timer_ends_at).getTime() - Date.now()
    if (remaining > 0 && remaining < EXTEND_THRESHOLD_MS) {
      const newEnd = new Date(Date.now() + EXTEND_DURATION_MS).toISOString()
      await supabase.from('rooms').update({ timer_ends_at: newEnd }).eq('id', roomId)
    }
  }

  await sysMsg(roomId, `💰 ${team.name}이(가) ${amount.toLocaleString()}P로 입찰!`)
  return {}
}

/** 타이머 만료 후 낙찰 처리. 입찰이 없으면 WAITING으로 복귀 */
export async function awardPlayer(
  roomId: string,
  playerId: string,
): Promise<{ error?: string }> {
  // 멱등성 보장: 이미 처리됐으면 스킵
  const { data: player } = await supabase
    .from('players').select('status, name').eq('id', playerId).single()
  if (!player || player.status !== 'IN_AUCTION') return {}

  const { data: topBid } = await supabase
    .from('bids')
    .select('*')
    .eq('player_id', playerId)
    .eq('room_id', roomId)
    .order('amount', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!topBid) {
    // 입찰 없음 → UNSOLD 변경
    await supabase.from('players').update({ status: 'UNSOLD' }).eq('id', playerId)
    await clearRoomAuction(roomId)
    await sysMsg(roomId, `😔 입찰자 없음 — 최저가 입찰이 진행되지 않아 유찰되었습니다.`)
    return {}
  }

  // 낙찰 처리
  await supabase.from('players').update({
    status: 'SOLD',
    team_id: topBid.team_id,
    sold_price: topBid.amount,
  }).eq('id', playerId)

  // 팀 포인트 차감
  const { data: team } = await supabase
    .from('teams').select('point_balance, name').eq('id', topBid.team_id).single()
  if (team) {
    await supabase.from('teams')
      .update({ point_balance: team.point_balance - topBid.amount })
      .eq('id', topBid.team_id)
    await sysMsg(roomId, `🏆 ${player.name} → ${team.name} (${topBid.amount.toLocaleString()}P 낙찰!)`)
  }

  await clearRoomAuction(roomId)
  return {}
}

// skipPlayer 함수 삭제 (수동 유찰 기능 제거)

/** 유찰된 선수 영입 (드래프트 자유계약, 0P) */
export async function draftPlayer(
  roomId: string,
  playerId: string,
  teamId: string,
): Promise<{ error?: string }> {
  // 팀 및 선수 정보 조회
  const { data: player } = await supabase
    .from('players').select('name, status').eq('id', playerId).single()
  const { data: team } = await supabase
    .from('teams').select('name').eq('id', teamId).single()

  if (!player || player.status !== 'UNSOLD' || !team) {
    return { error: '유효하지 않은 영입 요청입니다.' }
  }

  // 선수 상태 업데이트 (SOLD, 0P 처리는 sold_price: 0 추가)
  const { error } = await supabase.from('players').update({
    status: 'SOLD',
    team_id: teamId,
    sold_price: 0,
  }).eq('id', playerId)

  if (error) {
    console.error('draftPlayer error:', error)
    return { error: '영입 처리 중 오류가 발생했습니다.' }
  }

  await sysMsg(roomId, `🤝 ${team.name}에서 ${player.name} 선수를 추가 영입(자유계약) 했습니다. (0P)`)
  return {}
}

async function clearRoomAuction(roomId: string) {
  await supabase.from('rooms')
    .update({ timer_ends_at: null, current_player_id: null })
    .eq('id', roomId)
}

/** (방장 전용) 유찰된 잉여 선수 전원을 다시 대기 상태로 되돌리고 재경매 준비 */
export async function restartAuctionWithUnsold(roomId: string): Promise<{ error?: string }> {
  // 현재 방의 상태 UNSOLD 인 모든 선수
  const { data: unsold } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', roomId)
    .eq('status', 'UNSOLD')

  if (!unsold || unsold.length === 0) {
    return { error: '유찰된 선수가 없습니다.' }
  }

  // 일괄 업데이트
  const { error: pErr } = await supabase
    .from('players')
    .update({ status: 'WAITING' })
    .eq('room_id', roomId)
    .eq('status', 'UNSOLD')

  if (pErr) return { error: pErr.message }

  await sysMsg(roomId, `🔄 주최자가 모든 유찰 선수를 다시 대기 명단으로 되돌리고 추첨(재경매)을 재개합니다! (${unsold.length}명)`)
  return {}
}
