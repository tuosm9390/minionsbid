# SOCKET_SHADOW 구현 준비 계획서

작성일: 2026-07-06.

## 목적

`SOCKET_SHADOW` 모드는 기존 Firebase 공개 입찰 경로를 유지하면서 Socket.IO 경로를 병렬로 실행해 판정 결과와 지연 시간을 비교하는 전환 단계다. 이 문서는 실제 구현에 들어가기 전 필요한 준비 상태, 완료된 준비작업, 구현 순서, 검증 기준을 정리한다.

## 현재 완료된 준비상태

완료된 기반이다.

- `auction_transport` feature flag가 store에 반영된다.
- `SOCKET_SHADOW`는 primary transport가 아니라 관측 모드로 분류된다.
- 공개 입찰 authoritative engine이 존재한다.
- Socket hybrid shared contract가 존재한다.
- fixture HTTP route로 `sync`와 `bid` 계약을 검증할 수 있다.
- 네트워크 smoke와 500개 동시 요청 부하 테스트가 통과했다.

이번 준비작업으로 추가 완료한 항목이다.

- `socket.io` runtime dependency를 추가했다.
- `socket.io-client` runtime dependency를 추가했다.
- 구현 순서와 테스트 기준을 이 문서로 고정했다.

## 의존성 결정

추가한 패키지다.

| 패키지 | 용도 |
| --- | --- |
| `socket.io` | 별도 Auction Socket Server와 room broadcast 구현 |
| `socket.io-client` | 브라우저 클라이언트 shadow 연결과 command mirror 구현 |

별도 타입 패키지는 추가하지 않는다. 두 패키지는 TypeScript 타입을 포함한다.

`npm audit --omit=dev` 기준 production 취약점은 남아 있지만, 출력상 새 Socket.IO 패키지 직접 취약점은 아니다. 현재 취약점은 기존 `firebase-admin`, `next`, `@grpc/grpc-js`, `uuid`, `form-data` 계열로 분류된다.

## 구현 범위

초기 `SOCKET_SHADOW` 구현에 포함할 범위다.

- 별도 Node 기반 Socket.IO server bootstrap.
- `auction:join`과 `auction:sync`.
- shadow 전용 `bid:shadowSubmit`.
- 기존 Firebase direct bid 성공 후 같은 request를 Socket engine에 mirror.
- Socket engine 결과와 Firebase direct bid 결과 비교.
- mismatch, latency, rejected reason을 내부 로그 또는 fixture state로 기록.
- `SOCKET_SHADOW`에서 Socket 연결 실패가 기존 경매 진행을 막지 않도록 처리.

초기 범위에서 제외할 항목이다.

- `SOCKET_CANARY` primary 입찰 전환.
- Redis durable state.
- 다중 Socket server scale-out.
- Firestore bid history persistence worker.
- 비공개 입찰.
- 팀 배정 phase.

## 구현 순서

### 1단계. Socket server skeleton

목표다.

- `auction-server` 또는 `src/server/auction-socket` 중 하나의 위치를 확정한다.
- HTTP server와 Socket.IO server를 bootstrap한다.
- health endpoint 또는 `auction:ping`을 제공한다.
- fixture room join을 지원한다.

테스트 기준이다.

- server bootstrap 단위 테스트.
- 실제 process 실행 후 Socket.IO client가 connect되고 ping 응답을 받는 수동 QA.

### 2단계. 인증과 room join

목표다.

- handshake auth payload에 `roomId`, `role`, `teamId`, `authToken` 또는 `invite`를 받는다.
- 기존 room auth 검증 helper를 재사용할 수 있는 경계로 분리한다.
- fixture mode에서는 fixture token을 허용한다.

테스트 기준이다.

- valid fixture leader join 성공.
- 잘못된 token join 실패.
- viewer는 shadow submit 불가.

### 3단계. Shadow sync

목표다.

- `auction:join` 후 `auction:sync` snapshot을 내려준다.
- 초기 snapshot은 기존 fixture 또는 Firestore room state에서 만든다.
- client는 `SOCKET_SHADOW`에서 Firebase UI 상태를 덮어쓰지 않고 shadow snapshot만 관측한다.

테스트 기준이다.

- `SOCKET_SHADOW` room에서 Firebase realtime state가 기존대로 유지된다.
- shadow sync 수신이 store의 primary 경매 상태를 변경하지 않는다.

### 4단계. Shadow bid mirror

목표다.

- 기존 `placeBidDirect()` 성공 후 동일한 bid command를 Socket shadow 경로에 전송한다.
- shadow response는 UI 상태를 바꾸지 않는다.
- Firebase accepted result와 Socket accepted result를 비교한다.

테스트 기준이다.

- Firebase bid 성공 후 shadow submit이 호출된다.
- shadow accepted와 Firebase result가 일치하면 mismatch가 없다.
- amount, team, currentPlayer가 다르면 mismatch 기록이 남는다.

### 5단계. 관측성과 QA

목표다.

- shadow latency marker를 기존 latency debug 흐름과 연결한다.
- mismatch evidence를 route 또는 debug panel에서 확인할 수 있게 한다.
- 네트워크 연결 실패는 warning으로만 기록한다.

테스트 기준이다.

- Socket server down 상태에서도 Firebase bid가 성공한다.
- Socket server up 상태에서 shadow latency와 mismatch count를 확인할 수 있다.
- 8팀장 fixture 또는 multi-context Playwright에서 기존 경매 동작이 유지된다.

## 성공 기준

`SOCKET_SHADOW` 구현 완료 기준이다.

- 기존 Firebase 경매 경로의 사용자 동작이 변하지 않는다.
- shadow Socket 연결 실패가 입찰, 타이머, 낙찰을 막지 않는다.
- shadow server가 켜진 경우 모든 direct bid 성공에 대해 shadow command가 전송된다.
- shadow engine 결과와 Firebase result mismatch가 구조화된 기록으로 남는다.
- reconnect 후 `auction:sync`를 다시 받을 수 있다.
- 관련 Vitest, lint, typecheck, build, HTTP 또는 Socket.IO client QA가 통과한다.

## 위험 지점

주의할 점이다.

- Firestore snapshot과 Socket shadow snapshot을 같은 store 필드에 섞으면 기존 UI가 흔들릴 수 있다.
- shadow mode에서 Socket result를 화면 상태로 적용하면 `SOCKET_CANARY`와 구분이 사라진다.
- Next.js App Router API route 안에 장기 실행 Socket server를 억지로 넣으면 runtime lifecycle이 불안정해질 수 있다.
- production 배포 환경에서는 Next app과 Socket server의 배포 단위, 포트, CORS, health check를 별도로 정해야 한다.

## 다음 착수 전 확인사항

구현 시작 직전 확인할 항목이다.

- 배포 환경에서 별도 Socket server process를 둘 수 있는지 확인한다.
- 로컬 개발 포트 기본값을 정한다.
- shadow mismatch 저장 위치를 정한다.
- 운영에서 shadow 로그가 사용자 개인정보나 token을 남기지 않도록 redaction 규칙을 정한다.
