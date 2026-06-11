// 경매 시스템 부하테스트 - 공통 설정

/**
 * 환경 변수:
 *   BASE_URL          - 테스트 대상 서버 (기본: http://localhost:3000)
 *   CRON_SECRET       - Watchdog 인증 토큰 (기본: dev-secret)
 *   E2E_FIXTURE       - 'true'로 설정 시 fixture 모드 활성화 확인 생략
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
export const CRON_SECRET = __ENV.CRON_SECRET || 'dev-secret'

// 경매 타이밍 상수 (src/features/auction/constants/auctionTimings.ts와 동기화)
export const AUCTION_DURATION_MS = 10_000
export const RE_AUCTION_DURATION_MS = 10_000
export const EXTEND_THRESHOLD_MS = 8_000
export const EXTEND_DURATION_MS = 8_000
export const BID_INCREMENT = 10

// k6 전역 임계값 기준
export const THRESHOLDS = {
  // 95%ile 응답 2초 이하
  http_req_duration: ['p(95)<2000'],
  // 전체 요청 실패율 5% 이하
  http_req_failed: ['rate<0.05'],
}

// HTTP 요청 기본 타임아웃
export const HTTP_TIMEOUT = '10s'

// JSON Content-Type 헤더
export const JSON_HEADERS = {
  'Content-Type': 'application/json',
}

// fixture 생성용 샘플 룸 페이로드 (8팀 구성)
export function buildFixtureRoomPayload(suffix = '') {
  const teamNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']
  return {
    name: `부하테스트 룸${suffix ? ' ' + suffix : ''}`,
    totalTeams: 8,
    basePoint: 100,
    membersPerTeam: 5,
    captains: teamNames.map((teamName, i) => ({
      teamName,
      name: `팀장${i + 1}`,
      position: 'MID',
      description: `${teamName} 팀장`,
      captainPoints: 20,
    })),
    players: Array.from({ length: 16 }, (_, i) => ({
      name: `선수${i + 1}`,
      tier: 'GOLD',
      mainPosition: 'MID',
      subPosition: 'ADC',
      description: `테스트 선수 ${i + 1}`,
    })),
  }
}
