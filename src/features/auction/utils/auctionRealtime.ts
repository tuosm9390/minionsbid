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
  liveBid: LiveBidState | null
  lotteryPlayer: Player | null
}

export interface AppliedAuctionRealtimeState {
  applied: boolean
  players: Player[]
  teams: Team[]
  timerEndsAt: string | null
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
      liveBid: state.liveBid,
      lotteryPlayer: state.lotteryPlayer,
      revision: state.auctionEventRevision,
    }
  }

  let nextPlayers = state.players
  let nextTeams = state.teams
  let nextTimerEndsAt = state.timerEndsAt
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
      nextLotteryPlayer = event.lotteryPlayer ?? null
      break
    case 'LOTTERY_CLOSED':
      nextLotteryPlayer = null
      break
    case 'AUCTION_STARTED':
    case 'AUCTION_RESUMED':
    case 'AUCTION_PAUSED':
      nextTimerEndsAt = event.timerEndsAt ?? null
      break
    case 'BID_PLACED':
      nextTimerEndsAt = event.timerEndsAt ?? nextTimerEndsAt
      nextLiveBid = event.liveBid ?? null
      break
    case 'PLAYER_AWARDED':
    case 'PLAYER_UNSOLD':
      nextTimerEndsAt = null
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
    liveBid: nextLiveBid,
    lotteryPlayer: nextLotteryPlayer,
    revision: event.revision,
  }
}
