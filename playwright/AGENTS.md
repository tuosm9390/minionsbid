# AGENTS.md - Playwright E2E

## 범위

`playwright` 아래의 E2E 테스트와 fixture 사용 흐름에 적용된다.

## 핵심 역할

Playwright 경매 테스트는 이 프로젝트의 production validation이다. 특히 `auction-realtime.spec.ts`는 단위 테스트보다 높은 신뢰도의 실시간 계약 검증으로 취급한다.

## 작성 규칙

- 테스트는 사용자 역할별 흐름을 명확히 드러내야 한다: organizer, leader, viewer.
- 방/역할 cookie isolation을 변경할 때 role/team-specific cookie naming 회귀를 반드시 점검한다.
- 경매 fixture는 실제 서버 계약과 다른 가짜 성공 경로를 만들지 않는다.
- selector는 접근 가능한 이름과 안정적인 사용자 인터랙션을 우선한다.
- flaky failure를 timeout 증가만으로 숨기지 말고 이벤트 원인을 확인한다.

## 실행

- 경매 E2E: `npm run test:e2e:auction`
- fixture 기반 단일 실행: `E2E_AUCTION_FIXTURE=1 npx playwright test playwright/auction-realtime.spec.ts`
- CI 흐름은 `npm run build` 후 Chromium project 실행을 기준으로 본다.

## 타이밍 주의점

- `AWARD_GRACE_MS`는 `1500ms` 이하를 유지해야 한다.
- `active-auction-expiring` fixture는 4초 타이머와 5000ms assertion timeout에 민감하다.
- delayed `BID_PLACED`가 클라이언트 timer 0 이후 도착하는 rebound 케이스를 고려한다.
