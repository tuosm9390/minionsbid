# AGENTS.md - Unit Tests

## 범위

`__tests__` 아래의 Vitest 테스트에 적용된다.

## 테스트 원칙

- 실패 테스트를 삭제하거나 약화해서 통과시키지 않는다.
- 구현 세부보다 사용자 관찰 가능 동작과 서버 계약을 검증한다.
- Firebase, cookie, timer, realtime 동작은 기존 mock/factory 패턴을 먼저 찾아 맞춘다.
- 새 테스트가 필요한 경우 가까운 기존 테스트 파일의 구조와 naming을 따른다.

## 경매 테스트 주의점

- `useAuctionRealtime` 관련 테스트는 RTDB delayed event와 Firestore convergence를 고려한다.
- `auction_revision`을 timestamp처럼 다루지 않는다.
- 타이머 테스트는 clamp, grace window, award transition을 함께 확인한다.

## 실행

- 전체 단위 테스트: `npm run test`
- 특정 파일: `npx vitest run __tests__/<file>`
- watch가 아니라 단발 실행을 기본으로 한다.

## 금지

- 테스트 통과만을 위해 production code에 test-only branch를 추가하지 않는다.
- 타입 오류를 `any` 또는 suppress comment로 피하지 않는다.
- 비동기 테스트에서 임의 sleep을 늘려 flaky failure를 숨기지 않는다.
