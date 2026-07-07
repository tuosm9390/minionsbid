# Socket.IO Hybrid 구현 및 네트워크 부하 검증 보고서

작성일: 2026-07-06.
현재화: 2026-07-07.

## 2026-07-07 현재화 메모

이 보고서는 최초 1단계 구현과 HTTP fixture 부하 검증을 기록한 문서다. 이후 `SOCKET_SHADOW`, `SOCKET_CANARY` primary bid, Socket.IO accepted bid Firestore persistence, persistence-before-broadcast 보강, 공개 입찰 5초 타이머 갱신이 추가됐다.

따라서 아래의 네트워크 부하 결과는 실제 운영 Socket.IO 서버 전체 부하 검증이 아니라, production build에서 fixture HTTP route와 in-process engine 계약을 검증한 결과로 해석해야 한다. 실제 Socket.IO server/client smoke는 이후 `npm run smoke:socket-shadow`로 별도 검증한다.

현재 운영 방향은 Firebase를 제거하는 전면 전환이 아니다. 기본 운영은 `FIREBASE`를 유지하고, 10~16명 규모의 단일 서버 공개 입찰 hot path에서 체감 개선이 필요한 방에 한해 `SOCKET_SHADOW`와 `SOCKET_CANARY`를 제한적으로 사용한다. Redis, 다중 서버, Kafka, NATS, Supabase 재작성은 현재 규모의 기본 구현 범위가 아니다.

## 요약

Firebase 기반 경매 구조를 전면 교체하지 않고, Socket.IO hybrid 전환을 위한 1단계 기반을 구현했다. 이번 범위는 실제 운영 Socket.IO 서버 연결이 아니라, 공개 입찰 hot path를 서버 권위 모델로 옮길 때 필요한 transport flag, shared contract, authoritative auction engine, fixture canary HTTP route를 코드로 고정하는 작업이다.

구현 후 production build 기반 fixture server에서 네트워크 smoke, host binding 확인, 120개 및 500개 동시 HTTP 부하 테스트를 수행했다. 모든 검증에서 5xx, 네트워크 오류, sequence 중복, final sync 불일치는 발견되지 않았다.

관련 커밋은 다음 두 개다.

- `a4379c0 Socket.IO hybrid 경매 전환 기반 추가`.
- `a005e1f test(auction): record network load verification`.

## 구현 범위

### Transport Flag

`auction_transport`를 클라이언트 store에 연결했다.

지원 값은 다음과 같다.

- `FIREBASE`.
- `SOCKET_SHADOW`.
- `SOCKET_CANARY`.
- `SOCKET`.

알 수 없는 값이나 빈 값은 기존 동작 보존을 위해 `FIREBASE`로 정규화한다.

주요 파일이다.

- `src/features/auction/utils/auctionTransport.ts`.
- `src/features/auction/store/useAuctionStore.ts`.
- `src/features/auction/hooks/useAuctionRealtime.ts`.
- `__tests__/auctionTransport.test.ts`.
- `__tests__/useAuctionRealtime.test.tsx`.

### Shared Contract

Socket hybrid engine과 향후 클라이언트 adapter가 공유할 상태, command, event 타입을 추가했다.

주요 계약은 다음과 같다.

- `SocketAuctionState`.
- `BidSubmitCommand`.
- `SocketAuctionAcceptedEvent`.
- `SocketAuctionRejectedEvent`.
- `SocketAuctionSyncEvent`.

주요 파일이다.

- `src/features/auction/socket/socketContracts.ts`.

### Authoritative Auction Engine

공개 입찰용 서버 권위 engine을 추가했다. 이 engine은 Firestore listener가 아니라 서버 내부 state를 기준으로 입찰을 판정한다.

현재 구현한 검증 항목은 다음과 같다.

- room id 일치.
- 현재 경매 선수 일치.
- timer 진행 여부.
- team 존재 여부.
- roster slot 여유.
- 현재 최고 입찰 팀의 재입찰 차단.
- 양의 정수 금액 검증.
- 10P 단위 검증.
- 최소 입찰액 검증.
- 보유 포인트 검증.
- `requestId` 기준 accepted event 멱등성.
- accepted bid 발생 시 `sequence` 증가.
- 이전 최고 입찰 팀 포인트 복구와 새 최고 입찰 팀 포인트 예약.
- 종료 임박 시 현재 공개 입찰 5초 연장 정책 적용.

주요 파일이다.

- `src/features/auction/socket/socketAuctionEngine.ts`.
- `__tests__/socketAuctionEngine.test.ts`.

### Fixture Canary HTTP Route

`E2E_AUCTION_FIXTURE=1`에서만 동작하는 fixture 전용 HTTP command route를 추가했다.

지원 action은 다음과 같다.

- `sync`.
- `bid`.

Next dev 또는 route module 재평가 후에도 fixture engine의 request id 멱등성 state가 사라지지 않도록 `globalThis` 기반 engine store를 사용한다.

주요 파일이다.

- `src/app/api/e2e/socket-hybrid/command/route.ts`.
- `__tests__/socketHybridRoute.test.ts`.

## 테스트 우선 구현 기록

구현은 테스트를 먼저 추가하고 실패를 확인한 뒤 생산 코드를 붙이는 방식으로 진행했다.

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

## 네트워크 검증 결과

Production build 후 `next start`로 fixture server를 띄워 실제 HTTP 표면을 검증했다.

### HTTP Smoke

Evidence 파일이다.

- `.omo/ulw-loop/evidence/network-smoke-http.txt`.

검증한 항목이다.

- `POST /api/e2e/auction-fixture/reset` 200.
- `POST /api/e2e/socket-hybrid/command` sync 200.
- 정상 bid 200과 `bid:accepted`.
- 같은 `requestId` replay 200과 body 완전 동일.
- malformed payload 400.
- unsupported action 400.
- 10P 단위 위반 bid 400과 `10P 단위로 입찰해야 합니다.`.
- cleanup 후 `port 3042 listener count 0`.

### Host Binding Smoke

Evidence 파일이다.

- `.omo/ulw-loop/evidence/network-bind-host-smoke.txt`.

검증한 항목이다.

- `next start -H 0.0.0.0` 실행.
- `127.0.0.1` 접근 sync 200.
- `localhost` 접근 sync 200.
- cleanup 후 `port 3044 listener count 0`.

## 부하 테스트 결과

### 120개 동시 요청

Evidence 파일이다.

- `.omo/ulw-loop/evidence/load-test-http-concurrency.txt`.

결과 요약이다.

| 항목 | 결과 |
| --- | --- |
| 총 요청 | 120 |
| 처리 시간 | 315ms |
| accepted | 100 |
| rejected | 20 |
| 네트워크 오류 | 0 |
| 5xx | 0 |
| 예상 외 status | 0 |
| sequence 중복 | 0 |
| max sequence | 100 |
| final sync sequence | 100 |
| cleanup | `port 3043 listener count 0` |

### 500개 동시 요청

Evidence 파일이다.

- `.omo/ulw-loop/evidence/load-test-http-concurrency-500.txt`.

결과 요약이다.

| 항목 | 결과 |
| --- | --- |
| 총 요청 | 500 |
| 처리 시간 | 1264ms |
| accepted | 100 |
| rejected | 400 |
| 네트워크 오류 | 0 |
| 5xx | 0 |
| 예상 외 status | 0 |
| sequence 중복 | 0 |
| max sequence | 100 |
| final sync sequence | 100 |
| cleanup | `port 3045 listener count 0` |

거부 응답은 정상적인 도메인 거부였다.

- `포인트 부족 (보유: 1000P)`: 200건.
- `현재 최고 입찰자입니다. 추가 입찰이 불가합니다.`: 200건.

## 전체 회귀 검증

최종 검증 명령과 evidence다.

| 명령 | 결과 | Evidence |
| --- | --- | --- |
| `npm run lint` | 통과 | `.omo/ulw-loop/evidence/network-load-eslint.txt` |
| `npx tsc --noEmit --pretty false` | 통과 | `.omo/ulw-loop/evidence/network-load-tsc.txt` |
| `npm run test` | 통과. 57 files, 316 tests | `.omo/ulw-loop/evidence/network-load-npm-test.txt` |
| `npm run build` | 통과 | `.omo/ulw-loop/evidence/network-load-build-final.txt` |
| `git diff --check` | 통과. CRLF 경고만 표시 | `.omo/ulw-loop/evidence/network-load-diff-check.txt` |

테스트 중 기존 latency 관련 의도된 stderr 출력과 React `act(...)` 경고가 표시됐지만, 전체 테스트는 통과했다. 이번 작업으로 새로 발생한 실패는 없다.

## 현재 결론

이번 1단계 구현은 다음 기준을 만족한다.

- 기존 Firebase 경매 흐름을 깨지 않고 Socket hybrid 전환 flag를 수용한다.
- 공개 입찰 hot path를 서버 권위 engine으로 검증할 수 있는 최소 domain core를 갖췄다.
- fixture canary HTTP route로 실제 네트워크 표면에서 sync, bid, replay, malformed, 부하 요청을 검증할 수 있다.
- 500개 동시 요청 기준에서 5xx, 네트워크 오류, sequence 중복, final sync 불일치가 없었다.
- `master` 브랜치에 commit과 push가 완료됐다.

## 남은 범위

이 보고서 작성 시점의 1단계 작업에서 의도적으로 제외했던 범위다. 2026-07-07 현재 일부는 이후 작업에서 구현됐다.

- 실제 Socket.IO attach 경계와 smoke script는 구현됐다. 별도 상시 운영 process 배포는 아직 문서화된 운영 전제가 아니다.
- Socket handshake 검증은 `validateAuth` 주입 경계와 fixture auth로 구현됐다. 운영 Firebase Auth ID token 검증 연결은 아직 별도 결정 항목이다.
- Redis 기반 durable active state는 현재 10~16명 단일 서버 운영 범위에서 제외한다.
- 클라이언트 Socket adapter는 `SOCKET_SHADOW`와 `SOCKET_CANARY` 경로로 구현됐다. 장시간 reconnect gap recovery는 추가 검증 대상이다.
- Socket primary accepted bid Firestore persistence는 구현됐다. retry queue 또는 outbox는 아직 없다.
- 운영 부하 기준의 장시간 soak test.
- 다중 Node process 또는 multi-instance 환경에서의 sequence 일관성 검증.

다음 단계는 별도 대규모 확장이 아니라, 현재 단일 서버 `SOCKET_SHADOW`와 `SOCKET_CANARY` 범위에서 8~16명 리허설을 반복하고 Firebase 기본 경로와 비교한 체감 및 latency evidence를 남기는 것이다.
