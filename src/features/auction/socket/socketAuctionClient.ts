'use client'

// SOCKET_CANARY 모드에서 Socket.IO 확정 경매 상태를 클라이언트 store에 적용한다.
import { io, type Socket } from 'socket.io-client'
import type {
  SocketAuctionCommandResult,
  SocketAuctionState,
} from '@/features/auction/socket/socketContracts'
import { useAuctionStore, type Team } from '@/features/auction/store/useAuctionStore'

export type SocketPrimaryBidArgs = {
  roomId: string
  playerId: string
  teamId: string
  amount: number
  authToken?: string
  requestId: string
}

export type SocketPrimaryBidResult = {
  eventId?: string
  timerEndsAt?: string | null
  revision?: number
  error?: string
}

type AuctionSocketWindow = typeof window & {
  __AUCTION_SOCKET_URL__?: string
  __SOCKET_SHADOW_URL__?: string
  __auctionSocketClients__?: Map<string, Socket>
}

function getAuctionSocketWindow(): AuctionSocketWindow | null {
  if (typeof window === 'undefined') return null
  return window as AuctionSocketWindow
}

function getAuctionSocketUrl() {
  const socketWindow = getAuctionSocketWindow()
  return (
    socketWindow?.__AUCTION_SOCKET_URL__ ??
    socketWindow?.__SOCKET_SHADOW_URL__ ??
    process.env.NEXT_PUBLIC_AUCTION_SOCKET_URL ??
    process.env.NEXT_PUBLIC_SOCKET_SHADOW_URL ??
    ''
  )
}

function getAuctionSocket(args: {
  roomId: string
  role: 'LEADER' | 'ORGANIZER' | 'VIEWER'
  teamId?: string
  authToken?: string
}) {
  const socketWindow = getAuctionSocketWindow()
  const url = getAuctionSocketUrl()
  if (!socketWindow || !url) return null
  const cacheKey = [
    url,
    args.roomId,
    args.role,
    args.teamId ?? '',
    args.authToken ?? '',
  ].join('|')
  const sockets = socketWindow.__auctionSocketClients__ ?? new Map<string, Socket>()
  socketWindow.__auctionSocketClients__ = sockets
  const cached = sockets.get(cacheKey)
  if (cached) return cached
  const socket = io(url, {
    auth: {
      roomId: args.roomId,
      role: args.role,
      teamId: args.teamId,
      authToken: args.authToken,
    },
    transports: ['websocket'],
    reconnection: true,
  })
  sockets.set(cacheKey, socket)
  return socket
}

function mergeSocketTeams(existingTeams: Team[], socketState: SocketAuctionState) {
  const socketTeamsById = new Map(socketState.teams.map((team) => [team.id, team]))
  return existingTeams.map((team) => {
    const socketTeam = socketTeamsById.get(team.id)
    if (!socketTeam) return team
    return {
      ...team,
      point_balance: socketTeam.pointBalance,
      roster_slots_used: socketTeam.rosterSlotsUsed,
      roster_slots_total: socketTeam.rosterSlotsTotal,
    }
  })
}

export function applySocketAuctionState(socketState: SocketAuctionState) {
  const storeState = useAuctionStore.getState()
  const currentBid = socketState.currentBid
  storeState.setLiveBid(
    currentBid
      ? {
          event_id: currentBid.eventId,
          player_id: currentBid.playerId,
          team_id: currentBid.teamId,
          amount: currentBid.amount,
          created_at: currentBid.createdAt,
        }
      : null,
  )
  storeState.setAuctionEventRevision(socketState.sequence)
  storeState.setRealtimeData({
    timerEndsAt: socketState.timerEndsAt,
    currentPlayerId: socketState.currentPlayerId,
    teams: mergeSocketTeams(storeState.teams, socketState),
  })
}

export async function placeBidSocketPrimary(
  args: SocketPrimaryBidArgs,
): Promise<SocketPrimaryBidResult> {
  try {
    const socket = getAuctionSocket({
      roomId: args.roomId,
      role: 'LEADER',
      teamId: args.teamId,
      authToken: args.authToken,
    })
    if (!socket) return { error: 'Socket.IO 경매 서버가 설정되지 않았습니다.' }

    const result = (await socket.timeout(2000).emitWithAck('bid:submit', {
      roomId: args.roomId,
      requestId: args.requestId,
      playerId: args.playerId,
      teamId: args.teamId,
      amount: args.amount,
      sentAt: Date.now(),
    })) as SocketAuctionCommandResult | { ok: false; error?: string }

    if (!('type' in result)) {
      return { error: result.error ?? 'Socket.IO 입찰에 실패했습니다.' }
    }
    if (result.type === 'bid:rejected') {
      return { error: result.reason }
    }

    applySocketAuctionState(result.state)
    return {
      eventId: result.eventId,
      timerEndsAt: result.state.timerEndsAt,
      revision: result.state.sequence,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Socket.IO 입찰에 실패했습니다.',
    }
  }
}

export function subscribeSocketAuctionState(args: {
  roomId: string
  role: 'LEADER' | 'ORGANIZER' | 'VIEWER'
  teamId?: string | null
  authToken?: string | null
}) {
  const socket = getAuctionSocket({
    roomId: args.roomId,
    role: args.role,
    teamId: args.teamId ?? undefined,
    authToken: args.authToken ?? undefined,
  })
  if (!socket) return () => undefined
  const applyState = (state: SocketAuctionState) => {
    applySocketAuctionState(state)
  }
  socket.on('auction:state', applyState)
  void socket.timeout(2000).emitWithAck('auction:join').then((result: unknown) => {
    if (
      typeof result === 'object' &&
      result !== null &&
      'type' in result &&
      result.type === 'auction:sync' &&
      'state' in result
    ) {
      applySocketAuctionState(result.state as SocketAuctionState)
    }
  })
  return () => {
    socket.off('auction:state', applyState)
  }
}
