// SOCKET_SHADOW client adapter가 shadow command를 비차단 전송하는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { io } from 'socket.io-client'
import { mirrorShadowBid } from '@/features/auction/socket/socketShadowClient'

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}))

describe('mirrorShadowBid', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as typeof window & { __SOCKET_SHADOW_URL__?: string }).__SOCKET_SHADOW_URL__
    delete (window as typeof window & { __socketShadowBidResults__?: unknown }).__socketShadowBidResults__
    delete (window as typeof window & { __socketShadowSockets__?: unknown }).__socketShadowSockets__
  })

  it('FIREBASE transport에서는 shadow 요청을 건너뛴다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await mirrorShadowBid({
      auctionTransport: 'FIREBASE',
      roomId: 'room-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      requestId: 'request-1',
    })

    expect(result).toEqual({ ok: true, skipped: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('SOCKET_SHADOW transport에서는 fixture shadow endpoint에 bid command를 보낸다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ type: 'bid:accepted' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await mirrorShadowBid({
      auctionTransport: 'SOCKET_SHADOW',
      roomId: 'room-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      requestId: 'request-1',
    })

    expect(result).toMatchObject({ ok: true, type: 'bid:accepted' })
    expect(fetchSpy).toHaveBeenCalledWith('/api/e2e/socket-hybrid/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomId: 'room-1',
        action: 'bid',
        requestId: 'request-1',
        playerId: 'player-1',
        teamId: 'team-blue',
        amount: 10,
      }),
    })
  })

  it('Socket URL이 있으면 Socket.IO ack로 shadow bid를 전송하고 관측 결과를 기록한다', async () => {
    const emitWithAck = vi.fn().mockResolvedValue({
      type: 'bid:accepted',
      requestId: 'request-1',
      state: {
        currentBid: {
          playerId: 'player-1',
          teamId: 'team-blue',
          amount: 10,
        },
      },
    })
    const timeout = vi.fn(() => ({ emitWithAck }))
    vi.mocked(io).mockReturnValue({ timeout } as unknown as ReturnType<typeof io>)
    ;(window as typeof window & { __SOCKET_SHADOW_URL__?: string }).__SOCKET_SHADOW_URL__ =
      'http://127.0.0.1:4100'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await mirrorShadowBid({
      auctionTransport: 'SOCKET_SHADOW',
      roomId: 'room-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      requestId: 'request-1',
      role: 'LEADER',
      authToken: 'fixture-blue-token',
    })

    expect(result).toMatchObject({ ok: true, type: 'bid:accepted' })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(io).toHaveBeenCalledWith('http://127.0.0.1:4100', {
      auth: {
        roomId: 'room-1',
        role: 'LEADER',
        teamId: 'team-blue',
        authToken: 'fixture-blue-token',
      },
      transports: ['websocket'],
      reconnection: true,
    })
    expect(timeout).toHaveBeenCalledWith(2000)
    expect(emitWithAck).toHaveBeenCalledWith('bid:shadowSubmit', {
      roomId: 'room-1',
      requestId: 'request-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      sentAt: expect.any(Number),
    })
    expect(
      (window as typeof window & { __socketShadowBidResults__?: unknown[] })
        .__socketShadowBidResults__,
    ).toMatchObject([
      {
        roomId: 'room-1',
        requestId: 'request-1',
        ok: true,
        type: 'bid:accepted',
        mismatch: false,
      },
    ])
  })

  it('shadow 요청 실패는 throw하지 않고 실패 결과로 접는다', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket down'))

    const result = await mirrorShadowBid({
      auctionTransport: 'SOCKET_SHADOW',
      roomId: 'room-1',
      playerId: 'player-1',
      teamId: 'team-blue',
      amount: 10,
      requestId: 'request-1',
    })

    expect(result).toEqual({
      ok: false,
      error: 'socket down',
    })
  })
})
