# Socket.IO Hybrid 작업 보고서

작성일: 2026-07-06.

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

실제 운영 Socket.IO 서버, Redis, 클라이언트 Socket adapter는 이번 범위에 포함하지 않았다. 이번 작업은 그 전 단계인 domain core와 canary 검증 표면을 만드는 작업이다.

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
- 종료 임박 시 기존 8초 연장 정책을 적용한다.

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

hybrid 작업 관련 주요 커밋이다.

- `a4379c0 Socket.IO hybrid 경매 전환 기반 추가`.
- `a005e1f test(auction): record network load verification`.
- `4861db3 docs(auction): summarize socket hybrid verification`.

`a4379c0`과 `a005e1f`는 `origin/master`에 push 완료됐다. `4861db3`는 보고서 문서 커밋으로, 이 문서 작성 시점 기준 로컬이 원격보다 1커밋 앞서 있다.

## 6. 리스크와 제한 사항

이번 검증으로 확인한 것은 fixture HTTP route와 in-process engine의 안정성이다. 실제 운영 Socket.IO 구조에서 추가로 확인해야 할 항목은 남아 있다.

남은 리스크다.

- 실제 Socket.IO handshake 인증.
- Firebase ID token 검증과 room role 검증.
- 클라이언트 Socket adapter의 reconnect 처리.
- connection state recovery 또는 sequence gap sync.
- Redis 없이 단일 Node process가 죽었을 때 active state 유실.
- 다중 Node process에서 sequence 일관성.
- Firestore bid history persistence와 retry/outbox 설계.
- 장시간 soak test.

## 7. 다음 작업 제안

다음 단계는 `SOCKET_SHADOW` 모드 구현이다.

권장 순서는 다음과 같다.

1. 별도 Node Socket.IO server process 추가.
2. Firebase Auth ID token handshake 검증 추가.
3. room join과 `auction:sync`만 먼저 구현.
4. 기존 Firestore direct bid 결과와 Socket engine 판정 결과를 shadow 비교.
5. shadow mismatch 로그와 latency report를 수집.
6. mismatch가 없을 때 `SOCKET_CANARY`로 일부 fixture 또는 내부 방에만 primary 전환.

이 순서가 안전한 이유는 기존 Firebase production 경로를 유지하면서 Socket engine을 병렬 검증할 수 있기 때문이다.
