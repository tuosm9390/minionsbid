// SOCKET_SHADOW Socket.IO 서버의 fixture 인증과 경매 이벤트를 검증한다.
import { createServer, type Server as HttpServer } from 'node:http'
import { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client'
import {
  attachSocketShadowServer,
  type SocketShadowServerHandle,
} from '@/features/auction/socket/socketShadowServer'

const roomState = {
  roomId: 'room-1',
  currentPlayerId: 'player-1',
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

describe('attachSocketShadowServer', () => {
  let httpServer: HttpServer
  let shadowServer: SocketShadowServerHandle
  let baseUrl: string
  const sockets: ClientSocket[] = []

  beforeEach(async () => {
    httpServer = createServer()
    shadowServer = attachSocketShadowServer(httpServer, {
      getRoomState: (roomId) => (roomId === roomState.roomId ? roomState : null),
      validateAuth: (auth) => {
        if (auth.roomId !== roomState.roomId) return { ok: false, reason: 'unknown room' }
        if (auth.role === 'LEADER') {
          return {
            ok: auth.teamId === 'team-blue' && auth.authToken === 'fixture-blue-token',
            reason: 'invalid leader token',
          }
        }
        if (auth.role === 'VIEWER') {
          return { ok: auth.authToken === 'fixture-viewer-token', reason: 'invalid viewer token' }
        }
        return { ok: false, reason: 'unsupported role' }
      },
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const address = httpServer.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    sockets.forEach((socket) => socket.disconnect())
    sockets.length = 0
    await new Promise<void>((resolve) => shadowServer.close(resolve))
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  async function connectClient(auth: Record<string, unknown>) {
    const socket = createClient(baseUrl, {
      auth,
      transports: ['websocket'],
      reconnection: false,
    })
    sockets.push(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('connect_error', reject)
    })
    return socket
  }

  it('valid fixture leader가 join 후 ping과 sync 응답을 받는다', async () => {
    const socket = await connectClient({
      roomId: 'room-1',
      role: 'LEADER',
      teamId: 'team-blue',
      authToken: 'fixture-blue-token',
    })

    const ping = await socket.timeout(1000).emitWithAck('auction:ping')
    const sync = await socket.timeout(1000).emitWithAck('auction:sync', { reason: 'MANUAL' })

    expect(ping).toEqual({ ok: true, roomId: 'room-1' })
    expect(sync).toMatchObject({
      type: 'auction:sync',
      reason: 'MANUAL',
      state: {
        roomId: 'room-1',
        currentPlayerId: 'player-1',
        sequence: 0,
      },
    })
  })

  it('잘못된 fixture token은 connection error로 거부한다', async () => {
    const socket = createClient(baseUrl, {
      auth: {
        roomId: 'room-1',
        role: 'LEADER',
        teamId: 'team-blue',
        authToken: 'wrong-token',
      },
      transports: ['websocket'],
      reconnection: false,
    })
    sockets.push(socket)

    await expect(
      new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('connect_error', reject)
      }),
    ).rejects.toThrow('invalid leader token')
  })

  it('leader shadow bid는 accepted 되고 viewer shadow bid는 거부된다', async () => {
    const leader = await connectClient({
      roomId: 'room-1',
      role: 'LEADER',
      teamId: 'team-blue',
      authToken: 'fixture-blue-token',
    })
    const viewer = await connectClient({
      roomId: 'room-1',
      role: 'VIEWER',
      authToken: 'fixture-viewer-token',
    })

    const accepted = await leader.timeout(1000).emitWithAck('bid:shadowSubmit', {
      roomId: 'room-1',
      requestId: 'request-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      sentAt: Date.now(),
    })
    const rejected = await viewer.timeout(1000).emitWithAck('bid:shadowSubmit', {
      roomId: 'room-1',
      requestId: 'request-2',
      playerId: 'player-1',
      teamId: 'team-red',
      amount: 20,
      sentAt: Date.now(),
    })

    expect(accepted).toMatchObject({
      type: 'bid:accepted',
      requestId: 'request-1',
      state: {
        sequence: 1,
        currentBid: {
          teamId: 'team-blue',
          amount: 10,
        },
      },
    })
    expect(rejected).toEqual({
      ok: false,
      error: '팀장만 shadow 입찰을 전송할 수 있습니다.',
    })
  })

  it('leader primary bid는 persistence 완료 후 bid:submit ack와 broadcast를 반환한다', async () => {
    const persistGate: { resolve: (() => void) | null } = { resolve: null }
    const onAcceptedBid = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          persistGate.resolve = resolve
        }),
    )
    await new Promise<void>((resolve) => shadowServer.close(resolve))
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    httpServer = createServer()
    shadowServer = attachSocketShadowServer(httpServer, {
      getRoomState: (roomId) => (roomId === roomState.roomId ? roomState : null),
      validateAuth: () => true,
      onAcceptedBid,
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const address = httpServer.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
    const leader = await connectClient({
      roomId: 'room-1',
      role: 'LEADER',
      teamId: 'team-blue',
      authToken: 'fixture-blue-token',
    })
    const viewer = await connectClient({
      roomId: 'room-1',
      role: 'VIEWER',
      authToken: 'fixture-viewer-token',
    })
    const stateEvents: unknown[] = []
    viewer.on('auction:state', (state) => stateEvents.push(state))
    const stateEventPromise = new Promise<unknown>((resolve) => {
      viewer.once('auction:state', resolve)
    })

    let ackSettled = false
    const ackPromise = leader.timeout(1000).emitWithAck('bid:submit', {
      roomId: 'room-1',
      requestId: 'request-primary-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      sentAt: Date.now(),
    }).then((value) => {
      ackSettled = true
      return value
    })

    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(onAcceptedBid).toHaveBeenCalledWith(expect.objectContaining({
      type: 'bid:accepted',
      requestId: 'request-primary-1',
    }))
    expect(ackSettled).toBe(false)
    expect(stateEvents).toEqual([])

    const releasePersist = persistGate.resolve
    if (!releasePersist) throw new Error('persistence gate was not opened by onAcceptedBid')
    releasePersist()
    const accepted = await ackPromise
    await stateEventPromise

    expect(accepted).toMatchObject({
      type: 'bid:accepted',
      requestId: 'request-primary-1',
      state: {
        sequence: 1,
        currentBid: {
          teamId: 'team-blue',
          amount: 10,
        },
      },
    })
    expect(stateEvents).toHaveLength(1)
    expect(stateEvents[0]).toMatchObject({
      sequence: 1,
      currentBid: {
        teamId: 'team-blue',
        amount: 10,
      },
    })
  })

  it('leader primary bid persistence 실패는 accepted broadcast 없이 ack error로 반환한다', async () => {
    const onAcceptedBid = vi.fn().mockRejectedValue(new Error('firestore down'))
    await new Promise<void>((resolve) => shadowServer.close(resolve))
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    httpServer = createServer()
    shadowServer = attachSocketShadowServer(httpServer, {
      getRoomState: (roomId) => (roomId === roomState.roomId ? roomState : null),
      validateAuth: () => true,
      onAcceptedBid,
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const address = httpServer.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
    const leader = await connectClient({
      roomId: 'room-1',
      role: 'LEADER',
      teamId: 'team-blue',
      authToken: 'fixture-blue-token',
    })
    const viewer = await connectClient({
      roomId: 'room-1',
      role: 'VIEWER',
      authToken: 'fixture-viewer-token',
    })
    const stateEvents: unknown[] = []
    viewer.on('auction:state', (state) => stateEvents.push(state))

    const rejected = await leader.timeout(1000).emitWithAck('bid:submit', {
      roomId: 'room-1',
      requestId: 'request-primary-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      sentAt: Date.now(),
    })

    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(rejected).toEqual({
      ok: false,
      error: '입찰 저장에 실패했습니다.',
    })
    expect(onAcceptedBid).toHaveBeenCalledWith(expect.objectContaining({
      type: 'bid:accepted',
      requestId: 'request-primary-1',
    }))
    expect(stateEvents).toEqual([])
  })
})
