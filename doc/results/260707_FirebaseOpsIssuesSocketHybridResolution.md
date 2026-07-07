# Firebase 운영 문제와 Socket.IO Hybrid 해결 기록

작성일: 2026-07-07.

## 목적

이 문서는 Firebase 단독 기반 실시간 경매를 운영하면서 반복적으로 관찰된 문제, 사용자가 제기한 의문, 그리고 Socket.IO hybrid 작업으로 해결한 범위를 정리한다. 결론은 Firebase를 버리는 것이 아니라, 실제 운영에서 흔들렸던 공개 입찰 hot path만 Socket.IO server sequence로 보강하는 것이다.

## 문제 제기 배경

초기 의도는 Firebase 서비스만으로 실시간 경매 시스템을 완성하는 것이었다. Firestore는 transaction과 rules를 제공하고, RTDB는 저지연 fanout과 presence에 적합하므로 10명 안팎의 커뮤니티 경매에는 충분해 보였다.

하지만 실제 운영과 리허설에서는 다음 문제가 반복적으로 드러났다.

| 문제 | 운영에서 보인 증상 | Firebase 단독 구조의 부담 |
| --- | --- | --- |
| 실시간 수렴 지연 | 어떤 화면은 입찰과 타이머가 즉시 보이고, 다른 화면은 늦게 따라오는 상황 | Firestore snapshot, RTDB event, fallback snapshot이 서로 다른 시점에 도착함 |
| 팀장 참여 상태 불안정 | 팀장 접속 상태나 custom token 처리 실패가 경매 진행 판단에 영향을 줌 | presence, room auth, Firebase custom token 흐름이 분산됨 |
| 타이머 표시 중복감 | 입찰 시 타이머가 두 번 갱신되는 것처럼 보임 | direct bid snapshot과 후속 RTDB `BID_PLACED`가 모두 타이머를 갱신함 |
| 만료 시 확정 누락 | 타이머 종료 시점에 낙찰 확정이 진행되지 않는 경로가 발생함 | 화면 상태와 Firestore `active_bid` 정본 상태가 갈라질 수 있음 |
| 중복 제출과 순서 판단 | 빠른 연속 입찰이나 재시도에서 같은 의도를 한 번으로 볼 기준이 부족함 | Firestore revision과 event id는 있지만 command 단위 idempotency는 약함 |

이 문제들은 Firebase가 틀렸다는 뜻은 아니다. 기존 구조는 Firestore 정본 상태, RTDB fanout, Firestore rules, `auction_revision`, `last_auction_event` fallback을 갖춘 꽤 강한 구조였다. 다만 실제 경매의 가장 민감한 구간인 공개 입찰에서는 “상태를 누가 결정하고 어떤 순서로 모든 화면에 전달하는지”가 더 명확해야 했다.

## 사용자가 제기한 핵심 의문

사용자가 제기한 질문은 단순히 “Socket.IO가 더 빠른가”가 아니었다. 실제 의문은 다음에 가까웠다.

1. Firebase listener와 RTDB fanout만으로 실시간 경매 운영 문제가 계속 발생한다면, 입찰과 타이머를 별도 실시간 계층으로 분리해야 하는가.
2. 입찰 시 클라이언트마다 타이머가 두 번 갱신되는 것처럼 보이는 현상을 서버가 확정한 단일 상태 broadcast로 줄일 수 있는가.
3. 서버는 확정된 데이터만 Firestore에 저장하고, 실시간 화면 수렴은 Socket.IO가 담당하게 하면 운영 안정성이 좋아지는가.
4. Redis, 다중 서버, Supabase 재작성까지 가야 하는 문제인지, 아니면 현재 규모에 맞는 작은 hybrid가 충분한지.

현재 구현은 네 번째 질문에 대해 “작은 hybrid가 충분하다”는 답을 선택했다.

## 해결 방향

해결 방향은 전체 Firebase 제거가 아니라 역할 분리다.

```text
FIREBASE 기본 경로
  Firestore = 정본 상태, rules, history, archive, schedule
  RTDB = 기존 fanout과 presence

SOCKET_SHADOW
  Firebase direct bid를 그대로 유지
  Socket engine 결과와 latency만 병렬 관측

SOCKET_CANARY / SOCKET
  공개 입찰 bid:submit만 Socket.IO primary로 처리
  서버 engine이 sequence, currentBid, timerEndsAt을 결정
  Firestore persistence 성공 후에만 auction:state broadcast
```

이 구조는 현재 10~16명 규모의 단일 서버 운영을 전제로 한다. Redis, 다중 Socket 서버, 비공개 입찰 Socket 전환, Supabase 재작성은 기본 범위가 아니다.

## 구현으로 해결한 내용

### 1. Transport mode 분리

`auction_transport`를 통해 방 단위로 `FIREBASE`, `SOCKET_SHADOW`, `SOCKET_CANARY`, `SOCKET`을 구분한다. 기본값은 `FIREBASE`다.

효과:

- 운영 방 전체를 한 번에 바꾸지 않는다.
- shadow 관측과 canary primary를 같은 코드베이스에서 비교할 수 있다.
- 문제가 생기면 방 단위로 Firebase 기본 경로로 돌아갈 수 있다.

### 2. Socket authoritative engine 추가

`socketAuctionEngine`은 공개 입찰 command를 받아 서버 기준으로 판정한다.

검증 항목:

- room, player, team 일치.
- 타이머 진행 여부.
- 현재 최고 입찰 팀의 재입찰 차단.
- 10P 단위와 최소 입찰액.
- 팀 포인트와 로스터 슬롯.
- requestId 기반 accepted event 멱등성.
- 5초 타이머 연장 정책.

효과:

- 공개 입찰의 순서와 결과가 Firestore listener 도착 순서에 덜 의존한다.
- 같은 입찰 의도의 재전송을 같은 결과로 흡수할 수 있다.
- 모든 클라이언트가 `sequence` 기준 상태를 적용할 수 있다.

### 3. SOCKET_SHADOW 관측 경로

`SOCKET_SHADOW`에서는 기존 Firebase direct bid를 유지하고, 성공한 입찰을 Socket.IO 또는 HTTP fixture fallback으로 mirror한다.

효과:

- 사용자 화면을 바꾸지 않고 Socket engine 판정을 비교할 수 있다.
- shadow 실패가 실제 입찰 성공 흐름을 깨지 않는다.
- `window.__socketShadowBidResults__`에 latency, accepted/rejected, mismatch 여부를 남길 수 있다.

### 4. SOCKET_CANARY primary bid 경로

`SOCKET_CANARY`와 `SOCKET`에서는 `placeBidSocketPrimary()`가 `bid:submit`을 Socket.IO로 보낸다. `RoomClient`는 `auction:state`를 구독해 입찰자가 아닌 화면도 같은 server state를 받는다.

효과:

- 타이머와 최고 입찰 상태가 서버 확정 payload 하나로 적용된다.
- Firebase direct bid와 후속 RTDB broadcast가 동시에 화면을 흔드는 경로를 줄인다.
- 사용자가 확인한 것처럼 Firebase 단독보다 더 매끄러운 체감이 가능하다.

### 5. Persistence-before-broadcast 보강

초기 primary 구현에서는 Socket accepted state와 Firestore 정본 상태가 갈라질 위험이 있었다. 이를 `persistSocketAcceptedBid()`와 서버 rollback으로 보강했다.

현재 정책:

```text
Socket engine accepted 계산
  -> Firestore transaction persistence
  -> 성공 시 ack + auction:state broadcast
  -> 실패 시 engine snapshot rollback + ack error
```

효과:

- 화면에는 낙찰된 것처럼 보이지만 Firestore에는 `active_bid`가 없는 문제를 막는다.
- 타이머 만료 후 기존 `recoverExpiredAuction()`과 `awardPlayer()`가 Firestore 정본을 읽어 확정할 수 있다.
- Admin SDK persistence가 rules를 우회하므로 transaction 안에서 current player, timer, stale revision, stale amount를 별도로 검증한다.

### 6. 10P 단위와 5초 타이머 정책 정리

공개 입찰 input은 10P 단위로 정규화하고, Socket engine과 Firebase rules도 같은 단위를 검증한다. 입찰 시 남은 시간이 5초 이하이면 타이머를 입찰 시점 기준 5초로 갱신한다.

효과:

- UI, Firebase direct bid, Server Action fallback, Socket engine의 금액과 타이머 정책이 맞춰졌다.
- 1P 단위 직접 입력으로 생기는 사용자 실수와 서버 거부를 줄였다.
- 8초 기준과 5초 기준이 섞여 타이머가 줄어드는 역전 상황을 피했다.

## 아직 하지 않은 것과 이유

| 제외 항목 | 제외 이유 |
| --- | --- |
| Redis | 단일 서버 10~16명 운영에서는 Firestore persistence-before-broadcast와 hydrate가 먼저다 |
| 다중 Socket 서버 | 입찰 순서 단일화, sticky session, Redis adapter가 필요해 현재 규모보다 복잡하다 |
| 비공개 입찰 Socket 전환 | 비공개 입찰은 실시간 fanout보다 은닉, 저장, 공개 순서가 중요해 Server Action이 더 단순하다 |
| Supabase 재작성 | 현재 문제는 전체 DB 모델 문제가 아니라 공개 입찰 hot path 문제다 |

## 현재 판단

사용자가 제기한 문제는 적절했다. Firebase 단독 구조는 이론적으로 충분해 보였지만, 실제 운영에서는 실시간 수렴, 팀장 참여 상태, 타이머 확정, 낙찰 persistence가 한 흐름 안에서 반복적으로 흔들렸다.

현재의 Socket.IO hybrid는 그 문제를 해결하기 위한 현실적인 절충안이다. Firebase는 정본 데이터와 운영 도메인을 계속 담당하고, Socket.IO는 공개 입찰의 짧고 민감한 hot path만 담당한다.

따라서 지금 상태의 권장 운영 방향은 다음이다.

1. 기본값은 `FIREBASE`로 유지한다.
2. 운영 전 리허설에서 `SOCKET_SHADOW`로 결과 차이와 latency를 관측한다.
3. 공개 입찰 체감 개선이 필요한 방에 한해 `SOCKET_CANARY`를 사용한다.
4. 10~16명 단일 서버 규모를 넘는 확장 기능은 실제 필요가 생길 때만 별도 설계한다.

## 관련 파일

- `src/features/auction/utils/auctionTransport.ts`.
- `src/features/auction/socket/socketAuctionEngine.ts`.
- `src/features/auction/socket/socketShadowServer.ts`.
- `src/features/auction/socket/socketShadowClient.ts`.
- `src/features/auction/socket/socketAuctionClient.ts`.
- `src/features/auction/socket/socketBidPersistence.ts`.
- `src/features/auction/hooks/useBiddingControl.ts`.
- `src/app/room/[id]/RoomClient.tsx`.
- `doc/AUCTION_REALTIME_CONTRACT.md`.
- `doc/ARCHITECTURE.md`.
