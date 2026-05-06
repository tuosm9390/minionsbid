import type {
  Bid,
  LiveBidState,
  Message,
  Player,
  Team,
} from '@/features/auction/store/useAuctionStore'

export type AuctionEventType =
  | 'LOTTERY_DRAWN'
  | 'LOTTERY_CLOSED'
  | 'AUCTION_STARTED'
  | 'AUCTION_PAUSED'
  | 'AUCTION_RESUMED'
  | 'BID_PLACED'
  | 'PLAYER_AWARDED'
  | 'PLAYER_UNSOLD'
  | 'DRAFT_ASSIGNED'
  | 'RE_AUCTION_STARTED'

export interface AuctionEventEnvelope {
  eventId: string
  revision: number
  roomId: string
  type: AuctionEventType
  serverCreatedAt: string
  currentPlayerId?: string | null
  timerEndsAt?: string | null
  liveBid?: LiveBidState | null
  player?: Partial<Player> & Pick<Player, 'id'>
  lotteryPlayer?: Player | null
  team?: Partial<Team> & Pick<Team, 'id'>
  playerIdsToWaiting?: string[]
  message?: Message | null
}

export interface AuctionRealtimeStateSlice {
  auctionEventRevision: number
  players: Player[]
  teams: Team[]
  timerEndsAt: string | null
  currentPlayerId: string | null
  liveBid: LiveBidState | null
  lotteryPlayer: Player | null
}

export interface AppliedAuctionRealtimeState {
  applied: boolean
  players: Player[]
  teams: Team[]
  timerEndsAt: string | null
  currentPlayerId: string | null
  liveBid: LiveBidState | null
  lotteryPlayer: Player | null
  revision: number
}

interface AuctionDerivedStateInput {
  bids: Bid[]
  currentPlayerId?: string | null
  liveBid?: LiveBidState | null
  teamId?: string | null
  teams?: Team[]
}

interface AuctionBidStateInput {
  currentBidAmount?: number | null
  currentBidTeamId?: string | null
  teamId?: string | null
  teamPointBalance?: number | null
  isAuctionActive?: boolean
  hasCurrentPlayer?: boolean
  isTeamFull?: boolean
}

export interface AuctionBidState {
  highestBid: number
  minBid: number
  topBidTeamId: string | null
  isLeading: boolean
}

export interface AuctionBidEligibility extends AuctionBidState {
  canBid: boolean
}

export function getAuctionDerivedState({
  bids,
  currentPlayerId,
  liveBid,
  teamId,
  teams = [],
}: AuctionDerivedStateInput) {
  const playerBids = bids.filter((bid) => bid.player_id === currentPlayerId)
  const firestoreHighestBid =
    playerBids.length > 0 ? Math.max(...playerBids.map((bid) => bid.amount)) : 0
  const activeLiveBid =
    liveBid?.player_id === currentPlayerId ? liveBid : null
  const highestBid = Math.max(firestoreHighestBid, activeLiveBid?.amount ?? 0)
  const topBid =
    activeLiveBid && activeLiveBid.amount >= firestoreHighestBid
      ? activeLiveBid
      : playerBids.find((bid) => bid.amount === firestoreHighestBid) ?? null
  const minBid = highestBid > 0 ? highestBid + 10 : 10
  const isLeading = topBid?.team_id === teamId
  const leadingTeam = teams.find((team) => team.id === topBid?.team_id) ?? null

  return {
    playerBids,
    firestoreHighestBid,
    activeLiveBid,
    highestBid,
    topBid,
    minBid,
    isLeading,
    leadingTeam,
  }
}

export function getAuctionBidState({
  currentBidAmount,
  currentBidTeamId,
  teamId,
}: AuctionBidStateInput): AuctionBidState {
  const highestBid = Math.max(currentBidAmount ?? 0, 0)
  const minBid = highestBid > 0 ? highestBid + 10 : 10
  const topBidTeamId = currentBidTeamId ?? null
  const isLeading = !!teamId && topBidTeamId === teamId

  return {
    highestBid,
    minBid,
    topBidTeamId,
    isLeading,
  }
}

export function getAuctionBidEligibility({
  currentBidAmount,
  currentBidTeamId,
  teamId,
  teamPointBalance,
  isAuctionActive,
  hasCurrentPlayer,
  isTeamFull,
}: AuctionBidStateInput): AuctionBidEligibility {
  const base = getAuctionBidState({
    currentBidAmount,
    currentBidTeamId,
    teamId,
  })

  const canBid =
    !!isAuctionActive &&
    !!hasCurrentPlayer &&
    !base.isLeading &&
    !isTeamFull &&
    (teamPointBalance ?? 0) >= base.minBid

  return {
    ...base,
    canBid,
  }
}

export function getAuctionRecoveryKey(args: {
  currentPlayerId?: string | null
  timerEndsAt?: string | null
  revision?: number | null
}) {
  if (!args.currentPlayerId || !args.timerEndsAt) return null
  return `${args.currentPlayerId}:${args.timerEndsAt}:${args.revision ?? 0}`
}

export function getAuctionExpiryWakeUpDelay(
  timerEndsAt: string,
  now = Date.now(),
  graceMs = 0,
) {
  const MAX_TIMEOUT_MS = 2_147_483_647
  return Math.min(
    MAX_TIMEOUT_MS,
    Math.max(0, new Date(timerEndsAt).getTime() - now + graceMs),
  )
}

export function shouldRecoverExpiredAuction(args: {
  effectiveRole?: string | null
  currentPlayerId?: string | null
  timerEndsAt?: string | null
  recoveryKey?: string | null
  lastRecoveryKey?: string | null
  graceMs?: number
}) {
  if (!args.currentPlayerId || !args.timerEndsAt) {
    return { shouldRecover: false, recoveryKey: null as string | null }
  }
  const recoveryKey =
    args.recoveryKey ??
    getAuctionRecoveryKey({
      currentPlayerId: args.currentPlayerId,
      timerEndsAt: args.timerEndsAt,
    })
  if (!recoveryKey) {
    return { shouldRecover: false, recoveryKey: null as string | null }
  }

  const isExpired =
    new Date(args.timerEndsAt).getTime() + (args.graceMs ?? 0) <= Date.now()
  // 모든 역할이 복구 트리거 가능 — 서버 액션(awardPlayer)이 멱등성 보장
  const shouldRecover =
    isExpired &&
    args.lastRecoveryKey !== recoveryKey

  return {
    shouldRecover,
    recoveryKey,
  }
}

export function getNextReAuctionRoundState(args: {
  current: boolean
  eventType: AuctionEventType
}) {
  switch (args.eventType) {
    case 'RE_AUCTION_STARTED':
      return true
    case 'PLAYER_AWARDED':
    case 'PLAYER_UNSOLD':
      return false
    default:
      return args.current
  }
}

export function applyAuctionEventToState(
  state: AuctionRealtimeStateSlice,
  event: AuctionEventEnvelope,
): AppliedAuctionRealtimeState {
  if (event.revision <= state.auctionEventRevision) {
    return {
      applied: false,
      players: state.players,
      teams: state.teams,
      timerEndsAt: state.timerEndsAt,
      currentPlayerId: state.currentPlayerId,
      liveBid: state.liveBid,
      lotteryPlayer: state.lotteryPlayer,
      revision: state.auctionEventRevision,
    }
  }

  let nextPlayers = state.players
  let nextTeams = state.teams
  let nextTimerEndsAt = state.timerEndsAt
  let nextCurrentPlayerId = state.currentPlayerId
  let nextLiveBid = state.liveBid
  let nextLotteryPlayer = state.lotteryPlayer

  if (event.player) {
    nextPlayers = state.players.map((player) =>
      player.id === event.player?.id ? { ...player, ...event.player } : player,
    )
  }

  if (event.team) {
    nextTeams = state.teams.map((team) =>
      team.id === event.team?.id ? { ...team, ...event.team } : team,
    )
  }

  switch (event.type) {
    case 'LOTTERY_DRAWN':
      nextCurrentPlayerId =
        event.currentPlayerId ?? event.player?.id ?? nextCurrentPlayerId
      nextLotteryPlayer = event.lotteryPlayer ?? null
      break
    case 'LOTTERY_CLOSED':
      nextLotteryPlayer = null
      break
    case 'AUCTION_STARTED':
    case 'AUCTION_RESUMED':
    case 'AUCTION_PAUSED':
      nextCurrentPlayerId =
        event.currentPlayerId ?? event.player?.id ?? nextCurrentPlayerId
      nextTimerEndsAt = event.timerEndsAt ?? null
      break
    case 'BID_PLACED':
      nextCurrentPlayerId = event.currentPlayerId ?? nextCurrentPlayerId
      nextTimerEndsAt = event.timerEndsAt ?? nextTimerEndsAt
      nextLiveBid = event.liveBid ?? null
      break
    case 'PLAYER_AWARDED':
    case 'PLAYER_UNSOLD':
      nextTimerEndsAt = null
      nextCurrentPlayerId = null
      nextLiveBid = null
      nextLotteryPlayer = null
      break
    case 'DRAFT_ASSIGNED':
      break
    case 'RE_AUCTION_STARTED':
      nextPlayers = nextPlayers.map((player) =>
        event.playerIdsToWaiting?.includes(player.id)
          ? { ...player, status: 'WAITING', sold_price: null, team_id: null }
          : player,
      )
      break
  }

  return {
    applied: true,
    players: nextPlayers,
    teams: nextTeams,
    timerEndsAt: nextTimerEndsAt,
    currentPlayerId: nextCurrentPlayerId,
    liveBid: nextLiveBid,
    lotteryPlayer: nextLotteryPlayer,
    revision: event.revision,
  }
}
