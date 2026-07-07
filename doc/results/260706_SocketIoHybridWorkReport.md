# Socket.IO Hybrid 작업 보고서

작성일: 2026-07-06.
현재화: 2026-07-07.

## 2026-07-07 현재화 메모

이 문서는 최초 1단계 작업 보고서였으나, 이후 Socket.IO 관련 구현이 더 진행됐다. 현재는 `SOCKET_SHADOW` mirror, 실제 Socket.IO attach 경계와 smoke script, `SOCKET_CANARY` primary bid client, Socket accepted bid Firestore persistence, persistence-before-broadcast 보강, 공개 입찰 5초 타이머 정책이 추가된 상태다.

따라서 이 문서의 “실제 운영 Socket.IO 서버, Redis, 클라이언트 Socket adapter는 이번 범위에 포함하지 않았다”는 문장은 최초 작성 시점 설명으로만 유효하다. 현재 코드에는 재사용 가능한 Socket.IO server attach 함수와 client adapter가 있으며, 다만 별도 상시 운영 Socket 서버 배포와 Redis durable state는 아직 도입하지 않았다.

현재 판단은 Socket.IO 작업을 되돌리는 것이 아니다. 사용자가 실제 테스트에서 Firebase 단독보다 더 매끄러운 동작을 확인했으므로, 기본값은 Firebase로 유지하되 10~16명 규모 단일 서버 공개 입찰 개선 수단으로 Socket.IO shadow/canary를 제한적으로 운용하는 방향이 타당하다.

## 1. 작업 목적

이번 작업의 목적은 기존 Firebase 기반 경매 시스템을 전면 교체하지 않고, 향후 `Firebase + Socket.IO` hybrid 구조로 전환할 수 있는 1단계 기반을 만드는 것이다.

현재 서비스는 Firestore를 정본 상태로 사용하고 RTDB를 저지연 fanout 보조 경로로 사용한다. 이 구조를 유지하면서, 공개 입찰 hot path만 서버 권위 모델로 분리할 수 있는지 검증하는 것이 핵심이었다.

## 2. 작업 결론

1단계 hybrid 기반 작업은 완료됐다.

완료된 범위는 다음과 같다.

- `auction_transport` feature flag 추가.
- Socket hybrid shared contract 추가.
- 공개 입찰 authoritative auction engine 추가.
- fixture 전용 Socket hybrid HTTP command route 추가.
- unit, route, realtime store 회귀 테스트 추가.
- production fixture server 기반 네트워크 smoke 테스트 수행.
- 120개, 500개 동시 요청 부하 테스트 수행.
- 전체 lint, typecheck, test, build 검증 수행.

이 최초 작업 범위에는 실제 운영 Socket.IO 서버, Redis, 클라이언트 Socket adapter가 포함되지 않았다. 이후 작업에서 Socket.IO attach 경계, shadow client adapter, canary primary bid client, Firestore persistence가 추가됐다. 별도 상시 운영 Socket 서버 배포와 Redis는 현재 규모의 기본 범위에서 제외한다.

## 3. 구현 산출물

### 3.1 Transport Flag

Firestore room snapshot의 `auction_transport` 값을 클라이언트 store에 반영하도록 구현했다.

지원 모드는 다음 네 가지다.

- `FIREBASE`.
- `SOCKET_SHADOW`.
- `SOCKET_CANARY`.
- `SOCKET`.

알 수 없는 값은 `FIREBASE`로 fallback된다.

주요 파일이다.

- `src/features/auction/utils/auctionTransport.ts`.
- `src/features/auction/store/useAuctionStore.ts`.
- `src/features/auction/hooks/useAuctionRealtime.ts`.
- `__tests__/auctionTransport.test.ts`.
- `__tests__/useAuctionRealtime.test.tsx`.

### 3.2 Shared Contract

Socket hybrid engine과 향후 클라이언트 adapter가 공유할 타입 계약을 추가했다.

주요 계약은 다음과 같다.

- `SocketAuctionState`.
- `SocketAuctionTeamState`.
- `SocketAuctionBidState`.
- `BidSubmitCommand`.
- `SocketAuctionAcceptedEvent`.
- `SocketAuctionRejectedEvent`.
- `SocketAuctionSyncEvent`.

주요 파일이다.

- `src/features/auction/socket/socketContracts.ts`.

### 3.3 Authoritative Auction Engine

공개 입찰을 서버 권위 모델로 처리하는 engine을 추가했다.

검증하는 조건은 다음과 같다.

- room id 일치.
- 현재 경매 선수 일치.
- 타이머 진행 중 여부.
- 팀 존재 여부.
- 로스터 슬롯 여유.
- 현재 최고 입찰 팀의 추가 입찰 차단.
- 양의 정수 금액.
- 10P 단위 금액.
- 최소 입찰액.
- 보유 포인트.
- request id 멱등성.

상태 변경은 다음 방식으로 처리한다.

- 입찰 성공 시 `sequence`를 1 증가시킨다.
- `currentBid`를 최신 입찰로 교체한다.
- 새 최고 입찰 팀의 포인트를 예약 차감한다.
- 이전 최고 입찰 팀의 예약 포인트를 복구한다.
- 종료 임박 시 현재 공개 입찰 5초 연장 정책을 적용한다.

주요 파일이다.

- `src/features/auction/socket/socketAuctionEngine.ts`.
- `__tests__/socketAuctionEngine.test.ts`.

### 3.4 Fixture HTTP Command Route

`E2E_AUCTION_FIXTURE=1` 환경에서만 동작하는 HTTP route를 추가했다.

지원 action은 다음과 같다.

- `sync`.
- `bid`.

이 route는 운영 API가 아니라 fixture canary와 수동 QA 전용이다. 실제 Socket.IO 서버가 붙기 전에도 HTTP surface로 engine 계약을 검증할 수 있게 만들었다.

주요 파일이다.

- `src/app/api/e2e/socket-hybrid/command/route.ts`.
- `__tests__/socketHybridRoute.test.ts`.

## 4. 테스트와 검증

### 4.1 테스트 우선 구현

다음 테스트를 먼저 작성하고 실패를 확인한 뒤 구현을 진행했다.

- `__tests__/auctionTransport.test.ts`.
- `__tests__/socketAuctionEngine.test.ts`.
- `__tests__/socketHybridRoute.test.ts`.
- `__tests__/useAuctionRealtime.test.tsx` 내 `auction_transport` 회귀 테스트.

주요 RED evidence다.

- `.omo/ulw-loop/evidence/socket-hybrid-red-tests.txt`.
- `.omo/ulw-loop/evidence/socket-hybrid-red-tests-with-route.txt`.
- `.omo/ulw-loop/evidence/socket-hybrid-transport-red.txt`.
- `.omo/ulw-loop/evidence/socket-hybrid-route-reload-red.txt`.
- `.omo/ulw-loop/evidence/socket-engine-amount-red.txt`.

주요 GREEN evidence다.

- `.omo/ulw-loop/evidence/socket-hybrid-green-tests-final.txt`.
- `.omo/ulw-loop/evidence/socket-hybrid-transport-green.txt`.
- `.omo/ulw-loop/evidence/socket-hybrid-route-reload-green.txt`.
- `.omo/ulw-loop/evidence/socket-engine-amount-green.txt`.
- `.omo/ulw-loop/evidence/socket-hybrid-targeted-final-current.txt`.

### 4.2 네트워크 테스트

Production build 후 `next start`로 fixture server를 실행하고 HTTP 요청을 직접 보냈다.

검증 항목은 다음과 같다.

- fixture reset 200.
- socket hybrid sync 200.
- 정상 bid accepted 200.
- 같은 request id replay body 완전 동일.
- malformed payload 400.
- unsupported action 400.
- 10P 단위 위반 400.
- 서버 cleanup 후 포트 listener count 0.

Evidence 파일이다.

- `.omo/ulw-loop/evidence/network-smoke-http.txt`.
- `.omo/ulw-loop/evidence/network-bind-host-smoke.txt`.

### 4.3 부하 테스트

같은 production fixture server에 동시 HTTP 요청을 넣었다.

120개 동시 요청 결과다.

| 항목 | 결과 |
| --- | --- |
| 총 요청 | 120 |
| accepted | 100 |
| rejected | 20 |
| 네트워크 오류 | 0 |
| 5xx | 0 |
| sequence 중복 | 0 |
| final sync sequence | 100 |

500개 동시 요청 결과다.

| 항목 | 결과 |
| --- | --- |
| 총 요청 | 500 |
| accepted | 100 |
| rejected | 400 |
| 네트워크 오류 | 0 |
| 5xx | 0 |
| sequence 중복 | 0 |
| final sync sequence | 100 |

Evidence 파일이다.

- `.omo/ulw-loop/evidence/load-test-http-concurrency.txt`.
- `.omo/ulw-loop/evidence/load-test-http-concurrency-500.txt`.

### 4.4 전체 회귀 검증

최종 검증 결과다.

| 명령 | 결과 |
| --- | --- |
| `npm run lint` | 통과 |
| `npx tsc --noEmit --pretty false` | 통과 |
| `npm run test` | 통과. 57 files, 316 tests |
| `npm run build` | 통과 |
| `git diff --check` | 통과 |

Evidence 파일이다.

- `.omo/ulw-loop/evidence/network-load-eslint.txt`.
- `.omo/ulw-loop/evidence/network-load-tsc.txt`.
- `.omo/ulw-loop/evidence/network-load-npm-test.txt`.
- `.omo/ulw-loop/evidence/network-load-build-final.txt`.
- `.omo/ulw-loop/evidence/network-load-diff-check.txt`.

## 5. 커밋 상태

hybrid 작업 관련 주요 커밋이다. 아래 세 커밋은 최초 1단계와 보고서 작성 시점의 기록이다.

- `a4379c0 Socket.IO hybrid 경매 전환 기반 추가`.
- `a005e1f test(auction): record network load verification`.
- `4861db3 docs(auction): summarize socket hybrid verification`.

2026-07-07 현재 이후 작업도 `origin/master`에 push된 상태이며, 최신 관련 커밋은 `81c748c feat(auction): harden socket primary bidding`이다.

## 6. 리스크와 제한 사항

이번 최초 검증으로 확인한 것은 fixture HTTP route와 in-process engine의 안정성이다. 이후 Socket.IO smoke와 primary persistence 테스트가 추가됐지만, 실제 운영 장시간 리허설에서 추가 확인해야 할 항목은 남아 있다.

남은 리스크다.

- 운영 Firebase ID token 검증과 기존 invite/room role 검증의 최종 연결.
- 클라이언트 Socket adapter의 장시간 reconnect 처리.
- connection state recovery 또는 sequence gap sync의 운영 리허설.
- 단일 Node process 재시작 시 Firestore hydrate로 복구되는지 확인.
- 다중 Node process sequence 일관성은 현재 10~16명 단일 서버 범위에서는 비목표다.
- Firestore bid history persistence는 구현됐지만 retry/outbox는 아직 없다.
- 장시간 soak test.

## 7. 다음 작업 제안

다음 단계는 대규모 확장이 아니라 현재 구현된 `SOCKET_SHADOW`와 `SOCKET_CANARY`의 운영 제한을 명확히 하는 것이다.

권장 순서는 다음과 같다.

1. 기본 transport는 `FIREBASE`로 유지한다.
2. 8~16명 리허설 방에서 `SOCKET_SHADOW`로 Firebase direct bid 결과와 Socket engine 결과를 비교한다.
3. mismatch와 latency를 확인한 뒤 내부 테스트 방에서만 `SOCKET_CANARY` primary bid를 사용한다.
4. 운영에서 매끄러운 체감이 반복 확인되면 공개 입찰 방 단위로만 canary 사용을 허용한다.
5. Redis, 다중 서버, 비공개 입찰 Socket 전환은 현재 규모에서 제외하고 실제 장애나 확장 요구가 생길 때 재검토한다.

이 순서가 안전한 이유는 기존 Firebase production 경로를 유지하면서, 사용자가 체감한 Socket.IO 개선 효과를 작은 규모의 공개 입찰 hot path에만 적용할 수 있기 때문이다.
