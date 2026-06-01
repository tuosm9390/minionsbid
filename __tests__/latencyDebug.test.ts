// 경매 latency marker 저장 유틸의 병합 동작을 검증한다.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAuctionLatencyMarkers,
  getAuctionLatencySummary,
  recordAuctionLatencyMarker,
} from '@/features/auction/utils/latencyDebug'

describe('latencyDebug', () => {
  beforeEach(() => {
    clearAuctionLatencyMarkers()
  })

  it('marker-merge 같은 eventId의 클릭, 응답, 적용 marker를 하나로 병합한다', () => {
    recordAuctionLatencyMarker({
      eventId: 'bid-merge-1',
      roomId: 'room-1',
      playerId: 'player-1',
      teamId: 'team-1',
      amount: 10,
      source: 'client-click',
      clickedAt: 100,
    })
    recordAuctionLatencyMarker({
      eventId: 'bid-merge-1',
      roomId: 'room-1',
      source: 'client-response',
      respondedAt: 140,
      revision: 5,
    })
    recordAuctionLatencyMarker({
      eventId: 'bid-merge-1',
      roomId: 'room-1',
      source: 'rtdb',
      appliedAt: 220,
      serverCreatedAt: '2026-06-01T00:00:00.000Z',
    })

    expect(window.__auctionLatencyMarkers__).toEqual([
      {
        eventId: 'bid-merge-1',
        roomId: 'room-1',
        playerId: 'player-1',
        teamId: 'team-1',
        amount: 10,
        source: 'rtdb',
        clickedAt: 100,
        respondedAt: 140,
        appliedAt: 220,
        revision: 5,
        serverCreatedAt: '2026-06-01T00:00:00.000Z',
      },
    ])
    expect(getAuctionLatencySummary()).toMatchObject({
      completedSamples: 1,
      p95EndToEndMs: 120,
    })
  })
})
