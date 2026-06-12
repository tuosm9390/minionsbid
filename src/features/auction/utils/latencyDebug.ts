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
  /** drain으로 운영 리포트에 이미 포함된 샘플 여부 */
  reported?: boolean
}

/** placeBidDirect 실패 → placeBid 서버 액션 폴백 발동 기록 */
export interface BidFallbackRecord {
  roomId: string
  reason: string
  roundTripMs: number | null
  occurredAt: number
}

/** 운영 수집용 latency 리포트 — /api/latency-report로 전송되는 단위 */
export interface AuctionLatencyReport {
  roomId: string
  sampleCount: number
  p50EndToEndMs: number | null
  p95EndToEndMs: number | null
  maxEndToEndMs: number | null
  sourceCounts: Partial<Record<AuctionLatencySource, number>>
  fallbackCount: number
  fallbackReasons: string[]
}

declare global {
  interface Window {
    __auctionLatencyMarkers__?: AuctionLatencyMarker[]
    __auctionBidFallbacks__?: BidFallbackRecord[]
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

function getFallbackStore() {
  if (typeof window === 'undefined') return null
  if (!window.__auctionBidFallbacks__) {
    window.__auctionBidFallbacks__ = []
  }
  return window.__auctionBidFallbacks__
}

export function recordBidFallback(record: {
  roomId: string
  reason: string
  roundTripMs?: number | null
}) {
  const store = getFallbackStore()
  if (!store) return
  store.push({
    roomId: record.roomId,
    reason: record.reason,
    roundTripMs: record.roundTripMs ?? null,
    occurredAt: Date.now(),
  })
  if (store.length > 100) {
    store.splice(0, store.length - 100)
  }
}

export function clearAuctionLatencyMarkers() {
  const store = getMarkerStore()
  if (!store) return
  store.length = 0
  const fallbacks = getFallbackStore()
  if (fallbacks) fallbacks.length = 0
}

function percentile(sortedSamples: number[], ratio: number) {
  if (sortedSamples.length === 0) return null
  const index = Math.ceil(sortedSamples.length * ratio) - 1
  return sortedSamples[Math.max(0, index)]
}

/**
 * 미보고 완료 샘플(클릭~적용 측정 완료)과 폴백 기록을 집계해 리포트로 반환.
 * 집계된 샘플은 reported 처리, 폴백 기록은 제거되어 다음 drain에 중복 포함되지 않는다.
 * 보고할 내용이 없으면 null.
 */
export function drainAuctionLatencyReport(roomId: string): AuctionLatencyReport | null {
  const markerStore = getMarkerStore()
  const fallbackStore = getFallbackStore()
  if (!markerStore || !fallbackStore) return null

  const completed = markerStore.filter(
    (entry) =>
      entry.roomId === roomId &&
      !entry.reported &&
      typeof entry.clickedAt === 'number' &&
      typeof entry.appliedAt === 'number' &&
      entry.appliedAt >= entry.clickedAt,
  )
  const fallbackIndexes: number[] = []
  const fallbacks: BidFallbackRecord[] = []
  fallbackStore.forEach((entry, index) => {
    if (entry.roomId === roomId) {
      fallbackIndexes.push(index)
      fallbacks.push(entry)
    }
  })

  if (completed.length === 0 && fallbacks.length === 0) return null

  const samples = completed
    .map((entry) => entry.appliedAt! - entry.clickedAt!)
    .sort((a, b) => a - b)
  const sourceCounts: Partial<Record<AuctionLatencySource, number>> = {}
  for (const entry of completed) {
    if (!entry.source) continue
    sourceCounts[entry.source] = (sourceCounts[entry.source] ?? 0) + 1
  }

  for (const entry of completed) {
    entry.reported = true
  }
  for (let i = fallbackIndexes.length - 1; i >= 0; i--) {
    fallbackStore.splice(fallbackIndexes[i], 1)
  }

  return {
    roomId,
    sampleCount: samples.length,
    p50EndToEndMs: percentile(samples, 0.5),
    p95EndToEndMs: percentile(samples, 0.95),
    maxEndToEndMs: samples.length > 0 ? samples[samples.length - 1] : null,
    sourceCounts,
    fallbackCount: fallbacks.length,
    fallbackReasons: fallbacks.map((entry) => entry.reason),
  }
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
