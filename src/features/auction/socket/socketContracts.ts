// Socket.IO hybrid 경매 엔진과 클라이언트가 공유하는 상태 계약을 정의한다.
export type SocketAuctionPhase =
  | 'WAITING'
  | 'LOTTERY'
  | 'ACTIVE'
  | 'PAUSED'
  | 'AWARDED'
  | 'UNSOLD'
  | 'ASSIGNMENT'
  | 'FINISHED'

export type SocketAuctionTeamState = {
  id: string
  name: string
  pointBalance: number
  rosterSlotsUsed: number
  rosterSlotsTotal: number
}

export type SocketAuctionBidState = {
  eventId: string
  requestId: string
  playerId: string
  teamId: string
  amount: number
  createdAt: string
}

export type SocketAuctionState = {
  roomId: string
  sequence: number
  phase: SocketAuctionPhase
  currentPlayerId: string | null
  currentBid: SocketAuctionBidState | null
  timerEndsAt: string | null
  teams: SocketAuctionTeamState[]
  lastEventId: string | null
  serverTime: number
}

export type BidSubmitCommand = {
  roomId: string
  requestId: string
  playerId: string
  teamId: string
  amount: number
  sentAt: number
}

export type SocketAuctionAcceptedEvent = {
  type: 'bid:accepted'
  requestId: string
  eventId: string
  state: SocketAuctionState
}

export type SocketAuctionRejectedEvent = {
  type: 'bid:rejected'
  requestId: string
  reason: string
  state: SocketAuctionState
}

export type SocketAuctionSyncEvent = {
  type: 'auction:sync'
  state: SocketAuctionState
  reason: 'JOIN' | 'RECONNECT' | 'GAP' | 'MANUAL'
}

export type SocketAuctionCommandResult =
  | SocketAuctionAcceptedEvent
  | SocketAuctionRejectedEvent

export function createInitialSocketAuctionState(args: {
  roomId: string
  currentPlayerId?: string | null
  timerEndsAt?: string | null
  teams: SocketAuctionTeamState[]
}): SocketAuctionState {
  return {
    roomId: args.roomId,
    sequence: 0,
    phase: args.currentPlayerId ? 'ACTIVE' : 'WAITING',
    currentPlayerId: args.currentPlayerId ?? null,
    currentBid: null,
    timerEndsAt: args.timerEndsAt ?? null,
    teams: args.teams.map((team) => ({ ...team })),
    lastEventId: null,
    serverTime: Date.now(),
  }
}
