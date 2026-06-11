// 경매 시스템 부하테스트 - 정상 경매 흐름 시나리오

/**
 * 시나리오 개요
 * - 10명의 가상 사용자(VU)가 경매 룸에 접속해 정상적인 입찰 흐름을 검증한다.
 * - E2E fixture API를 사용하므로 실 Firebase/Firestore 없이 동작한다.
 * - 단일 룸을 setup에서 생성한 뒤 모든 VU가 공유하며 순차 입찰을 진행한다.
 *
 * 실행 방법:
 *   E2E_AUCTION_FIXTURE=1 k6 run load-tests/scenarios/01-normal-auction.js
 *   BASE_URL=https://your-preview.vercel.app k6 run load-tests/scenarios/01-normal-auction.js
 */

import { sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'
import {
  createFixtureRoom,
  drawNextPlayer,
  closeLottery,
  startAuction,
  placeBid,
  getFixtureState,
} from '../helpers/auction-api.js'
import { THRESHOLDS, BID_INCREMENT, buildFixtureRoomPayload } from '../config.js'

// 커스텀 메트릭: 입찰 성공/실패 횟수
const bidSuccessCount = new Counter('bid_success_count')
const bidFailCount = new Counter('bid_fail_count')
const auctionRoundDuration = new Trend('auction_round_duration_ms', true)

export const options = {
  // 단계별 부하 증가
  stages: [
    { duration: '30s', target: 5 },   // 5 VU로 워밍업
    { duration: '3m', target: 10 },   // 10 VU 풀 부하
    { duration: '30s', target: 0 },   // 점진적 종료
  ],
  thresholds: {
    ...THRESHOLDS,
    // 입찰 성공 수가 0보다 커야 함 (실제 입찰이 처리됐음을 보장)
    bid_success_count: ['count>0'],
  },
}

// k6 setup: 테스트 전 1회 실행 — fixture 룸 생성
export function setup() {
  const payload = buildFixtureRoomPayload('normal')
  const room = createFixtureRoom(payload)
  if (!room || !room.roomId) {
    throw new Error('fixture 룸 생성 실패 — E2E_AUCTION_FIXTURE=1 환경 변수를 확인하세요.')
  }

  // 추첨 → 경매 시작까지 세팅
  drawNextPlayer(room.roomId)
  closeLottery(room.roomId, payload.players[0].name)
  startAuction(room.roomId)

  return {
    roomId: room.roomId,
    // captainLinks 배열에서 팀 ID만 추출
    teamIds: room.captainLinks.map((c) => c.teamId),
    players: payload.players,
    playerIndex: 0,
  }
}

// 기본 시나리오: 각 VU가 팀 ID를 순환하며 입찰
export default function normalAuctionScenario(data) {
  const { roomId, teamIds, players } = data

  // VU 번호(1-based)로 팀을 배정 (팀 수 초과 시 순환)
  const teamId = teamIds[(__VU - 1) % teamIds.length]

  // 현재 경매 상태 조회
  const state = getFixtureState(roomId)
  if (!state) {
    sleep(1)
    return
  }

  const playerId = state.currentPlayerId ?? `player-${__ITER % players.length}`
  const currentHighest = state.liveBid?.amount ?? 0
  const bidAmount = currentHighest + BID_INCREMENT

  // 입찰 시도
  const roundStart = Date.now()
  const result = placeBid(roomId, playerId, teamId, bidAmount)
  const elapsed = Date.now() - roundStart

  if (result && !result.error) {
    bidSuccessCount.add(1)
  } else {
    // 경합으로 인한 실패는 정상 — 카운트만 기록
    bidFailCount.add(1)
  }

  auctionRoundDuration.add(elapsed)

  // 실제 사용자 행동 모방: 입찰 후 1~3초 대기
  sleep(Math.random() * 2 + 1)
}

// k6 teardown: 테스트 후 상태 최종 확인
export function teardown(data) {
  if (!data || !data.roomId) return
  const finalState = getFixtureState(data.roomId)
  if (finalState) {
    console.log(`[teardown] roomId=${data.roomId} 최종 상태: ${JSON.stringify(finalState).slice(0, 200)}`)
  }
}
