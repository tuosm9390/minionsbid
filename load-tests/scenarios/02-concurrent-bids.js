// 경매 시스템 부하테스트 - 동시 입찰 스파이크 시나리오

/**
 * 시나리오 개요
 * - 경매 시작 직후 10명의 VU가 동시에 입찰을 시도한다.
 * - Firestore 트랜잭션 경합 상황을 재현하여 충돌 처리 로직을 검증한다.
 * - 승자 1명만 성공하고 나머지 9명은 실패 또는 재시도해야 한다.
 * - 재시도 패턴: 최대 3회, 각 50ms 대기 후 재시도.
 *
 * 실행 방법:
 *   E2E_AUCTION_FIXTURE=1 k6 run load-tests/scenarios/02-concurrent-bids.js
 */

import { sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import {
  createFixtureRoom,
  drawNextPlayer,
  closeLottery,
  startAuction,
  placeBid,
  getFixtureState,
} from '../helpers/auction-api.js'
import { THRESHOLDS, BID_INCREMENT, buildFixtureRoomPayload } from '../config.js'

// 커스텀 메트릭
const concurrentBidSuccess = new Counter('concurrent_bid_success')
const concurrentBidFail = new Counter('concurrent_bid_fail')
const retryCount = new Counter('bid_retry_count')
const bidLatency = new Trend('concurrent_bid_latency_ms', true)
// 동시 입찰 충돌률 (실패/전체 시도 비율)
const conflictRate = new Rate('bid_conflict_rate')

export const options = {
  // 짧은 스파이크: 10 VU가 동시에 치고 빠짐
  stages: [
    { duration: '10s', target: 10 },  // 빠르게 10 VU로 증가
    { duration: '2m', target: 10 },   // 10 VU 유지 (스파이크 반복)
    { duration: '10s', target: 0 },   // 종료
  ],
  thresholds: {
    ...THRESHOLDS,
    // 동시 입찰 스파이크에서도 95%ile 3초 이하 허용 (경합 재시도 포함)
    http_req_duration: ['p(95)<3000'],
    // 실패율 허용 범위 완화 (경합 실패는 정상 동작)
    http_req_failed: ['rate<0.60'],
    // 입찰 성공이 1회 이상 발생해야 함
    concurrent_bid_success: ['count>0'],
  },
}

export function setup() {
  const payload = buildFixtureRoomPayload('spike')
  const room = createFixtureRoom(payload)
  if (!room || !room.roomId) {
    throw new Error('fixture 룸 생성 실패 — E2E_AUCTION_FIXTURE=1 환경 변수를 확인하세요.')
  }

  // 추첨 세팅
  drawNextPlayer(room.roomId)
  closeLottery(room.roomId, payload.players[0].name)
  startAuction(room.roomId)

  return {
    roomId: room.roomId,
    teamIds: room.captainLinks.map((c) => c.teamId),
    firstPlayerName: payload.players[0].name,
  }
}

export default function (data) {
  const { roomId, teamIds } = data
  const teamId = teamIds[(__VU - 1) % teamIds.length]

  // 현재 경매 상태 조회
  const state = getFixtureState(roomId)
  if (!state || !state.currentPlayerId) {
    // 경매가 아직 활성화되지 않았거나 완료된 경우
    sleep(0.5)
    return
  }

  const playerId = state.currentPlayerId
  const currentHighest = state.liveBid?.amount ?? 0
  const bidAmount = currentHighest + BID_INCREMENT

  // 동시 입찰: 재시도 최대 3회
  const MAX_RETRIES = 3
  let success = false
  let attempts = 0

  const start = Date.now()

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    attempts++
    const result = placeBid(roomId, playerId, teamId, bidAmount + attempt * BID_INCREMENT)

    if (result && !result.error) {
      success = true
      break
    }

    // 경합 실패 시 짧은 대기 후 재시도
    if (attempt < MAX_RETRIES - 1) {
      retryCount.add(1)
      sleep(0.05) // 50ms 대기
    }
  }

  const elapsed = Date.now() - start
  bidLatency.add(elapsed)

  if (success) {
    concurrentBidSuccess.add(1)
    conflictRate.add(false) // 충돌 없음
  } else {
    concurrentBidFail.add(1)
    conflictRate.add(true) // 충돌 발생
    console.log(`[VU ${__VU}] 팀 ${teamId}: ${attempts}회 시도 후 입찰 실패 (정상적인 경합 결과)`)
  }

  // 다음 입찰 사이클까지 대기 (경매 타이머보다 짧게)
  sleep(Math.random() * 1.5 + 0.5)
}

export function teardown(data) {
  if (!data || !data.roomId) return
  const finalState = getFixtureState(data.roomId)
  if (finalState) {
    console.log(`[teardown] 최종 최고 입찰가: ${finalState.liveBid?.amount ?? 0}P`)
    console.log(`[teardown] 최고 입찰 팀: ${finalState.liveBid?.team_id ?? '없음'}`)
  }
}
