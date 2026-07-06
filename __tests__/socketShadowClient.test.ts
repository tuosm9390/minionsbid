// SOCKET_SHADOW client adapter가 shadow command를 비차단 전송하는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mirrorShadowBid } from '@/features/auction/socket/socketShadowClient'

describe('mirrorShadowBid', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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
