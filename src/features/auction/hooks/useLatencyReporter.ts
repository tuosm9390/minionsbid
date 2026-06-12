'use client'

// 경매 latency 측정치를 주기적으로 /api/latency-report에 전송하는 운영 관측 훅
import { useEffect } from 'react'
import { drainAuctionLatencyReport } from '@/features/auction/utils/latencyDebug'

const REPORT_INTERVAL_MS = 30_000
const E2E_AUCTION_FIXTURE = process.env.NEXT_PUBLIC_E2E_AUCTION_FIXTURE === '1'

/**
 * 30초 주기로 미보고 latency 샘플·폴백 기록을 집계해 전송한다.
 * 페이지 이탈(pagehide) 시에는 sendBeacon으로 남은 샘플을 flush한다.
 * 보고할 샘플이 없으면 요청 자체를 보내지 않는다.
 */
export function useLatencyReporter(roomId: string) {
  useEffect(() => {
    if (!roomId || E2E_AUCTION_FIXTURE) return

    const flush = (useBeacon: boolean) => {
      const report = drainAuctionLatencyReport(roomId)
      if (!report) return
      const body = JSON.stringify(report)
      if (useBeacon && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(
          '/api/latency-report',
          new Blob([body], { type: 'application/json' }),
        )
        return
      }
      void fetch('/api/latency-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // 관측 실패는 경매 UX에 영향 주지 않음 — 다음 주기에 재시도되지 않고 해당 배치는 유실됨
      })
    }

    const intervalId = window.setInterval(() => flush(false), REPORT_INTERVAL_MS)
    const handlePageHide = () => flush(true)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('pagehide', handlePageHide)
      flush(true)
    }
  }, [roomId])
}
