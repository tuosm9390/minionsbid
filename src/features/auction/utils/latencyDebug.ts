export type AuctionLatencySource = 'client-click' | 'client-response' | 'rtdb' | 'room-fallback'

export interface AuctionLatencyMarker {
  eventId: string
  roomId: string
  playerId?: string | null
  teamId?: string | null
  amount?: number | null
  revision?: number | null
  source?: AuctionLatencySource
  clickedAt?: number
  respondedAt?: number
  appliedAt?: number
  serverCreatedAt?: string | null
}

declare global {
  interface Window {
    __auctionLatencyMarkers__?: AuctionLatencyMarker[]
  }
}

function getMarkerStore() {
  if (typeof window === 'undefined') return null
  if (!window.__auctionLatencyMarkers__) {
    window.__auctionLatencyMarkers__ = []
  }
  return window.__auctionLatencyMarkers__
}

export function recordAuctionLatencyMarker(
  marker: AuctionLatencyMarker,
) {
  const store = getMarkerStore()
  if (!store) return

  const index = store.findIndex((entry) => entry.eventId === marker.eventId)
  const next = {
    ...(index >= 0 ? store[index] : {}),
    ...marker,
  }

  if (index >= 0) {
    store[index] = next
  } else {
    store.push(next)
    if (store.length > 100) {
      store.splice(0, store.length - 100)
    }
  }
}

export function clearAuctionLatencyMarkers() {
  const store = getMarkerStore()
  if (!store) return
  store.length = 0
}

export function getAuctionLatencySummary() {
  const store = getMarkerStore() ?? []
  const endToEndSamples = store
    .filter(
      (entry) =>
        typeof entry.clickedAt === 'number' &&
        typeof entry.appliedAt === 'number' &&
        entry.appliedAt >= entry.clickedAt,
    )
    .map((entry) => entry.appliedAt! - entry.clickedAt!)
    .sort((a, b) => a - b)

  if (endToEndSamples.length === 0) {
    return {
      completedSamples: 0,
      p95EndToEndMs: null,
    }
  }

  const p95Index = Math.ceil(endToEndSamples.length * 0.95) - 1
  return {
    completedSamples: endToEndSamples.length,
    p95EndToEndMs: endToEndSamples[p95Index],
  }
}
