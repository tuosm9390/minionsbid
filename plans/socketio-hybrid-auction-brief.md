# Socket.IO Hybrid 경매 전환 기획서

## 목표

Firebase 기반 앱 구조는 유지하면서 공개 입찰 hot path를 Socket.IO 기반 authoritative auction engine으로 단계 전환한다. 목표는 더 빠른 화면이 아니라, 모든 클라이언트가 server sequence 기준으로 같은 경매 상태를 즉시 보고 재연결 후에도 회복하는 것이다.

2026-07-07 현재 이 계획의 운영 전제는 10~16명 규모의 단일 서버 경매다. Socket.IO는 Firebase를 대체하는 전면 전환이 아니라 공개 입찰 체감 개선과 상태 순서 제어를 위한 제한적 canary 경로로 둔다. Redis, 다중 Socket 서버, Kafka, NATS, Supabase 재작성은 현재 기본 구현 범위가 아니다.

## 문제 정의

현재 구조는 Firestore transaction과 RTDB fanout으로 안정적인 수렴을 제공한다. 다만 경매 hot path가 Firestore room 문서, Firestore snapshot, RTDB fanout, Server Action fallback에 걸쳐 있어 다음 문제가 커질 수 있다.

- 입찰 판정, 전파, persistence의 경계가 한 흐름에 섞여 있다.
- 동시 입찰과 timer extension이 Firestore hot document에 집중된다.
- 실시간 이벤트 순서와 누락 복구가 `auction_revision`, `last_auction_event`, RTDB history, snapshot fallback에 분산되어 있다.
- 장기적으로 중앙 경매 엔진에서 명령과 상태를 통제하기 어렵다.

## 사용자 가치

주최자와 팀장은 다음 효과를 체감해야 한다.

- 입찰 반응과 타이머 연장이 모든 화면에 같은 순서로 보인다.
- 재연결 후 과거 화면이 잠깐 보이는 대신 최신 snapshot으로 빠르게 회복한다.
- 경매 도중 특정 브라우저나 네트워크가 느려도 server state가 기준이 된다.
- 경매 종료, archive, 일정 연결은 기존처럼 유지된다.

## 범위

1차 범위는 공개 입찰 `OPEN_ASCENDING` mode다.

포함한다.

- Socket.IO 연결, 인증, room join.
- 공개 입찰 command와 accepted/rejected 응답.
- server sequence 기반 `auction:state`.
- timer start, extension, pause, resume, award, unsold.
- reconnect snapshot sync.
- Firestore bid history와 결과 저장.
- feature flag와 fixture canary.

제외한다.

- 비공개 입찰 `SEALED_BID`.
- 희망 팀 배정 phase.
- schedule, hall of fame 데이터 모델 변경.
- Supabase 전환.
- 최초 버전 Redis 필수화.
- 모바일 또는 UI redesign.

## 핵심 정책

### 상태 소유권

Socket mode 방에서는 경매 진행 중 hot state를 Socket.IO가 소유한다. Firestore listener는 room metadata, players, teams persistence reconcile, archive, schedule 연결에 사용한다. 클라이언트는 `currentBid`, `timerEndsAt`, `currentPlayerId`, `participantPoints`를 Firestore snapshot으로 덮어쓰지 않는다.

### 기능 플래그

방 단위로 transport를 선택한다.

```text
auction_transport: "FIREBASE" | "SOCKET_SHADOW" | "SOCKET_CANARY" | "SOCKET"
```

초기 기본값은 `FIREBASE`다. 운영 방 전체를 한 번에 전환하지 않는다.

### Redis 정책

첫 canary와 현재 운영 목표는 단일 Socket 서버와 Firestore persistence-before-broadcast를 기준으로 한다. Redis 또는 동등한 durable active state 저장소는 서버 2대 이상, 16명 초과 운영, 또는 재시작 중 active state 보존 요구가 실제로 생길 때만 다시 결정한다.

## 사용자 흐름

### 주최자

1. 주최자가 방에 입장한다.
2. 클라이언트가 Firebase room data와 Socket connection을 준비한다.
3. Socket mode 방이면 주최자 명령은 Socket command로 전송된다.
4. 서버가 sequence를 증가시키고 `auction:state`를 broadcast한다.
5. 종료 후 결과는 기존 Firestore archive 흐름으로 저장된다.

### 팀장

1. 팀장이 초대 링크로 입장한다.
2. Firebase room auth 또는 invite token을 기준으로 Socket handshake가 인증된다.
3. 입찰 버튼 클릭 시 `bid:submit` command를 보낸다.
4. 서버는 request id 기준 중복을 흡수하고, 성공 또는 실패를 응답한다.
5. 모든 팀장은 같은 `auction:state`를 받는다.

### 재연결

1. 클라이언트가 socket reconnect 후 마지막 sequence를 서버에 보낸다.
2. 서버는 gap이 없으면 최신 상태만 확인한다.
3. gap이 있거나 event log가 없으면 snapshot 전체를 보낸다.
4. 클라이언트는 snapshot sequence가 현재보다 높을 때만 replace한다.

## Rollout 계획

| 단계 | 이름 | 목적 | 완료 기준 |
| --- | --- | --- | --- |
| 0 | 기준선 계측 | 현재 Firebase 성능을 숫자로 확인 | 8팀장 bid burst p95와 fallback count 기록 |
| 1 | Shadow | Socket 연결과 인증만 검증 | 경매 진행 영향 없이 모든 역할 join/reconnect 성공 |
| 2 | Fixture Canary | 테스트 방에서 Socket state 적용 | Playwright fixture 경매 통과 |
| 3 | 운영 Canary | 선택한 공개 입찰 방에 적용 | archive와 schedule 계약 유지, p95 기준 통과 |
| 4 | Durable state 재검토 | 서버 이중화 또는 active state 보존 요구 대응 | Firestore hydrate로 부족한 문제가 확인될 때만 Redis 등 검토 |
| 5 | RTDB 축소 | fanout 경로 단순화 | Socket mode에서 RTDB primary 의존 제거 |

## 성공 지표

- bid click부터 peer 화면 적용까지 p95 기준을 충족한다.
- `bid:submit` 중복 request id가 같은 bid를 중복 생성하지 않는다.
- reconnect 후 1초 이내 최신 sequence snapshot으로 회복한다.
- Socket mode 방에서도 archive 생성과 team assignment, schedule gate가 기존처럼 동작한다.
- fallback 또는 pause 정책이 명확해 서버 장애 시 잘못된 낙찰이 발생하지 않는다.

## 의사결정 필요 항목

1. 운영 canary 기준 p95 값을 몇 ms로 둘지 결정해야 한다.
2. Redis 도입은 현재 기본 범위에서 제외하고, 16명 초과 운영이나 서버 이중화가 필요해질 때 결정한다.
3. Socket 서버 배포 대상과 로그 수집 방식을 결정해야 한다.
4. Socket mode에서 RTDB `auctionEvent`를 fallback으로 유지할 기간을 결정해야 한다.
5. 공개 입찰 안정화 후 비공개 입찰까지 Socket mode로 옮길지 별도 판단해야 한다.

## 비목표

이 작업은 Firebase를 제거하는 작업이 아니다. 또한 Supabase 재작성, 경매 UI 전면 개편, 일정 시스템 재설계, 명예의 전당 구조 변경을 포함하지 않는다.
