'use client'

// SOCKET_SHADOW 모드에서 기존 Firebase 입찰 결과를 shadow 경로로 미러링한다.
import { io, type Socket } from 'socket.io-client'
import type { AuctionTransport } from '@/features/auction/utils/auctionTransport'
import type { SocketAuctionCommandResult } from '@/features/auction/socket/socketContracts'

export type ShadowBidMirrorArgs = {
  auctionTransport: AuctionTransport
  roomId: string
  playerId: string
  teamId: string
  amount: number
  requestId: string
  role?: 'ORGANIZER' | 'LEADER' | 'VIEWER'
  authToken?: string
}

export type ShadowBidMirrorResult = {
  ok: boolean
  skipped?: boolean
  error?: string
  status?: number
  type?: string
  mismatch?: boolean
  roundTripMs?: number
}

export type SocketShadowBidObservation = {
  roomId: string
  requestId: string
  ok: boolean
  type?: string
  status?: number
  error?: string
  mismatch?: boolean
  roundTripMs: number
}

type ShadowWindow = typeof window & {
  __SOCKET_SHADOW_URL__?: string
  __socketShadowSockets__?: Map<string, Socket>
  __socketShadowBidResults__?: SocketShadowBidObservation[]
}

function getShadowWindow(): ShadowWindow | null {
  if (typeof window === 'undefined') return null
  return window as ShadowWindow
}

function getSocketShadowUrl() {
  const shadowWindow = getShadowWindow()
  return shadowWindow?.__SOCKET_SHADOW_URL__ ?? process.env.NEXT_PUBLIC_SOCKET_SHADOW_URL ?? ''
}

function getShadowSocket(url: string, args: ShadowBidMirrorArgs) {
  const shadowWindow = getShadowWindow()
  if (!shadowWindow) return null
  const role = args.role ?? 'LEADER'
  const cacheKey = [url, args.roomId, role, args.teamId, args.authToken ?? ''].join('|')
  const sockets = shadowWindow.__socketShadowSockets__ ?? new Map<string, Socket>()
  shadowWindow.__socketShadowSockets__ = sockets
  const cached = sockets.get(cacheKey)
  if (cached) return cached
  const socket = io(url, {
    auth: {
      roomId: args.roomId,
      role,
      teamId: args.teamId,
      authToken: args.authToken,
    },
    transports: ['websocket'],
    reconnection: true,
  })
  sockets.set(cacheKey, socket)
  return socket
}

function hasAcceptedMismatch(args: ShadowBidMirrorArgs, result: SocketAuctionCommandResult) {
  if (result.type !== 'bid:accepted') return true
  const currentBid = result.state.currentBid
  return (
    currentBid?.playerId !== args.playerId ||
    currentBid.teamId !== args.teamId ||
    currentBid.amount !== args.amount
  )
}

function recordSocketShadowBidResult(observation: SocketShadowBidObservation) {
  const shadowWindow = getShadowWindow()
  if (!shadowWindow) return
  const results = shadowWindow.__socketShadowBidResults__ ?? []
  results.push(observation)
  shadowWindow.__socketShadowBidResults__ = results.slice(-50)
}

async function mirrorShadowBidViaSocket(
  url: string,
  args: ShadowBidMirrorArgs,
): Promise<ShadowBidMirrorResult> {
  const startedAt = Date.now()
  const socket = getShadowSocket(url, args)
  if (!socket) {
    return { ok: false, error: 'socket shadow client is unavailable' }
  }
  const result = (await socket.timeout(2000).emitWithAck('bid:shadowSubmit', {
    roomId: args.roomId,
    requestId: args.requestId,
    playerId: args.playerId,
    teamId: args.teamId,
    amount: args.amount,
    sentAt: startedAt,
  })) as SocketAuctionCommandResult | { ok: false; error?: string }
  const roundTripMs = Date.now() - startedAt
  const ok = 'type' in result && result.type === 'bid:accepted'
  const mismatch = 'type' in result ? hasAcceptedMismatch(args, result) : true
  const type = 'type' in result ? result.type : undefined
  const error =
    'error' in result && typeof result.error === 'string'
      ? result.error
      : 'reason' in result && typeof result.reason === 'string'
        ? result.reason
        : undefined
  recordSocketShadowBidResult({
    roomId: args.roomId,
    requestId: args.requestId,
    ok,
    type,
    error,
    mismatch,
    roundTripMs,
  })
  return { ok, type, error, mismatch, roundTripMs }
}

async function mirrorShadowBidViaHttp(
  args: ShadowBidMirrorArgs,
): Promise<ShadowBidMirrorResult> {
  const startedAt = Date.now()
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
  const result = {
    ok: response.ok,
    status: response.status,
    type: body.type,
    error: response.ok ? undefined : body.error,
    roundTripMs: Date.now() - startedAt,
  }
  recordSocketShadowBidResult({
    roomId: args.roomId,
    requestId: args.requestId,
    ok: result.ok,
    status: result.status,
    type: result.type,
    error: result.error,
    mismatch: result.type !== 'bid:accepted',
    roundTripMs: result.roundTripMs,
  })
  return result
}

export async function mirrorShadowBid(
  args: ShadowBidMirrorArgs,
): Promise<ShadowBidMirrorResult> {
  if (args.auctionTransport !== 'SOCKET_SHADOW') {
    return { ok: true, skipped: true }
  }

  try {
    const socketUrl = getSocketShadowUrl()
    if (socketUrl) return await mirrorShadowBidViaSocket(socketUrl, args)
    return await mirrorShadowBidViaHttp(args)
  } catch (error) {
    const result = {
      ok: false,
      error: error instanceof Error ? error.message : 'shadow bid failed',
    }
    recordSocketShadowBidResult({
      roomId: args.roomId,
      requestId: args.requestId,
      ok: false,
      error: result.error,
      mismatch: true,
      roundTripMs: 0,
    })
    return result
  }
}
