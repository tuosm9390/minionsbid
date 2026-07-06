'use client'

// SOCKET_SHADOW 모드에서 기존 Firebase 입찰 결과를 shadow 경로로 미러링한다.
import type { AuctionTransport } from '@/features/auction/utils/auctionTransport'

export type ShadowBidMirrorArgs = {
  auctionTransport: AuctionTransport
  roomId: string
  playerId: string
  teamId: string
  amount: number
  requestId: string
}

export type ShadowBidMirrorResult = {
  ok: boolean
  skipped?: boolean
  error?: string
  status?: number
  type?: string
}

export async function mirrorShadowBid(
  args: ShadowBidMirrorArgs,
): Promise<ShadowBidMirrorResult> {
  if (args.auctionTransport !== 'SOCKET_SHADOW') {
    return { ok: true, skipped: true }
  }

  try {
    const response = await fetch('/api/e2e/socket-hybrid/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomId: args.roomId,
        action: 'bid',
        requestId: args.requestId,
        playerId: args.playerId,
        teamId: args.teamId,
        amount: args.amount,
      }),
    })
    const body = (await response.json().catch(() => ({}))) as { type?: string; error?: string }
    return {
      ok: response.ok,
      status: response.status,
      type: body.type,
      error: response.ok ? undefined : body.error,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'shadow bid failed',
    }
  }
}
