# AGENTS.md - Auction Feature

## 범위

`src/features/auction` 아래의 경매 서버 액션, 실시간 훅, UI 컴포넌트, E2E fixture에 적용된다.

## 핵심 계약

- Firestore `rooms/{roomId}`가 경매의 정본 상태다.
- RTDB는 저지연 이벤트/상태 팬아웃 용도이며 최종 수렴은 Firestore snapshot이 담당한다.
- 클라이언트는 낙관적 UI만 수행하고, 서버 권한이 필요한 변경은 서버 액션을 통해 처리한다.
- 서버만 RTDB 경매 상태를 쓴다는 경계를 유지한다.
- `auction_revision`은 timestamp가 아니라 단조 증가 counter다.
- `AWARD_GRACE_MS`는 `1500ms` 이하를 유지한다.

## 구현 규칙

- 경매 흐름 변경 전 `doc/AUCTION_REALTIME_CONTRACT.md`를 먼저 확인한다.
- 입찰, 낙찰, 타이머, presence, 동기화 로직은 증상 패치보다 상태 전이 원인을 먼저 확인한다.
- `useAuctionRealtime.ts`와 관련 훅은 stale event, delayed RTDB event, Firestore convergence를 함께 고려한다.
- `CenterTimer` 류 타이머 UI는 duration과 progress clamp를 유지한다.
- 파생 상태는 기존 auction helper를 찾아 재사용하고 화면별 중복 계산을 피한다.
- e2e fixture는 실제 운영 계약을 깨지 않는 범위에서만 수정한다.

## 보안 및 권한

- 팀 리더/주최자/뷰어 권한을 서버 측에서 확인한다.
- 클라이언트 role, URL 파라미터, cookie 값만 믿고 리소스 접근을 허용하지 않는다.
- 방 또는 팀 단위 cookie isolation을 바꿀 때는 `doc/COMMON_MISTAKES.md`의 role/team-specific cookie naming 회귀를 확인한다.
- RTDB/Firestore 규칙을 문제 우회 목적으로 완화하지 않는다.

## 테스트

- 경매 핵심 변경은 단위 테스트만으로 완료 처리하지 않는다.
- 우선 관련 Vitest를 실행하고, 최종 생산 검증은 `npm run test:e2e:auction` 또는 `E2E_AUCTION_FIXTURE=1 npx playwright test playwright/auction-realtime.spec.ts`로 확인한다.
- 타이밍 변경은 `playwright/auction-realtime.spec.ts`의 4초 타이머와 5000ms assertion timeout을 염두에 둔다.

## 수정 전 확인 파일

- `doc/AUCTION_REALTIME_CONTRACT.md`
- `doc/ARCHITECTURE.md`
- `doc/COMMON_MISTAKES.md`
- `playwright/auction-realtime.spec.ts`
- `__tests__/auctionActions.test.ts`
- `__tests__/useAuctionRealtime.test.tsx`
