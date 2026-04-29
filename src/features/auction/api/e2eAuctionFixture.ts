import type {
  Bid,
  LiveBidState,
  Message,
  Player,
  PresenceUser,
  Team,
} from '@/features/auction/store/useAuctionStore'
import type { CaptainMode } from '@/features/auction/utils/roster'
import { getAuctionDerivedState } from '@/features/auction/utils/auctionRealtime'

type FixtureRoom = {
  id: string
  name: string
  basePoint: number
  totalTeams: number
  membersPerTeam: number
  captainMode: CaptainMode
  currentPlayerId: string | null
  timerEndsAt: string | null
  createdAt: string
  roomDeleted: boolean
  organizerToken: string
  viewerToken: string
  leaderTokens: Record<string, string>
  teams: Team[]
  players: Player[]
  bids: Bid[]
  messages: Message[]
  presences: PresenceUser[]
  lotteryPlayer: Player | null
  liveBid: LiveBidState | null
  revision: number
}

type FixtureState = {
  rooms: Map<string, FixtureRoom>
}

export type FixtureRoomSnapshot = {
  roomId: string
  roomName: string
  basePoint: number
  totalTeams: number
  membersPerTeam: number
  captainMode: CaptainMode
  timerEndsAt: string | null
  createdAt: string
  roomDeleted: boolean
  currentPlayerId: string | null
  teams: Team[]
  players: Player[]
  bids: Bid[]
  messages: Message[]
  presences: PresenceUser[]
  lotteryPlayer: Player | null
  liveBid: LiveBidState | null
  revision: number
}

type ResetResult = {
  roomId: string
  organizerPath: string
  organizerLink: string
  viewerLink: string
  captainLinks: Array<{ teamId: string; teamName: string; link: string }>
}

type ResetOptions = {
  stage?:
    | 'waiting'
    | 'active-auction'
    | 'active-auction-expiring'
    | 'active-auction-final-second'
    | 'draft-last-slot'
    | 'unsold-reauction'
}

const FIXTURE_KEY = '__auctionE2EFixture__'
const AUCTION_DURATION_MS = 10_000
const EXTEND_THRESHOLD_MS = 5_000
const EXTEND_DURATION_MS = 5_000

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getGlobalStore() {
  return globalThis as typeof globalThis & {
    [FIXTURE_KEY]?: FixtureState
  }
}

function getFixtureState(): FixtureState {
  const globalStore = getGlobalStore()
  if (!globalStore[FIXTURE_KEY]) {
    globalStore[FIXTURE_KEY] = { rooms: new Map() }
  }
  return globalStore[FIXTURE_KEY] as FixtureState
}

function nowIso() {
  return new Date().toISOString()
}

function createFixtureRoom(options: ResetOptions = {}): FixtureRoom {
  const roomId = 'fixture-room'
  const createdAt = nowIso()
  const teams: Team[] = [
    {
      id: 'team-blue',
      room_id: roomId,
      name: 'Blue',
      point_balance: 1000,
      leader_name: 'Blue Leader',
      leader_position: 'TOP',
      leader_description: '',
      captain_points: 0,
    },
    {
      id: 'team-red',
      room_id: roomId,
      name: 'Red',
      point_balance: 1000,
      leader_name: 'Red Leader',
      leader_position: 'JGL',
      leader_description: '',
      captain_points: 0,
    },
  ]

  const players: Player[] = [
    {
      id: 'player-1',
      room_id: roomId,
      name: 'Alpha',
      tier: '챌린저',
      main_position: 'TOP',
      sub_position: 'MID',
      status: 'WAITING',
      team_id: null,
      sold_price: null,
      description: 'Fixture Alpha',
    },
    {
      id: 'player-2',
      room_id: roomId,
      name: 'Beta',
      tier: '다이아',
      main_position: 'JGL',
      sub_position: 'TOP',
      status: 'WAITING',
      team_id: null,
      sold_price: null,
      description: 'Fixture Beta',
    },
    {
      id: 'player-3',
      room_id: roomId,
      name: 'Gamma',
      tier: '골드',
      main_position: 'MID',
      sub_position: 'ADC',
      status: 'WAITING',
      team_id: null,
      sold_price: null,
      description: 'Fixture Gamma',
    },
    {
      id: 'player-4',
      room_id: roomId,
      name: 'Delta',
      tier: '실버',
      main_position: 'SUP',
      sub_position: 'ADC',
      status: 'WAITING',
      team_id: null,
      sold_price: null,
      description: 'Fixture Delta',
    },
  ]

  const room: FixtureRoom = {
    id: roomId,
    name: 'Fixture Auction',
    basePoint: 1000,
    totalTeams: 2,
    membersPerTeam: 3,
    captainMode: 'COACH_ONLY',
    currentPlayerId: null,
    timerEndsAt: null,
    createdAt,
    roomDeleted: false,
    organizerToken: 'fixture-organizer-token',
    viewerToken: 'fixture-viewer-token',
    leaderTokens: {
      'team-blue': 'fixture-blue-token',
      'team-red': 'fixture-red-token',
    },
    teams,
    players,
    bids: [],
    messages: [],
    presences: [
      { role: 'ORGANIZER', teamId: null },
      { role: 'LEADER', teamId: 'team-blue' },
      { role: 'LEADER', teamId: 'team-red' },
    ],
    lotteryPlayer: null,
    liveBid: null,
    revision: 1,
  }

  if (options.stage === 'active-auction') {
    room.players[0].status = 'IN_AUCTION'
    room.currentPlayerId = room.players[0].id
    room.timerEndsAt = new Date(Date.now() + 15_000).toISOString()
    room.lotteryPlayer = null
  } else if (options.stage === 'active-auction-expiring') {
    room.players[0].status = 'IN_AUCTION'
    room.currentPlayerId = room.players[0].id
    room.timerEndsAt = new Date(Date.now() + 4_000).toISOString()
    room.lotteryPlayer = null
  } else if (options.stage === 'active-auction-final-second') {
    room.players[0].status = 'IN_AUCTION'
    room.currentPlayerId = room.players[0].id
    room.timerEndsAt = new Date(Date.now() + 8_000).toISOString()
    room.lotteryPlayer = null
  } else if (options.stage === 'draft-last-slot') {
    room.membersPerTeam = 2
    room.teams[0].point_balance = 100
    room.teams[1].point_balance = 240

    room.players[0].status = 'SOLD'
    room.players[0].team_id = 'team-blue'
    room.players[0].sold_price = 300

    room.players[1].status = 'SOLD'
    room.players[1].team_id = 'team-red'
    room.players[1].sold_price = 600

    room.players[2].status = 'SOLD'
    room.players[2].team_id = 'team-red'
    room.players[2].sold_price = 760

    room.players[3].status = 'UNSOLD'
    room.players[3].team_id = null
    room.players[3].sold_price = null
  } else if (options.stage === 'unsold-reauction') {
    room.membersPerTeam = 2

    room.players[0].status = 'UNSOLD'
    room.players[0].team_id = null
    room.players[0].sold_price = null

    room.players[1].status = 'UNSOLD'
    room.players[1].team_id = null
    room.players[1].sold_price = null

    room.players[2].status = 'UNSOLD'
    room.players[2].team_id = null
    room.players[2].sold_price = null

    room.players[3].status = 'UNSOLD'
    room.players[3].team_id = null
    room.players[3].sold_price = null
  }

  return room
}

function nextRevision(room: FixtureRoom) {
  room.revision += 1
}

function getRoomOrThrow(roomId: string): FixtureRoom {
  const room = getFixtureState().rooms.get(roomId)
  if (!room || room.roomDeleted) {
    throw new Error('방을 찾을 수 없습니다.')
  }
  return room
}

function appendMessage(room: FixtureRoom, senderName: string, senderRole: Message['sender_role'], content: string) {
  room.messages.push({
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event_id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    room_id: room.id,
    sender_name: senderName,
    sender_role: senderRole,
    content,
    created_at: nowIso(),
  })
}

function toSnapshot(room: FixtureRoom): FixtureRoomSnapshot {
  return {
    roomId: room.id,
    roomName: room.name,
    basePoint: room.basePoint,
    totalTeams: room.totalTeams,
    membersPerTeam: room.membersPerTeam,
    captainMode: room.captainMode,
    timerEndsAt: room.timerEndsAt,
    createdAt: room.createdAt,
    roomDeleted: room.roomDeleted,
    currentPlayerId: room.currentPlayerId,
    teams: clone(room.teams),
    players: clone(room.players),
    bids: clone(room.bids),
    messages: clone(room.messages),
    presences: clone(room.presences),
    lotteryPlayer: clone(room.lotteryPlayer),
    liveBid: clone(room.liveBid),
    revision: room.revision,
  }
}

export function isE2EAuctionFixtureEnabled() {
  return process.env.E2E_AUCTION_FIXTURE === '1'
}

export function resetE2EAuctionFixture(baseUrl: string, options: ResetOptions = {}): ResetResult {
  const state = getFixtureState()
  const room = createFixtureRoom(options)
  state.rooms = new Map([[room.id, room]])

  return {
    roomId: room.id,
    organizerPath: `/api/room-auth?roomId=${room.id}&role=ORGANIZER&token=${room.organizerToken}`,
    organizerLink: `${baseUrl}/api/room-auth?roomId=${room.id}&role=ORGANIZER&token=${room.organizerToken}`,
    viewerLink: `${baseUrl}/api/room-auth?roomId=${room.id}&role=VIEWER&token=${room.viewerToken}`,
    captainLinks: room.teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      link: `${baseUrl}/api/room-auth?roomId=${room.id}&role=LEADER&teamId=${team.id}&token=${room.leaderTokens[team.id]}`,
    })),
  }
}

export function getE2EAuctionFixtureRoomState(roomId: string): FixtureRoomSnapshot | null {
  const room = getFixtureState().rooms.get(roomId)
  if (!room || room.roomDeleted) return null
  return toSnapshot(room)
}

export function getE2EAuctionFixtureRoomLinks(roomId: string) {
  const room = getRoomOrThrow(roomId)
  return {
    organizerToken: room.organizerToken,
    viewerToken: room.viewerToken,
    captainLinks: room.teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      leaderName: team.leader_name,
      token: room.leaderTokens[team.id],
    })),
  }
}

export function verifyE2EAuctionFixtureAccess(args: {
  roomId: string
  role: 'ORGANIZER' | 'LEADER' | 'VIEWER'
  token: string
  teamId?: string | null
}) {
  const room = getRoomOrThrow(args.roomId)
  if (args.role === 'ORGANIZER') return room.organizerToken === args.token
  if (args.role === 'VIEWER') return room.viewerToken === args.token
  if (!args.teamId) return false
  return room.leaderTokens[args.teamId] === args.token
}

export async function drawFixtureNextPlayer(roomId: string): Promise<{ error?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    if (room.currentPlayerId) return { error: '이미 경매 중인 선수가 있습니다.' }
    const candidate = room.players.find((player) => player.status === 'WAITING')
    if (!candidate) return { error: '대기 중인 선수가 없습니다.' }
    candidate.status = 'IN_AUCTION'
    room.currentPlayerId = candidate.id
    room.lotteryPlayer = clone(candidate)
    room.liveBid = null
    nextRevision(room)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function closeFixtureLottery(roomId: string, playerName: string): Promise<{ error?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    room.lotteryPlayer = null
    appendMessage(room, '시스템', 'SYSTEM', `🎲 ${playerName} 선수 추첨!`)
    nextRevision(room)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function startFixtureAuction(roomId: string, durationMs: number): Promise<{ error?: string; timerEndsAt?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    room.timerEndsAt = new Date(Date.now() + durationMs).toISOString()
    appendMessage(room, '시스템', 'SYSTEM', '⏱️ 경매가 시작되었습니다!')
    nextRevision(room)
    return { timerEndsAt: room.timerEndsAt }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function placeFixtureBid(
  roomId: string,
  playerId: string,
  teamId: string,
  amount: number,
): Promise<{ error?: string; timerEndsAt?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    if (room.currentPlayerId !== playerId) return { error: '현재 경매 중인 선수가 아닙니다.' }
    if (!room.timerEndsAt) return { error: '경매가 진행 중이지 않습니다.' }
    if (new Date(room.timerEndsAt).getTime() < Date.now() - 500) {
      return { error: '경매 시간이 종료되었습니다.' }
    }

    const team = room.teams.find((entry) => entry.id === teamId)
    if (!team) return { error: '팀을 찾을 수 없습니다.' }

    const { topBid, minBid } = getAuctionDerivedState({
      bids: room.bids,
      currentPlayerId: playerId,
      liveBid: room.liveBid,
      teams: room.teams,
    })

    if (topBid?.team_id === teamId) return { error: '현재 최고 입찰자입니다. 추가 입찰이 불가합니다.' }
    if (amount < minBid) return { error: `최소 입찰액은 ${minBid}P입니다.` }
    if (team.point_balance < amount) return { error: `포인트 부족 (보유: ${team.point_balance}P)` }

    const bid: Bid = {
      id: `bid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      room_id: roomId,
      player_id: playerId,
      team_id: teamId,
      amount,
      created_at: nowIso(),
    }
    room.bids.push(bid)
    room.liveBid = {
      player_id: playerId,
      team_id: teamId,
      amount,
      created_at: bid.created_at,
    }

    const remainingMs = new Date(room.timerEndsAt).getTime() - Date.now()
    if (remainingMs < EXTEND_THRESHOLD_MS) {
      room.timerEndsAt = new Date(Date.now() + EXTEND_DURATION_MS).toISOString()
    }

    appendMessage(room, '시스템', 'SYSTEM', `💰 ${team.name}이 ${amount}P에 입찰했습니다!`)
    nextRevision(room)

    return { timerEndsAt: room.timerEndsAt }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function awardFixturePlayer(roomId: string, playerId: string): Promise<{ error?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    const player = room.players.find((entry) => entry.id === playerId)
    if (!player) return { error: '선수를 찾을 수 없습니다.' }
    if (player.status === 'SOLD' || player.status === 'UNSOLD') return {}
    if (room.timerEndsAt && new Date(room.timerEndsAt).getTime() > Date.now()) return {}

    const playerBids = room.bids.filter((bid) => bid.player_id === playerId)
    const topBid = playerBids.sort((a, b) => b.amount - a.amount)[0] ?? null

    room.currentPlayerId = null
    room.timerEndsAt = null
    room.lotteryPlayer = null
    room.liveBid = null

    if (topBid) {
      const team = room.teams.find((entry) => entry.id === topBid.team_id)
      if (!team) return { error: '팀을 찾을 수 없습니다.' }
      player.status = 'SOLD'
      player.team_id = team.id
      player.sold_price = topBid.amount
      team.point_balance -= topBid.amount
      appendMessage(room, '시스템', 'SYSTEM', `🏆 ${team.name}이 ${player.name} 선수를 ${topBid.amount}P에 낙찰!`)
    } else {
      player.status = 'UNSOLD'
      player.team_id = null
      player.sold_price = null
      appendMessage(room, '시스템', 'SYSTEM', `❌ ${player.name} 선수 유찰`)
    }

    nextRevision(room)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function recoverFixtureExpiredAuction(roomId: string): Promise<{ error?: string; recovered?: boolean }> {
  try {
    const room = getRoomOrThrow(roomId)
    if (!room.currentPlayerId || !room.timerEndsAt) return { recovered: false }
    if (new Date(room.timerEndsAt).getTime() > Date.now()) return { recovered: false }
    const result = await awardFixturePlayer(roomId, room.currentPlayerId)
    if (result.error) return result
    return { recovered: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function draftFixturePlayer(
  roomId: string,
  playerId: string,
  teamId: string,
): Promise<{ error?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    const player = room.players.find((entry) => entry.id === playerId)
    const team = room.teams.find((entry) => entry.id === teamId)
    if (!player) return { error: '선수를 찾을 수 없습니다.' }
    if (!team) return { error: '팀을 찾을 수 없습니다.' }
    if (player.status !== 'UNSOLD' && player.status !== 'WAITING') {
      return { error: '영입 요청할 수 없는 상태의 선수입니다.' }
    }

    const soldCount = room.players.filter(
      (entry) => entry.team_id === teamId && entry.status === 'SOLD',
    ).length
    const auctionSlotsPerTeam = room.membersPerTeam
    if (soldCount >= auctionSlotsPerTeam) {
      return { error: '팀 인원이 가득 찼습니다.' }
    }

    const isLastSlot = soldCount === auctionSlotsPerTeam - 1
    const draftPrice = isLastSlot ? team.point_balance : 0

    player.status = 'SOLD'
    player.team_id = teamId
    player.sold_price = draftPrice
    if (draftPrice > 0) {
      team.point_balance = 0
    }

    appendMessage(
      room,
      '시스템',
      'SYSTEM',
      isLastSlot
        ? `🤝 ${team.name}이(가) ${player.name} 선수를 ${draftPrice}P에 드래프트 영입!`
        : `🤝 ${team.name}이(가) ${player.name} 선수를 자유계약으로 영입!`,
    )
    nextRevision(room)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function restartFixtureAuctionWithUnsold(
  roomId: string,
): Promise<{ error?: string; reAuctionStarted?: boolean }> {
  try {
    const room = getRoomOrThrow(roomId)
    const unsoldPlayers = room.players.filter((entry) => entry.status === 'UNSOLD')
    if (unsoldPlayers.length === 0) {
      return { error: '유찰된 선수가 없습니다.' }
    }

    for (const player of unsoldPlayers) {
      player.status = 'WAITING'
      player.team_id = null
      player.sold_price = null
    }

    appendMessage(
      room,
      '시스템',
      'SYSTEM',
      `🔄 유찰 선수 재경매를 시작합니다! (${unsoldPlayers.length}명)`,
    )
    nextRevision(room)
    return { reAuctionStarted: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function sendFixtureChatMessage(
  roomId: string,
  senderName: string,
  senderRole: Message['sender_role'],
  content: string,
  clientEventId?: string,
) {
  try {
    const room = getRoomOrThrow(roomId)
    room.messages.push({
      id: clientEventId ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      event_id: clientEventId,
      room_id: roomId,
      sender_name: senderName,
      sender_role: senderRole,
      content: content.trim(),
      created_at: nowIso(),
    })
    nextRevision(room)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function sendFixtureNotice(roomId: string, content: string) {
  return sendFixtureChatMessage(roomId, '주최자', 'NOTICE', content)
}

export async function deleteFixtureRoom(roomId: string) {
  try {
    const room = getRoomOrThrow(roomId)
    room.roomDeleted = true
    nextRevision(room)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}
