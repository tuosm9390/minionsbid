// 경매 시스템 부하테스트 - 채팅 + 입찰 혼합 부하 시나리오

/**
 * 시나리오 개요
 * - 전체 VU의 70%는 입찰을 시도하고, 30%는 채팅 메시지를 연속 전송한다.
 * - 혼합 부하 하에서 각 엔드포인트의 응답 시간 격리 여부를 측정한다.
 * - 채팅은 Server Action이 아닌 fixture 상태 조회를 통해 간접 검증한다.
 *   (Server Action은 k6에서 직접 호출 불가 — Next.js 내부 action ID 필요)
 * - 대신 fixture command API의 sendChatMessage 유사 경로를 상태 조회로 대체한다.
 *
 * 실행 방법:
 *   E2E_AUCTION_FIXTURE=1 k6 run load-tests/scenarios/03-mixed-load.js
 */

import { sleep } from 'k6'
import http from 'k6/http'
import { check, group } from 'k6'
import { Counter, Trend, Rate } from 'k6/metrics'
import {
  createFixtureRoom,
  drawNextPlayer,
  closeLottery,
  startAuction,
  placeBid,
  getFixtureState,
} from '../helpers/auction-api.js'
import { THRESHOLDS, BID_INCREMENT, BASE_URL, JSON_HEADERS, buildFixtureRoomPayload } from '../config.js'

// 커스텀 메트릭
const bidOpsCount = new Counter('mixed_bid_ops')
const stateOpsCount = new Counter('mixed_state_ops')
const roomPageLoadTime = new Trend('room_page_load_ms', true)
const bidUnderMixedLoad = new Trend('bid_under_mixed_load_ms', true)
const stateUnderMixedLoad = new Trend('state_under_mixed_load_ms', true)
const bidSuccessRate = new Rate('mixed_bid_success_rate')

// VU 역할 분배: VU 번호 기준으로 70% 입찰 / 30% 상태 조회(채팅 대리)
function getVuRole(vuId, totalVus) {
  // totalVus를 알 수 없으므로 VU ID의 나머지로 분기
  return vuId % 10 < 7 ? 'bidder' : 'observer'
}

export const options = {
  stages: [
    { duration: '30s', target: 8 },   // 워밍업
    { duration: '3m', target: 15 },   // 혼합 부하 최대
    { duration: '30s', target: 0 },   // 쿨다운
  ],
  thresholds: {
    ...THRESHOLDS,
    // 입찰 응답은 2초 이내
    bid_under_mixed_load_ms: ['p(95)<2000'],
    // 상태 조회 응답은 1초 이내
    state_under_mixed_load_ms: ['p(95)<1000'],
    // 룸 페이지 로드는 3초 이내
    room_page_load_ms: ['p(95)<3000'],
  },
}

export function setup() {
  const payload = buildFixtureRoomPayload('mixed')
  const room = createFixtureRoom(payload)
  if (!room || !room.roomId) {
    throw new Error('fixture 룸 생성 실패 — E2E_AUCTION_FIXTURE=1 환경 변수를 확인하세요.')
  }

  drawNextPlayer(room.roomId)
  closeLottery(room.roomId, payload.players[0].name)
  startAuction(room.roomId)

  return {
    roomId: room.roomId,
    teamIds: room.captainLinks.map((c) => c.teamId),
    players: payload.players,
  }
}

export default function (data) {
  const { roomId, teamIds, players } = data
  const role = getVuRole(__VU, 15)
  const teamId = teamIds[(__VU - 1) % teamIds.length]

  if (role === 'bidder') {
    // --- 입찰 역할 ---
    group('입찰 흐름', () => {
      const state = getFixtureState(roomId)
      if (!state || !state.currentPlayerId) {
        sleep(1)
        return
      }

      const playerId = state.currentPlayerId
      const currentHighest = state.liveBid?.amount ?? 0
      const bidAmount = currentHighest + BID_INCREMENT

      const start = Date.now()
      const result = placeBid(roomId, playerId, teamId, bidAmount)
      const elapsed = Date.now() - start

      bidUnderMixedLoad.add(elapsed)
      bidOpsCount.add(1)
      bidSuccessRate.add(result && !result.error ? 1 : 0)
    })

    sleep(Math.random() * 2 + 1)
  } else {
    // --- 관찰자 역할 (채팅 부하 대리 측정) ---
    // 실제 채팅은 Server Action이라 k6에서 직접 호출 불가.
    // 대신 룸 상태 폴링(실시간 관찰자 행동)과 룸 페이지 HTTP 로드로 혼합 부하를 생성한다.
    group('관찰자 폴링', () => {
      // 1) fixture 상태 조회 (실시간 상태 구독 대리)
      const stateStart = Date.now()
      getFixtureState(roomId)
      stateUnderMixedLoad.add(Date.now() - stateStart)
      stateOpsCount.add(1)

      sleep(0.2)

      // 2) 룸 페이지 HTTP 요청 (초기 HTML 로드 측정)
      const pageStart = Date.now()
      const pageRes = http.get(`${BASE_URL}/room/${roomId}`, {
        headers: { Accept: 'text/html' },
        timeout: '10s',
      })
      roomPageLoadTime.add(Date.now() - pageStart)

      check(pageRes, {
        '룸 페이지 200 또는 307 응답': (r) => r.status === 200 || r.status === 307 || r.status === 308,
      })
    })

    sleep(Math.random() * 1.5 + 0.5)
  }
}

export function teardown(data) {
  if (!data || !data.roomId) return
  const finalState = getFixtureState(data.roomId)
  if (finalState) {
    console.log(`[teardown] 혼합 부하 테스트 완료. 최고 입찰가: ${finalState.highestBid ?? 0}P`)
  }
}
