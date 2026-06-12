// latencyDebug의 운영 리포트 drain·폴백 기록 동작을 검증한다.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordAuctionLatencyMarker,
  recordBidFallback,
  drainAuctionLatencyReport,
  clearAuctionLatencyMarkers,
} from '../latencyDebug'

beforeEach(() => {
  clearAuctionLatencyMarkers()
})

describe('drainAuctionLatencyReport', () => {
  it('보고할 샘플이 없으면 null을 반환한다', () => {
    expect(drainAuctionLatencyReport('room-1')).toBeNull()
  })

  it('완료된 샘플의 p50/p95/소스 카운트를 집계한다', () => {
    const base = 1_000
    const latencies = [100, 200, 300, 400]
    latencies.forEach((latency, i) => {
      recordAuctionLatencyMarker({
        eventId: `evt-${i}`,
        roomId: 'room-1',
        source: 'rtdb',
        clickedAt: base,
        appliedAt: base + latency,
      })
    })

    const report = drainAuctionLatencyReport('room-1')
    expect(report).not.toBeNull()
    expect(report!.sampleCount).toBe(4)
    expect(report!.p50EndToEndMs).toBe(200)
    expect(report!.p95EndToEndMs).toBe(400)
    expect(report!.maxEndToEndMs).toBe(400)
    expect(report!.sourceCounts.rtdb).toBe(4)
    expect(report!.fallbackCount).toBe(0)
  })

  it('drain된 샘플은 다음 drain에 다시 포함되지 않는다', () => {
    recordAuctionLatencyMarker({
      eventId: 'evt-1',
      roomId: 'room-1',
      source: 'rtdb',
      clickedAt: 1_000,
      appliedAt: 1_150,
    })

    expect(drainAuctionLatencyReport('room-1')!.sampleCount).toBe(1)
    expect(drainAuctionLatencyReport('room-1')).toBeNull()
  })

  it('미완료 샘플은 제외되고, 이후 완료되면 다음 drain에 포함된다', () => {
    recordAuctionLatencyMarker({
      eventId: 'evt-pending',
      roomId: 'room-1',
      source: 'client-response',
      clickedAt: 1_000,
      respondedAt: 1_050,
    })

    expect(drainAuctionLatencyReport('room-1')).toBeNull()

    // RTDB 이벤트 도착으로 appliedAt이 채워지면 완료 샘플이 된다
    recordAuctionLatencyMarker({
      eventId: 'evt-pending',
      roomId: 'room-1',
      source: 'rtdb',
      appliedAt: 1_200,
    })

    const report = drainAuctionLatencyReport('room-1')
    expect(report!.sampleCount).toBe(1)
    expect(report!.p95EndToEndMs).toBe(200)
  })

  it('다른 방의 샘플은 집계에 포함되지 않는다', () => {
    recordAuctionLatencyMarker({
      eventId: 'evt-other',
      roomId: 'room-2',
      source: 'rtdb',
      clickedAt: 1_000,
      appliedAt: 1_100,
    })

    expect(drainAuctionLatencyReport('room-1')).toBeNull()
    expect(drainAuctionLatencyReport('room-2')!.sampleCount).toBe(1)
  })

  it('폴백 기록을 집계하고 drain 후 제거한다', () => {
    recordBidFallback({ roomId: 'room-1', reason: 'permission-denied', roundTripMs: 320 })
    recordBidFallback({ roomId: 'room-1', reason: 'timeout' })

    const report = drainAuctionLatencyReport('room-1')
    expect(report!.sampleCount).toBe(0)
    expect(report!.fallbackCount).toBe(2)
    expect(report!.fallbackReasons).toEqual(['permission-denied', 'timeout'])

    expect(drainAuctionLatencyReport('room-1')).toBeNull()
  })

  it('clearAuctionLatencyMarkers는 폴백 기록도 함께 비운다', () => {
    recordBidFallback({ roomId: 'room-1', reason: 'timeout' })
    clearAuctionLatencyMarkers()
    expect(drainAuctionLatencyReport('room-1')).toBeNull()
  })
})
