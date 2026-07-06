// SOCKET_SHADOW 실제 Socket.IO 서버와 클라이언트 smoke를 실행한다.
import { createServer } from 'node:http'
import { AddressInfo } from 'node:net'
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client'
import { attachSocketShadowServer } from '../src/features/auction/socket/socketShadowServer'

const roomState = {
  roomId: 'smoke-room',
  currentPlayerId: 'player-smoke',
  timerEndsAt: new Date(Date.now() + 30_000).toISOString(),
  teams: [
    {
      id: 'team-blue',
      name: 'Blue',
      pointBalance: 100,
      rosterSlotsUsed: 0,
      rosterSlotsTotal: 3,
    },
    {
      id: 'team-red',
      name: 'Red',
      pointBalance: 100,
      rosterSlotsUsed: 0,
      rosterSlotsTotal: 3,
    },
  ],
}

function assertCondition(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

async function connectClient(baseUrl: string, auth: Record<string, unknown>) {
  const socket = createClient(baseUrl, {
    auth,
    transports: ['websocket'],
    reconnection: false,
  })
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })
  return socket
}

async function expectConnectionError(baseUrl: string) {
  const socket = createClient(baseUrl, {
    auth: {
      roomId: roomState.roomId,
      role: 'LEADER',
      teamId: 'team-blue',
      authToken: 'wrong-token',
    },
    transports: ['websocket'],
    reconnection: false,
  })
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('connect_error', reject)
    })
    throw new Error('invalid token connection unexpectedly succeeded')
  } catch (error) {
    if (!(error instanceof Error)) {
      throw new Error('invalid token error must be an Error')
    }
    assertCondition(
      error.message.includes('invalid leader token'),
      `unexpected invalid token error: ${error.message}`,
    )
  } finally {
    socket.disconnect()
  }
}

async function main() {
  const httpServer = createServer()
  const shadowServer = attachSocketShadowServer(httpServer, {
    getRoomState: (roomId) => (roomId === roomState.roomId ? roomState : null),
    validateAuth: (auth) => {
      if (auth.roomId !== roomState.roomId) return { ok: false, reason: 'unknown room' }
      if (auth.role === 'LEADER') {
        return {
          ok:
            (auth.teamId === 'team-blue' && auth.authToken === 'fixture-blue-token') ||
            (auth.teamId === 'team-red' && auth.authToken === 'fixture-red-token'),
          reason: 'invalid leader token',
        }
      }
      if (auth.role === 'VIEWER') {
        return { ok: auth.authToken === 'fixture-viewer-token', reason: 'invalid viewer token' }
      }
      return { ok: false, reason: 'unsupported role' }
    },
    onAcceptedBid: (event) => {
      acceptedBidEvents.push(event.requestId)
    },
  })
  const acceptedBidEvents: string[] = []
  const sockets: ClientSocket[] = []
  try {
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const address = httpServer.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${address.port}`

    const leader = await connectClient(baseUrl, {
      roomId: roomState.roomId,
      role: 'LEADER',
      teamId: 'team-blue',
      authToken: 'fixture-blue-token',
    })
    const viewer = await connectClient(baseUrl, {
      roomId: roomState.roomId,
      role: 'VIEWER',
      authToken: 'fixture-viewer-token',
    })
    const redLeader = await connectClient(baseUrl, {
      roomId: roomState.roomId,
      role: 'LEADER',
      teamId: 'team-red',
      authToken: 'fixture-red-token',
    })
    sockets.push(leader, viewer, redLeader)

    const ping = await leader.timeout(2000).emitWithAck('auction:ping')
    const sync = await leader.timeout(2000).emitWithAck('auction:sync', { reason: 'MANUAL' })
    const primaryAccepted = await leader.timeout(2000).emitWithAck('bid:submit', {
      roomId: roomState.roomId,
      requestId: 'smoke-primary-request-1',
      playerId: roomState.currentPlayerId,
      teamId: 'team-blue',
      amount: 10,
      sentAt: Date.now(),
    })
    const shadowAccepted = await redLeader.timeout(2000).emitWithAck('bid:shadowSubmit', {
      roomId: roomState.roomId,
      requestId: 'smoke-shadow-request-1',
      playerId: roomState.currentPlayerId,
      teamId: 'team-red',
      amount: 20,
      sentAt: Date.now(),
    })
    const viewerReject = await viewer.timeout(2000).emitWithAck('bid:shadowSubmit', {
      roomId: roomState.roomId,
      requestId: 'smoke-request-2',
      playerId: roomState.currentPlayerId,
      teamId: 'team-red',
      amount: 20,
      sentAt: Date.now(),
    })
    await expectConnectionError(baseUrl)

    assertCondition(ping.ok === true && ping.roomId === roomState.roomId, 'ping ack mismatch')
    assertCondition(sync.type === 'auction:sync', 'sync type mismatch')
    assertCondition(sync.state.sequence === 0, 'initial sync sequence mismatch')
    assertCondition(primaryAccepted.type === 'bid:accepted', 'primary bid was not accepted')
    assertCondition(primaryAccepted.state.sequence === 1, 'primary accepted sequence mismatch')
    assertCondition(shadowAccepted.type === 'bid:accepted', 'shadow bid was not accepted')
    assertCondition(shadowAccepted.state.sequence === 2, 'shadow accepted sequence mismatch')
    assertCondition(
      acceptedBidEvents.includes('smoke-primary-request-1'),
      'primary accepted event was not persisted through callback',
    )
    assertCondition(
      viewerReject.error === '팀장만 shadow 입찰을 전송할 수 있습니다.',
      'viewer reject mismatch',
    )

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          ping,
          sync: {
            type: sync.type,
            sequence: sync.state.sequence,
            roomId: sync.state.roomId,
          },
          primaryAccepted: {
            type: primaryAccepted.type,
            sequence: primaryAccepted.state.sequence,
            teamId: primaryAccepted.state.currentBid?.teamId,
            amount: primaryAccepted.state.currentBid?.amount,
          },
          shadowAccepted: {
            type: shadowAccepted.type,
            sequence: shadowAccepted.state.sequence,
            teamId: shadowAccepted.state.currentBid?.teamId,
            amount: shadowAccepted.state.currentBid?.amount,
          },
          acceptedBidEvents,
          viewerReject,
          cleanup: 'socket clients disconnected; Socket.IO server and HTTP server closed',
        },
        null,
        2,
      ),
    )
  } finally {
    sockets.forEach((socket) => socket.disconnect())
    await new Promise<void>((resolve) => shadowServer.close(resolve))
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
