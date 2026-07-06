import type {
  Bid,
  LiveBidState,
  Message,
  Player,
  PresenceUser,
  SealedBidState,
  Team,
  TeamAssignmentState,
} from '@/features/auction/store/useAuctionStore'
import { getAuctionSlotsPerTeam, type CaptainMode } from '@/features/auction/utils/roster'
import type { AuctionMode } from '@/features/auction/utils/auctionMode'
import {
  getAuctionBidState,
  type AuctionEventEnvelope,
  type AuctionEventType,
} from '@/features/auction/utils/auctionRealtime'

type FixtureRoom = {
  id: string
  name: string
  basePoint: number
  totalTeams: number
  membersPerTeam: number
  captainMode: CaptainMode
  auctionMode: AuctionMode
  currentPlayerId: string | null
  timerEndsAt: string | null
  nextAuctionDurationMs: number | null
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
  sealedBid: SealedBidState
  teamAssignment: TeamAssignmentState | null
  lastAuctionEvent: AuctionEventEnvelope | null
  revision: number
}

type FixtureState = {
  rooms: Map<string, FixtureRoom>
  mutationQueue: Promise<void>
}

export type FixtureRoomSnapshot = {
  roomId: string
  roomName: string
  basePoint: number
  totalTeams: number
  membersPerTeam: number
  captainMode: CaptainMode
  auctionMode: AuctionMode
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
  sealedBid: SealedBidState
  teamAssignment: TeamAssignmentState | null
  lastAuctionEvent: AuctionEventEnvelope | null
  revision: number
}

type FixtureAssignmentSelection = {
  auctionTeamId: string
  assignedTeamId: number | null
  status: string
  exceptionReason?: string
  originalCandidateTeamIds: number[]
  message?: string
}

type ResetResult = {
  roomId: string
  organizerPath: string
  organizerLink: string
  viewerLink: string
  captainLinks: Array<{ teamId: string; teamName: string; link: string }>
}

export type FixtureCreateRoomPayload = {
  name: string
  totalTeams: number
  basePoint: number
  membersPerTeam: number
  captainMode?: CaptainMode
  auctionMode?: AuctionMode
  captains: Array<{
    teamName: string
    name: string
    tier?: string
    position: string
    description: string
    captainPoints: number
  }>
  players: Array<{
    name: string
    tier: string
    mainPosition: string
    subPosition: string
    description: string
    aramTier?: string
    tftTier?: string
    desiredTeam?: string
  }>
}

type FixtureCreateRoomResult = {
  roomId: string
  organizerToken: string
  viewerToken: string
  teams: Array<{ id: string; name: string; leader_token: string }>
}

type ResetOptions = {
  stage?:
    | 'waiting'
    | 'active-auction'
    | 'active-auction-expiring'
    | 'active-auction-final-second'
    | 'desired-team-conflict'
    | 'team-assignment-finished'
    | 'desired-team-random-finished'
    | 'draft-last-slot'
    | 'unsold-reauction'
}

const FIXTURE_KEY = '__auctionE2EFixture__'
import {
  AUCTION_DURATION_MS,
  EXTEND_DURATION_MS,
  EXTEND_THRESHOLD_MS,
  SEALED_BID_DURATION_MS,
} from '../constants/auctionTimings'

function clone<T>(value: T): T {
  if (value === undefined || value === null) {
    return value
  }
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
    globalStore[FIXTURE_KEY] = { rooms: new Map(), mutationQueue: Promise.resolve() }
  }
  return globalStore[FIXTURE_KEY] as FixtureState
}

function enqueueFixtureMutation<T>(mutation: () => T | Promise<T>): Promise<T> {
  const state = getFixtureState()
  const next = state.mutationQueue.then(mutation, mutation)
  state.mutationQueue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

function nowIso() {
  return new Date().toISOString()
}

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
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
      roster_slots_used: 0,
      roster_slots_total: 4,
      leader_name: 'Blue Leader',
      leader_tier: '팀장',
      leader_position: 'TOP',
      leader_description: '',
      captain_points: 0,
    },
    {
      id: 'team-red',
      room_id: roomId,
      name: 'Red',
      point_balance: 1000,
      roster_slots_used: 0,
      roster_slots_total: 4,
      leader_name: 'Red Leader',
      leader_tier: '팀장',
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
      order: 1,
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
      order: 2,
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
      order: 3,
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
      order: 4,
    },
  ]

  const room: FixtureRoom = {
    id: roomId,
    name: 'Fixture Auction',
    basePoint: 1000,
    totalTeams: 2,
    membersPerTeam: 3,
    captainMode: 'COACH_ONLY',
    auctionMode: 'OPEN_ASCENDING',
    currentPlayerId: null,
    timerEndsAt: null,
    nextAuctionDurationMs: null,
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
    sealedBid: {
      phase: null,
      roundId: null,
      roundNumber: 0,
      minAmount: 0,
      eligibleTeamIds: null,
      revealOrder: [],
      revealResult: [],
      highestAmount: 0,
      tiedTeamIds: [],
    },
    teamAssignment: null,
    lastAuctionEvent: null,
    revision: 1,
  }

  if (options.stage === 'active-auction') {
    room.players[0].status = 'IN_AUCTION'
    room.currentPlayerId = room.players[0].id
    room.timerEndsAt = new Date(Date.now() + EXTEND_THRESHOLD_MS).toISOString()
    room.lotteryPlayer = null
  } else if (options.stage === 'desired-team-conflict') {
    room.players[0].status = 'IN_AUCTION'
    room.players[0].desired_team = '3팀'
    room.players[1].status = 'SOLD'
    room.players[1].team_id = 'team-blue'
    room.players[1].sold_price = 100
    room.players[1].desired_team = '1팀'
    room.teams[0].roster_slots_used = 1
    room.currentPlayerId = room.players[0].id
    room.timerEndsAt = new Date(Date.now() + EXTEND_THRESHOLD_MS).toISOString()
    room.lotteryPlayer = null
  } else if (options.stage === 'team-assignment-finished') {
    room.players[0].status = 'SOLD'
    room.players[0].team_id = 'team-blue'
    room.players[0].sold_price = 100
    room.players[0].desired_team = '1팀'
    room.players[1].status = 'SOLD'
    room.players[1].team_id = 'team-red'
    room.players[1].sold_price = 100
    room.players[1].desired_team = '상관없음'
    room.players[2].status = 'SOLD'
    room.players[2].team_id = 'team-blue'
    room.players[2].sold_price = 100
    room.players[2].desired_team = '1팀'
    room.players[3].status = 'SOLD'
    room.players[3].team_id = 'team-red'
    room.players[3].sold_price = 100
    room.players[3].desired_team = '상관없음'
    room.teams[0].roster_slots_used = 2
    room.teams[1].roster_slots_used = 2
    room.currentPlayerId = null
    room.timerEndsAt = null
    room.lotteryPlayer = null
  } else if (options.stage === 'desired-team-random-finished') {
    room.name = '희망 팀 배정 QA 방'
    room.totalTeams = 4
    room.membersPerTeam = 4
    room.basePoint = 1000
    room.leaderTokens = {
      'team-blue': 'fixture-blue-token',
      'team-red': 'fixture-red-token',
      'team-green': 'fixture-green-token',
      'team-yellow': 'fixture-yellow-token',
    }
    room.teams = [
      {
        id: 'team-blue',
        room_id: roomId,
        name: 'Blue',
        point_balance: 730,
        roster_slots_used: 3,
        roster_slots_total: 3,
        leader_name: 'Blue Leader',
        leader_tier: '팀장',
        leader_position: 'TOP',
        leader_description: '',
        captain_points: 0,
      },
      {
        id: 'team-red',
        room_id: roomId,
        name: 'Red',
        point_balance: 650,
        roster_slots_used: 3,
        roster_slots_total: 3,
        leader_name: 'Red Leader',
        leader_tier: '팀장',
        leader_position: 'JGL',
        leader_description: '',
        captain_points: 0,
      },
      {
        id: 'team-green',
        room_id: roomId,
        name: 'Green',
        point_balance: 710,
        roster_slots_used: 3,
        roster_slots_total: 3,
        leader_name: 'Green Leader',
        leader_tier: '팀장',
        leader_position: 'MID',
        leader_description: '',
        captain_points: 0,
      },
      {
        id: 'team-yellow',
        room_id: roomId,
        name: 'Yellow',
        point_balance: 690,
        roster_slots_used: 3,
        roster_slots_total: 3,
        leader_name: 'Yellow Leader',
        leader_tier: '팀장',
        leader_position: 'SUP',
        leader_description: '',
        captain_points: 0,
      },
    ]
    room.players = [
      {
        id: 'player-qa-1',
        room_id: roomId,
        name: 'Alpha',
        tier: '챌린저',
        main_position: 'TOP',
        sub_position: 'MID',
        status: 'SOLD',
        team_id: 'team-blue',
        sold_price: 120,
        description: '희망 팀 1',
        desired_team: '1팀',
        order: 1,
      },
      {
        id: 'player-qa-2',
        room_id: roomId,
        name: 'Bravo',
        tier: '다이아',
        main_position: 'JGL',
        sub_position: 'TOP',
        status: 'SOLD',
        team_id: 'team-blue',
        sold_price: 80,
        description: '희망 팀 1 또는 2',
        desired_team: '1팀, 2팀',
        order: 2,
      },
      {
        id: 'player-qa-3',
        room_id: roomId,
        name: 'Charlie',
        tier: '에메랄드',
        main_position: 'ADC',
        sub_position: 'SUP',
        status: 'SOLD',
        team_id: 'team-blue',
        sold_price: 70,
        description: '상관없음',
        desired_team: '상관없음',
        order: 3,
      },
      {
        id: 'player-qa-4',
        room_id: roomId,
        name: 'Delta',
        tier: '마스터',
        main_position: 'MID',
        sub_position: 'ADC',
        status: 'SOLD',
        team_id: 'team-red',
        sold_price: 140,
        description: '상관없음',
        desired_team: '상관없음',
        order: 4,
      },
      {
        id: 'player-qa-5',
        room_id: roomId,
        name: 'Echo',
        tier: '플래티넘',
        main_position: 'SUP',
        sub_position: 'JGL',
        status: 'SOLD',
        team_id: 'team-red',
        sold_price: 110,
        description: '희망 팀 없음',
        desired_team: '',
        order: 5,
      },
      {
        id: 'player-qa-6',
        room_id: roomId,
        name: 'Foxtrot',
        tier: '골드',
        main_position: 'TOP',
        sub_position: 'SUP',
        status: 'SOLD',
        team_id: 'team-red',
        sold_price: 100,
        description: '상관없음',
        desired_team: '무관',
        order: 6,
      },
      {
        id: 'player-qa-7',
        room_id: roomId,
        name: 'Gamma',
        tier: '다이아',
        main_position: 'ADC',
        sub_position: 'MID',
        status: 'SOLD',
        team_id: 'team-green',
        sold_price: 130,
        description: '희망 팀 3 또는 4',
        desired_team: '3팀/4팀',
        order: 7,
      },
      {
        id: 'player-qa-8',
        room_id: roomId,
        name: 'Hotel',
        tier: '실버',
        main_position: 'JGL',
        sub_position: 'TOP',
        status: 'SOLD',
        team_id: 'team-green',
        sold_price: 60,
        description: '희망 팀 4',
        desired_team: '4팀',
        order: 8,
      },
      {
        id: 'player-qa-9',
        room_id: roomId,
        name: 'Iris',
        tier: '브론즈',
        main_position: 'SUP',
        sub_position: 'ADC',
        status: 'SOLD',
        team_id: 'team-green',
        sold_price: 100,
        description: '희망 팀 3',
        desired_team: '3팀',
        order: 9,
      },
      {
        id: 'player-qa-10',
        room_id: roomId,
        name: 'Juliet',
        tier: '에메랄드',
        main_position: 'MID',
        sub_position: 'TOP',
        status: 'SOLD',
        team_id: 'team-yellow',
        sold_price: 90,
        description: '상관없음',
        desired_team: '상관없음',
        order: 10,
      },
      {
        id: 'player-qa-11',
        room_id: roomId,
        name: 'Kilo',
        tier: '플래티넘',
        main_position: 'ADC',
        sub_position: 'JGL',
        status: 'SOLD',
        team_id: 'team-yellow',
        sold_price: 120,
        description: '희망 팀 1 또는 4',
        desired_team: '1팀, 4팀',
        order: 11,
      },
      {
        id: 'player-qa-12',
        room_id: roomId,
        name: 'Lima',
        tier: '골드',
        main_position: 'TOP',
        sub_position: 'SUP',
        status: 'SOLD',
        team_id: 'team-yellow',
        sold_price: 100,
        description: '희망 팀 없음',
        desired_team: '',
        order: 12,
      },
    ]
    room.presences = [
      { role: 'ORGANIZER', teamId: null },
      { role: 'LEADER', teamId: 'team-blue' },
      { role: 'LEADER', teamId: 'team-red' },
      { role: 'LEADER', teamId: 'team-green' },
      { role: 'LEADER', teamId: 'team-yellow' },
    ]
    room.currentPlayerId = null
    room.timerEndsAt = null
    room.lotteryPlayer = null
  } else if (options.stage === 'active-auction-expiring') {
    room.players[0].status = 'IN_AUCTION'
    room.currentPlayerId = room.players[0].id
    room.timerEndsAt = new Date(Date.now() + 1_500).toISOString()
    room.lotteryPlayer = null
  } else if (options.stage === 'active-auction-final-second') {
    room.players[0].status = 'IN_AUCTION'
    room.currentPlayerId = room.players[0].id
    // 페이지 로드가 타이머 만료와 경쟁하지 않도록 길게 잡는다.
    // 테스트는 클라이언트 준비 후 startAuction command(durationMs)로 타이머를 재무장해 final-second 상황을 만든다.
    room.timerEndsAt = new Date(Date.now() + 60_000).toISOString()
    room.lotteryPlayer = null
  } else if (options.stage === 'draft-last-slot') {
    room.membersPerTeam = 2
    room.teams[0].point_balance = 100
    room.teams[1].point_balance = 240
    room.teams[0].roster_slots_total = 1
    room.teams[1].roster_slots_total = 1

    room.players[0].status = 'SOLD'
    room.players[0].team_id = 'team-blue'
    room.players[0].sold_price = 300
    room.teams[0].roster_slots_used = 1

    room.players[1].status = 'SOLD'
    room.players[1].team_id = 'team-red'
    room.players[1].sold_price = 600

    room.players[2].status = 'SOLD'
    room.players[2].team_id = 'team-red'
    room.players[2].sold_price = 760
    room.teams[1].roster_slots_used = 2

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

function recordFixtureAuctionEvent(
  room: FixtureRoom,
  type: AuctionEventType,
  overrides: Partial<AuctionEventEnvelope> = {},
) {
  nextRevision(room)
  room.lastAuctionEvent = {
    eventId: `${type.toLowerCase()}-${room.id}-${room.revision}`,
    revision: room.revision,
    roomId: room.id,
    type,
    serverCreatedAt: nowIso(),
    currentPlayerId: room.currentPlayerId,
    timerEndsAt: room.timerEndsAt,
    liveBid: room.liveBid,
    ...overrides,
  }
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
    auctionMode: room.auctionMode,
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
    sealedBid: clone(room.sealedBid),
    teamAssignment: clone(room.teamAssignment),
    lastAuctionEvent: clone(room.lastAuctionEvent),
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
    organizerPath: `/room/${room.id}?role=ORGANIZER&authToken=${room.organizerToken}`,
    organizerLink: `${baseUrl}/room/${room.id}?role=ORGANIZER&authToken=${room.organizerToken}`,
    viewerLink: `${baseUrl}/room/${room.id}?role=VIEWER&authToken=${room.viewerToken}`,
    captainLinks: room.teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      link: `${baseUrl}/room/${room.id}?role=LEADER&teamId=${team.id}&authToken=${room.leaderTokens[team.id]}`,
    })),
  }
}

export function getE2EAuctionFixtureRoomState(roomId: string): FixtureRoomSnapshot | null {
  const room = getFixtureState().rooms.get(roomId)
  if (!room || room.roomDeleted) return null
  return toSnapshot(room)
}

export function saveE2EAuctionFixtureTeamAssignment(
  roomId: string,
  organizerToken: string,
  assignments: FixtureAssignmentSelection[],
): { error?: string } {
  const room = getRoomOrThrow(roomId)
  if (organizerToken !== room.organizerToken) {
    return { error: '주최자 권한이 필요합니다.' }
  }
  room.teamAssignment = {
    status: 'CONFIRMED',
    confirmed_at: nowIso(),
    assignments: assignments.map((assignment) => ({
      auction_team_id: assignment.auctionTeamId,
      assigned_team_id: assignment.assignedTeamId,
      status: assignment.status,
      exception_reason: assignment.exceptionReason ?? null,
      original_candidate_team_ids: assignment.originalCandidateTeamIds,
      message: assignment.message ?? null,
    })),
  }
  nextRevision(room)
  return {}
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

export function createE2EAuctionFixtureRoom(
  payload: FixtureCreateRoomPayload,
): FixtureCreateRoomResult {
  const state = getFixtureState()
  const roomId = randomId('fixture-room')
  const createdAt = nowIso()
  const organizerToken = randomId('fixture-organizer-token')
  const viewerToken = randomId('fixture-viewer-token')

  const rosterSlotsTotal = getAuctionSlotsPerTeam(
    payload.membersPerTeam,
    payload.captainMode ?? 'IN_ROSTER',
  )
  const teams: Team[] = payload.captains.map((captain, index) => ({
    id: randomId(`team-${index + 1}`),
    room_id: roomId,
    name: captain.teamName,
    point_balance: payload.basePoint - captain.captainPoints,
    roster_slots_used: 0,
    roster_slots_total: rosterSlotsTotal,
    leader_name: captain.name,
    leader_tier: captain.tier || '',
    leader_position: captain.position,
    leader_description: captain.description || '',
    captain_points: captain.captainPoints || 0,
  }))

  const leaderTokens = Object.fromEntries(
    teams.map((team) => [team.id, randomId(`fixture-leader-token-${team.id}`)]),
  )

  const players: Player[] = payload.players.map((player, index) => ({
    id: randomId(`player-${index + 1}`),
    room_id: roomId,
    name: player.name,
    tier: player.tier,
    main_position: player.mainPosition,
    sub_position: player.subPosition || '',
    status: 'WAITING',
    team_id: null,
    sold_price: null,
    description: player.description || '',
    aram_tier: player.aramTier || '',
    tft_tier: player.tftTier || '',
    desired_team: player.desiredTeam || '',
    order: index + 1,
  }))

  const room: FixtureRoom = {
    id: roomId,
    name: payload.name,
    basePoint: payload.basePoint,
    totalTeams: payload.totalTeams,
    membersPerTeam: payload.membersPerTeam,
    captainMode: payload.captainMode ?? 'IN_ROSTER',
    auctionMode: payload.auctionMode ?? 'OPEN_ASCENDING',
    currentPlayerId: null,
    timerEndsAt: null,
    nextAuctionDurationMs: null,
    createdAt,
    roomDeleted: false,
    organizerToken,
    viewerToken,
    leaderTokens,
    teams,
    players,
    bids: [],
    messages: [],
    presences: [
      { role: 'ORGANIZER', teamId: null },
      ...teams.map((team) => ({ role: 'LEADER' as const, teamId: team.id })),
    ],
    lotteryPlayer: null,
    liveBid: null,
    sealedBid: {
      phase: null,
      roundId: null,
      roundNumber: 0,
      minAmount: 0,
      eligibleTeamIds: null,
      revealOrder: [],
      revealResult: [],
      highestAmount: 0,
      tiedTeamIds: [],
    },
    teamAssignment: null,
    lastAuctionEvent: null,
    revision: 1,
  }

  state.rooms.set(room.id, room)

  return {
    roomId,
    organizerToken,
    viewerToken,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      leader_token: leaderTokens[team.id],
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
    const waitingPlayers = room.players.filter((player) => player.status === 'WAITING')
    if (waitingPlayers.length === 0) return { error: '대기 중인 선수가 없습니다.' }
    const candidate = waitingPlayers[Math.floor(Math.random() * waitingPlayers.length)]
    room.currentPlayerId = candidate.id
    room.lotteryPlayer = clone(candidate)
    room.liveBid = null
    recordFixtureAuctionEvent(room, 'LOTTERY_DRAWN', {
      currentPlayerId: candidate.id,
      lotteryPlayer: clone(candidate),
      liveBid: null,
    })
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function closeFixtureLottery(roomId: string, playerName: string): Promise<{ error?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    const currentPlayer = room.players.find((p) => p.id === room.currentPlayerId)
    if (currentPlayer) currentPlayer.status = 'IN_AUCTION'
    room.lotteryPlayer = null
    appendMessage(room, '시스템', 'SYSTEM', `🎲 ${playerName} 선수 추첨!`)
    recordFixtureAuctionEvent(room, 'LOTTERY_CLOSED', {
      lotteryPlayer: null,
      player: room.currentPlayerId ? { id: room.currentPlayerId, status: 'IN_AUCTION' } : undefined,
    })
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function startFixtureAuction(roomId: string, durationMs?: number): Promise<{ error?: string; timerEndsAt?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    const defaultDurationMs =
      room.auctionMode === 'SEALED_BID'
        ? SEALED_BID_DURATION_MS
        : AUCTION_DURATION_MS
    const nextDurationMs = room.nextAuctionDurationMs ?? durationMs ?? defaultDurationMs
    room.timerEndsAt = new Date(Date.now() + nextDurationMs).toISOString()
    room.nextAuctionDurationMs = null
    appendMessage(room, '시스템', 'SYSTEM', '⏱️ 경매가 시작되었습니다!')
    recordFixtureAuctionEvent(room, 'AUCTION_STARTED')
    return { timerEndsAt: room.timerEndsAt }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function pauseFixtureAuction(roomId: string): Promise<{ error?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    if (!room.currentPlayerId || !room.timerEndsAt) return {}
    room.timerEndsAt = null
    appendMessage(room, '시스템', 'SYSTEM', '⚠️ 팀장 연결이 끊겼습니다. 경매가 일시 정지됩니다.')
    recordFixtureAuctionEvent(room, 'AUCTION_PAUSED', {
      timerEndsAt: null,
    })
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
  }
}

export async function resumeFixtureAuction(
  roomId: string,
): Promise<{ error?: string; timerEndsAt?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    if (!room.currentPlayerId) return { error: '현재 경매 중인 선수가 없습니다.' }
    room.timerEndsAt = new Date(Date.now() + EXTEND_DURATION_MS).toISOString()
    appendMessage(room, '시스템', 'SYSTEM', '✅ 팀장이 재연결되었습니다. 5초 후 경매가 재개됩니다.')
    recordFixtureAuctionEvent(room, 'AUCTION_RESUMED')
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
  resetTimer: boolean = false,
): Promise<{
  error?: string
  timerEndsAt?: string
  revision?: number
  debug?: {
    eventId?: string
    serverReceivedAt: number
    serverCompletedAt: number
  }
}> {
  return enqueueFixtureMutation(() => {
    try {
      const room = getRoomOrThrow(roomId)
      if (room.currentPlayerId !== playerId) return { error: '현재 경매 중인 선수가 아닙니다.' }
      if (!room.timerEndsAt) return { error: '경매가 진행 중이지 않습니다.' }
      if (new Date(room.timerEndsAt).getTime() < Date.now() - 500) {
        return { error: '경매 시간이 종료되었습니다.' }
      }

      const team = room.teams.find((entry) => entry.id === teamId)
      if (!team) return { error: '팀을 찾을 수 없습니다.' }

      const activeBid =
        room.liveBid?.player_id === playerId ? room.liveBid : null
      const bidState = getAuctionBidState({
        currentBidAmount: activeBid?.amount ?? null,
        currentBidTeamId: activeBid?.team_id ?? null,
        teamId,
      })

      if (bidState.topBidTeamId === teamId) {
        return { error: '현재 최고 입찰자입니다. 추가 입찰이 불가합니다.' }
      }
      if (amount < bidState.minBid) {
        return { error: `최소 입찰액은 ${bidState.minBid}P입니다.` }
      }
      if (team.point_balance < amount) {
        return { error: `포인트 부족 (보유: ${team.point_balance}P)` }
      }
      if ((team.roster_slots_used ?? 0) >= (team.roster_slots_total ?? room.membersPerTeam)) {
        return { error: '팀 인원이 가득 찼습니다.' }
      }

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
      if (resetTimer || remainingMs <= EXTEND_THRESHOLD_MS) {
        room.timerEndsAt = new Date(Date.now() + EXTEND_DURATION_MS).toISOString()
      }

      appendMessage(room, '시스템', 'SYSTEM', `💰 ${team.name}이 ${amount}P에 입찰했습니다!`)
      recordFixtureAuctionEvent(room, 'BID_PLACED', {
        currentPlayerId: playerId,
        liveBid: clone(room.liveBid),
      })

      return {
        timerEndsAt: room.timerEndsAt,
        revision: room.revision,
        debug: {
          eventId: room.lastAuctionEvent?.eventId,
          serverReceivedAt: Date.now(),
          serverCompletedAt: Date.now(),
        },
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : '알 수 없는 오류' }
    }
  })
}

export async function awardFixturePlayer(roomId: string, playerId: string): Promise<{ error?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    const player = room.players.find((entry) => entry.id === playerId)
    if (!player) return { error: '선수를 찾을 수 없습니다.' }
    if (player.status === 'SOLD' || player.status === 'UNSOLD') return {}
    if (room.timerEndsAt && new Date(room.timerEndsAt).getTime() > Date.now()) return {}

    const topBid =
      room.liveBid?.player_id === playerId
        ? room.liveBid
        : room.bids
            .filter((bid) => bid.player_id === playerId)
            .sort((a, b) => b.amount - a.amount)[0] ?? null

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
      team.roster_slots_used = (team.roster_slots_used ?? 0) + 1
      appendMessage(room, '시스템', 'SYSTEM', `🏆 ${team.name}이 ${player.name} 선수를 ${topBid.amount}P에 낙찰!`)
      recordFixtureAuctionEvent(room, 'PLAYER_AWARDED', {
        player: clone(player),
        team: clone(team),
        currentPlayerId: null,
        timerEndsAt: null,
        liveBid: null,
      })
    } else {
      player.status = 'UNSOLD'
      player.team_id = null
      player.sold_price = null
      appendMessage(room, '시스템', 'SYSTEM', `❌ ${player.name} 선수 유찰`)
      recordFixtureAuctionEvent(room, 'PLAYER_UNSOLD', {
        player: clone(player),
        currentPlayerId: null,
        timerEndsAt: null,
        liveBid: null,
      })
    }
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

export async function setFixtureLeaderPresence(
  roomId: string,
  teamId: string,
  connected: boolean,
): Promise<{ error?: string }> {
  try {
    const room = getRoomOrThrow(roomId)
    const hasTeam = room.teams.some((team) => team.id === teamId)
    if (!hasTeam) return { error: '팀을 찾을 수 없습니다.' }

    room.presences = room.presences.filter(
      (presence) => !(presence.role === 'LEADER' && presence.teamId === teamId),
    )
    if (connected) {
      room.presences.push({
        role: 'LEADER',
        teamId,
      })
    }
    nextRevision(room)
    return {}
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
    team.roster_slots_used = (team.roster_slots_used ?? soldCount) + 1

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
    room.nextAuctionDurationMs = EXTEND_DURATION_MS

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
