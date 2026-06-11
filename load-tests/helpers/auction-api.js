// 경매 시스템 부하테스트 - E2E Fixture API 헬퍼

import http from 'k6/http'
import { check } from 'k6'
import { BASE_URL, JSON_HEADERS, HTTP_TIMEOUT } from '../config.js'

const DEFAULT_PARAMS = { timeout: HTTP_TIMEOUT }

/**
 * fixture 룸을 생성하고 roomId, 토큰, 팀 정보를 반환한다.
 * @param {object} payload - FixtureCreateRoomPayload
 * @returns {{ ok: boolean, roomId: string, captainLinks: Array, organizerLink: string } | null}
 */
export function createFixtureRoom(payload) {
  const res = http.post(
    `${BASE_URL}/api/e2e/auction-fixture/create`,
    JSON.stringify(payload),
    { headers: JSON_HEADERS, ...DEFAULT_PARAMS },
  )

  const passed = check(res, {
    'fixture 룸 생성 성공 (200)': (r) => r.status === 200,
    'roomId 포함': (r) => {
      try {
        return !!JSON.parse(r.body).roomId
      } catch {
        return false
      }
    },
  })

  if (!passed) return null

  try {
    return JSON.parse(res.body)
  } catch {
    return null
  }
}

/**
 * fixture 룸 상태를 조회한다.
 * @param {string} roomId
 * @returns {object | null}
 */
export function getFixtureState(roomId) {
  const res = http.get(
    `${BASE_URL}/api/e2e/auction-fixture/state?roomId=${encodeURIComponent(roomId)}`,
    { headers: JSON_HEADERS, ...DEFAULT_PARAMS },
  )

  check(res, {
    'fixture 상태 조회 성공 (200)': (r) => r.status === 200,
  })

  try {
    return JSON.parse(res.body)
  } catch {
    return null
  }
}

/**
 * fixture 룸을 지정된 stage로 초기화한다.
 * @param {string} stage - 'waiting' | 'active-auction' | 'active-auction-expiring' | ...
 * @returns {object | null}
 */
export function resetFixture(stage = 'waiting') {
  const res = http.post(
    `${BASE_URL}/api/e2e/auction-fixture/reset`,
    JSON.stringify({ stage }),
    { headers: JSON_HEADERS, ...DEFAULT_PARAMS },
  )

  check(res, {
    'fixture 초기화 성공 (200)': (r) => r.status === 200,
  })

  try {
    return JSON.parse(res.body)
  } catch {
    return null
  }
}

/**
 * fixture 커맨드를 전송한다.
 * @param {string} roomId
 * @param {object} command - { action, ...params }
 * @returns {{ ok?: boolean, error?: string } | null}
 */
export function sendFixtureCommand(roomId, command) {
  const res = http.post(
    `${BASE_URL}/api/e2e/auction-fixture/command`,
    JSON.stringify({ roomId, ...command }),
    { headers: JSON_HEADERS, ...DEFAULT_PARAMS },
  )

  check(res, {
    [`fixture 커맨드 ${command.action} 응답 수신`]: (r) =>
      r.status === 200 || r.status === 400,
  })

  try {
    return JSON.parse(res.body)
  } catch {
    return null
  }
}

/**
 * 추첨 다음 선수를 뽑는다.
 * @param {string} roomId
 */
export function drawNextPlayer(roomId) {
  return sendFixtureCommand(roomId, { action: 'draw' })
}

/**
 * 추첨을 마감하고 경매 대상 선수를 확정한다.
 * @param {string} roomId
 * @param {string} playerName
 */
export function closeLottery(roomId, playerName) {
  return sendFixtureCommand(roomId, { action: 'closeLottery', playerName })
}

/**
 * 경매를 시작한다.
 * @param {string} roomId
 * @param {number} [durationMs=10000]
 */
export function startAuction(roomId, durationMs = 10_000) {
  return sendFixtureCommand(roomId, { action: 'startAuction', durationMs })
}

/**
 * 입찰을 시도한다. 성공하면 ok:true, 경합 패배 시 error 포함.
 * @param {string} roomId
 * @param {string} playerId
 * @param {string} teamId
 * @param {number} amount
 * @param {boolean} [resetTimer=false]
 */
export function placeBid(roomId, playerId, teamId, amount, resetTimer = false) {
  return sendFixtureCommand(roomId, {
    action: 'placeBid',
    playerId,
    teamId,
    amount,
    resetTimer,
  })
}

/**
 * Watchdog API를 호출한다.
 * @param {string} cronSecret
 * @returns {object | null}
 */
export function callWatchdog(cronSecret) {
  const res = http.get(
    `${BASE_URL}/api/auction-watchdog`,
    {
      headers: {
        ...JSON_HEADERS,
        Authorization: `Bearer ${cronSecret}`,
      },
      ...DEFAULT_PARAMS,
    },
  )

  check(res, {
    'watchdog 응답 200': (r) => r.status === 200,
    'watchdog ok:true': (r) => {
      try {
        return JSON.parse(r.body).ok === true
      } catch {
        return false
      }
    },
  })

  try {
    return JSON.parse(res.body)
  } catch {
    return null
  }
}

/**
 * Firebase 토큰 발급 API를 호출한다.
 * @param {string} roomId
 * @param {string} role - 'ORGANIZER' | 'LEADER' | 'VIEWER'
 * @param {string} token - 인증 토큰
 * @param {string} [teamId]
 */
export function getFirebaseToken(roomId, role, token, teamId = null) {
  const body = { roomId, role, token }
  if (teamId) body.teamId = teamId

  const res = http.post(
    `${BASE_URL}/api/room-auth/firebase-token`,
    JSON.stringify(body),
    { headers: JSON_HEADERS, ...DEFAULT_PARAMS },
  )

  check(res, {
    'Firebase 토큰 발급 응답': (r) => r.status === 200 || r.status === 403,
  })

  try {
    return JSON.parse(res.body)
  } catch {
    return null
  }
}
