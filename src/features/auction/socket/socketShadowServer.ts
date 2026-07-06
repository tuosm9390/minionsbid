// SOCKET_SHADOW 전용 Socket.IO 서버 attach 경계를 제공한다.
import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'
import {
  createInitialSocketAuctionState,
  type BidSubmitCommand,
  type SocketAuctionBidState,
  type SocketAuctionAcceptedEvent,
  type SocketAuctionState,
  type SocketAuctionTeamState,
} from '@/features/auction/socket/socketContracts'
import { createSocketAuctionEngine } from '@/features/auction/socket/socketAuctionEngine'

export type SocketShadowRole = 'ORGANIZER' | 'LEADER' | 'VIEWER'

export type SocketShadowAuth = {
  roomId?: string
  role?: SocketShadowRole
  teamId?: string
  authToken?: string
}

export type SocketShadowRoomState = {
  roomId: string
  sequence?: number
  currentPlayerId?: string | null
  currentBid?: SocketAuctionBidState | null
  timerEndsAt?: string | null
  teams: SocketAuctionTeamState[]
  lastEventId?: string | null
  serverTime?: number
}

export type SocketShadowAuthResult =
  | boolean
  | {
      ok: boolean
      reason?: string
    }

export type SocketShadowServerOptions = {
  corsOrigin?: string | string[]
  getRoomState: (roomId: string) => SocketShadowRoomState | null
  validateAuth?: (auth: SocketShadowAuth) => SocketShadowAuthResult
  onAcceptedBid?: (event: SocketAuctionAcceptedEvent) => void | Promise<void>
}

export type SocketShadowServerHandle = {
  io: Server
  close: (callback?: () => void) => void
}

type ShadowEngine = ReturnType<typeof createSocketAuctionEngine>

function getAck(first: unknown, second?: unknown) {
  if (typeof first === 'function') return first as (value: unknown) => void
  if (typeof second === 'function') return second as (value: unknown) => void
  return null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeAuth(value: unknown): SocketShadowAuth {
  if (!isObject(value)) return {}
  return {
    roomId: typeof value.roomId === 'string' ? value.roomId : undefined,
    role:
      value.role === 'ORGANIZER' || value.role === 'LEADER' || value.role === 'VIEWER'
        ? value.role
        : undefined,
    teamId: typeof value.teamId === 'string' ? value.teamId : undefined,
    authToken: typeof value.authToken === 'string' ? value.authToken : undefined,
  }
}

function normalizeBidCommand(value: unknown): BidSubmitCommand | null {
  if (!isObject(value)) return null
  if (
    typeof value.roomId !== 'string' ||
    typeof value.requestId !== 'string' ||
    typeof value.playerId !== 'string' ||
    typeof value.teamId !== 'string' ||
    typeof value.amount !== 'number'
  ) {
    return null
  }
  return {
    roomId: value.roomId,
    requestId: value.requestId,
    playerId: value.playerId,
    teamId: value.teamId,
    amount: value.amount,
    sentAt: typeof value.sentAt === 'number' ? value.sentAt : Date.now(),
  }
}

function rejectAck(socket: Socket, value: unknown, maybeAck: unknown, error: string) {
  const ack = getAck(value, maybeAck)
  if (ack) {
    ack({ ok: false, error })
    return
  }
  socket.emit('auction:error', { ok: false, error })
}

export function attachSocketShadowServer(
  httpServer: HttpServer,
  options: SocketShadowServerOptions,
): SocketShadowServerHandle {
  const io = new Server(httpServer, {
    cors: {
      origin: options.corsOrigin ?? '*',
    },
  })
  const engines = new Map<string, ShadowEngine>()

  const getEngine = (roomId: string) => {
    const cached = engines.get(roomId)
    if (cached) return cached
    const roomState = options.getRoomState(roomId)
    if (!roomState) return null
    const engine = createSocketAuctionEngine(
      createInitialSocketAuctionState({
        roomId: roomState.roomId,
        sequence: roomState.sequence,
        currentPlayerId: roomState.currentPlayerId ?? null,
        currentBid: roomState.currentBid ?? null,
        timerEndsAt: roomState.timerEndsAt ?? null,
        teams: roomState.teams,
        lastEventId: roomState.lastEventId,
        serverTime: roomState.serverTime,
      }),
    )
    engines.set(roomId, engine)
    return engine
  }

  io.use((socket, next) => {
    const auth = normalizeAuth(socket.handshake.auth)
    if (!auth.roomId) {
      next(new Error('roomId가 필요합니다.'))
      return
    }
    const validation = options.validateAuth?.(auth) ?? true
    const ok = typeof validation === 'boolean' ? validation : validation.ok
    if (!ok) {
      const reason =
        typeof validation === 'boolean'
          ? '인증에 실패했습니다.'
          : validation.reason ?? '인증에 실패했습니다.'
      next(new Error(reason))
      return
    }
    socket.data.shadowAuth = auth
    next()
  })

  io.on('connection', (socket) => {
    const auth = socket.data.shadowAuth as SocketShadowAuth
    const roomId = auth.roomId as string
    socket.join(`auction:${roomId}`)

    socket.on('auction:ping', (payloadOrAck, maybeAck) => {
      const ack = getAck(payloadOrAck, maybeAck)
      ack?.({ ok: true, roomId })
    })

    socket.on('auction:join', (payloadOrAck, maybeAck) => {
      const ack = getAck(payloadOrAck, maybeAck)
      const engine = getEngine(roomId)
      if (!engine) {
        ack?.({ ok: false, error: '방 상태를 찾을 수 없습니다.' })
        return
      }
      ack?.(engine.sync('JOIN'))
    })

    socket.on('auction:sync', (payloadOrAck, maybeAck) => {
      const ack = getAck(payloadOrAck, maybeAck)
      const engine = getEngine(roomId)
      if (!engine) {
        ack?.({ ok: false, error: '방 상태를 찾을 수 없습니다.' })
        return
      }
      ack?.(engine.sync('MANUAL'))
    })

    const handleBidSubmit = async (
      payload: unknown,
      ack: ((value: unknown) => void) | undefined,
      mode: 'shadow' | 'primary',
    ) => {
      if (auth.role !== 'LEADER') {
        rejectAck(socket, payload, ack, '팀장만 shadow 입찰을 전송할 수 있습니다.')
        return
      }
      const command = normalizeBidCommand(payload)
      if (!command) {
        rejectAck(socket, payload, ack, 'requestId, playerId, teamId, amount가 필요합니다.')
        return
      }
      if (command.roomId !== roomId || command.teamId !== auth.teamId) {
        rejectAck(socket, payload, ack, '인증된 팀 또는 방 정보와 입찰 요청이 일치하지 않습니다.')
        return
      }
      const engine = getEngine(roomId)
      if (!engine) {
        rejectAck(socket, payload, ack, '방 상태를 찾을 수 없습니다.')
        return
      }
      const previousState = engine.getSnapshot()
      const result = engine.submitBid(command)
      if (mode === 'primary' && result.type === 'bid:accepted') {
        const persistAcceptedBid =
          options.onAcceptedBid ??
          (async (event: SocketAuctionAcceptedEvent) => {
            const { persistSocketAcceptedBid } = await import(
              '@/features/auction/socket/socketBidPersistence'
            )
            await persistSocketAcceptedBid(event)
          })
        try {
          await persistAcceptedBid(result)
        } catch (error: unknown) {
          engine.replaceSnapshot(previousState)
          console.error('[socket-auction] accepted bid persistence failed', {
            roomId,
            requestId: result.requestId,
            error: error instanceof Error ? error.message : String(error),
          })
          ack?.({ ok: false, error: '입찰 저장에 실패했습니다.' })
          return
        }
      }
      io.to(`auction:${roomId}`).emit('auction:state', result.state satisfies SocketAuctionState)
      ack?.(result)
    }

    socket.on('bid:shadowSubmit', (payload, ack) => {
      void handleBidSubmit(payload, ack, 'shadow')
    })

    socket.on('bid:submit', (payload, ack) => {
      void handleBidSubmit(payload, ack, 'primary')
    })
  })

  return {
    io,
    close: (callback) => io.close(callback),
  }
}
