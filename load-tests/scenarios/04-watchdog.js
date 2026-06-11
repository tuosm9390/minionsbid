// 경매 시스템 부하테스트 - Watchdog 엔드포인트 부하 시나리오

/**
 * 시나리오 개요
 * - /api/auction-watchdog 엔드포인트를 동시 다발적으로 호출한다.
 * - Watchdog은 Firestore에서 만료된 경매를 복구하므로 DB 쿼리 비용이 발생한다.
 * - 인증 헤더(Bearer CRON_SECRET) 포함 여부에 따른 403/200 응답을 검증한다.
 * - 실제 운영에서는 Vercel Cron이 주기적으로 호출하므로 고빈도 동시 호출을 시뮬레이션한다.
 *
 * 실행 방법:
 *   CRON_SECRET=your-secret k6 run load-tests/scenarios/04-watchdog.js
 *   # 로컬 개발 환경에서는 CRON_SECRET 없이도 동작 (NODE_ENV=development 자동 허용)
 *   k6 run load-tests/scenarios/04-watchdog.js
 */

import { sleep } from 'k6'
import http from 'k6/http'
import { check, group } from 'k6'
import { Trend, Counter, Rate } from 'k6/metrics'
import { callWatchdog } from '../helpers/auction-api.js'
import { THRESHOLDS, CRON_SECRET, BASE_URL, JSON_HEADERS } from '../config.js'

// 커스텀 메트릭
const watchdogLatency = new Trend('watchdog_latency_ms', true)
const watchdogSuccess = new Counter('watchdog_success_count')
const watchdogFail = new Counter('watchdog_fail_count')
const unauthorizedRate = new Rate('watchdog_unauthorized_rate')
const recoveredRooms = new Counter('watchdog_recovered_rooms')

export const options = {
  scenarios: {
    // 시나리오 A: 정상 인증 요청 (고빈도)
    authorized_requests: {
      executor: 'constant-arrival-rate',
      rate: 5,            // 초당 5회 호출
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 5,
      maxVUs: 10,
      exec: 'authorizedWatchdog',
    },
    // 시나리오 B: 인증 없는 요청 (Vercel Cron 외부 접근 시뮬레이션)
    unauthorized_requests: {
      executor: 'constant-arrival-rate',
      rate: 2,            // 초당 2회 호출
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 2,
      maxVUs: 5,
      exec: 'unauthorizedWatchdog',
      startTime: '10s',  // 10초 후 시작
    },
  },
  thresholds: {
    ...THRESHOLDS,
    // Watchdog은 Firestore 쿼리가 있으므로 더 넉넉한 기준 적용
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.10'],
    // Watchdog 자체 응답 시간
    watchdog_latency_ms: ['p(95)<5000', 'p(99)<8000'],
    // 인증 성공한 요청 중 실패 없음
    watchdog_fail_count: ['count<5'],
  },
}

// 인증된 Watchdog 호출
export function authorizedWatchdog() {
  group('인증된 Watchdog 호출', () => {
    const start = Date.now()
    const result = callWatchdog(CRON_SECRET)
    const elapsed = Date.now() - start

    watchdogLatency.add(elapsed)

    if (result && result.ok === true) {
      watchdogSuccess.add(1)
      unauthorizedRate.add(false)
      // 복구된 룸 수 집계
      if (typeof result.recovered === 'number' && result.recovered > 0) {
        recoveredRooms.add(result.recovered)
        console.log(`[Watchdog] ${result.scanned}개 룸 스캔, ${result.recovered}개 복구`)
      }
    } else {
      watchdogFail.add(1)
      console.warn(`[Watchdog] 실패 응답: ${JSON.stringify(result)}`)
    }
  })

  // Vercel Cron은 주기적으로 호출하므로 짧은 대기
  sleep(Math.random() * 0.5 + 0.1)
}

// 인증 없는 Watchdog 호출 — 401 응답 검증
export function unauthorizedWatchdog() {
  group('미인증 Watchdog 호출 (보안 검증)', () => {
    const res = http.get(`${BASE_URL}/api/auction-watchdog`, {
      headers: JSON_HEADERS,
      timeout: '10s',
    })

    const isUnauthorized = check(res, {
      '미인증 요청은 401 반환': (r) => r.status === 401,
    })

    unauthorizedRate.add(!isUnauthorized ? 1 : 0)

    if (res.status !== 401) {
      console.warn(`[Watchdog 보안] 예상치 못한 응답: ${res.status} — 인증 없이 접근 허용됨`)
    }
  })

  sleep(Math.random() * 0.5 + 0.2)
}

// POST 메서드로도 Watchdog 호출 가능 여부 검증 (route.ts에 POST도 구현됨)
export function postWatchdog() {
  group('POST Watchdog 호출', () => {
    const res = http.post(
      `${BASE_URL}/api/auction-watchdog`,
      null,
      {
        headers: {
          ...JSON_HEADERS,
          Authorization: `Bearer ${CRON_SECRET}`,
        },
        timeout: '10s',
      },
    )

    check(res, {
      'POST Watchdog 200 응답': (r) => r.status === 200,
    })
  })
}
