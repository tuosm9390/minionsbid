# Socket.IO Hybrid 전환 분석 보고서

작성일: 2026-07-06.

## 목적

이 문서는 현재 Firebase 기반 경매 시스템을 `Firebase + Socket.IO` hybrid 구조로 전환하기 전에 필요한 분석을 정리한다. 결론부터 말하면 전환 대상은 전체 앱이 아니라 공개 입찰 hot path다. Firebase는 인증, 방 메타데이터, 선수, 팀, 입찰 history, archive, 일정 연결을 계속 담당하고, Socket.IO는 공개 입찰 중인 active auction state와 room broadcast를 담당하는 방향이 적절하다.

## 현재 구조 요약

현재 공개 입찰 흐름은 다음 구조다.

```text
Leader client
  -> placeBidDirect() Firestore transaction
  -> rooms/{roomId}.active_bid, timer_ends_at, auction_revision update
  -> rooms/{roomId}/bids append
  -> Firestore snapshot 1차 수렴
  -> broadcastBidEvent() Server Action
  -> RTDB auctionEvent + last_auction_event + system message
  -> RTDB 또는 Firestore fallback으로 모든 client 수렴
```

현재 authoritative 지점은 Firestore transaction과 Firestore rules다. 이 구조는 단순 listener-only 구조보다 강하다. `firestore.rules`가 role, roomId, teamId, amount, timer, revision, point balance, roster slot을 최종 검증하고, `useAuctionRealtime()`은 RTDB event와 Firestore snapshot fallback을 함께 사용한다.

## Hybrid 전환의 의미

Socket.IO를 붙인다는 것은 전송 수단을 바꾸는 수준이 아니다. 경매 중 hot state의 소유권을 옮기는 일이다.

| 항목 | 현재 | hybrid 목표 |
| --- | --- | --- |
| 입찰 판정 | Firestore transaction + rules | Auction Server command handler |
| 순서 | `auction_revision` | `sequence` |
| broadcast | RTDB + Firestore snapshot | Socket.IO room |
| reconnect | Firestore snapshot + RTDB history | `auction:sync` snapshot + event gap detection |
| persistence | hot state와 history를 Firestore에 즉시 저장 | active state는 server 또는 Redis, Firestore는 history와 결과 |
| 보안 | Firebase custom token + Firestore rules | Firebase token handshake + server role validation |

핵심은 클라이언트가 경매 진행 중 `currentBid`, `timerEndsAt`, `participantPoints`, `currentPlayerId`를 Firestore snapshot으로 계속 덮어쓰지 않게 만드는 것이다. 이 경계를 잘못 나누면 Socket.IO가 보낸 최신 상태를 Firestore listener의 늦은 snapshot이 되돌릴 수 있다.

## 전환 필요조건

Socket.IO hybrid 전환은 다음 조건 중 하나 이상이 실제로 확인될 때 우선순위가 올라간다.

| 조건 | 근거 수집 방법 |
| --- | --- |
| 8팀장 bid burst에서 p95 end-to-end latency가 기준을 넘는다. | `latency_reports`, Playwright latency marker, 수동 QA 로그 |
| Firestore transaction retry 또는 permission-denied가 정상 경합 상황에서 반복된다. | client fallback count, server action error log |
| RTDB fanout 누락이 `last_auction_event`와 `auctionEvents` replay로도 사용자 체감 문제를 만든다. | reconnect E2E, skip RTDB fixture |
| 단일 room hot document write가 운영 경매 규모의 병목이 된다. | Firestore write error, transaction abort, p95 상승 |
| 운영자가 경매 이벤트를 중앙 엔진에서 명령 단위로 통제해야 한다. | 운영 요구사항 |

현재는 기능적으로 Firebase 구조가 작동하고 있으므로, 전환의 첫 단계는 실제 성능 기준 수립과 shadow 검증이다.

## 상태 소유권 분리

Hybrid 구조에서 데이터 소유권은 다음처럼 나눠야 한다.

| 데이터 | 소유권 | 설명 |
| --- | --- | --- |
| room metadata | Firestore | 방 이름, 팀 수, 경매 방식, 생성 정보 |
| players, teams initial data | Firestore | 경매 시작 전 기준 데이터 |
| open auction hot state | Auction Server | 공개 입찰 중 현재 선수, 최고 입찰, 타이머, sequence |
| participant available points | Auction Server, Redis 도입 후 Redis | 경매 중 즉시 검증과 표시용 |
| bid accepted event | Auction Server | Socket.IO broadcast의 단일 출처 |
| bid history | Firestore | audit와 archive용 append |
| final player/team result | Firestore | 낙찰 확정 시 persistence |
| sealed bid submissions | Firestore Server Action | 초기 hybrid 범위에서 제외 |
| team assignment | Firestore Server Action | 초기 hybrid 범위에서 제외 |
| schedule, hall of fame | Firestore | 변경 없음 |

## 전환 범위와 제외 범위

초기 범위는 `OPEN_ASCENDING` 공개 입찰만 포함한다.

포함한다.

- 경매 참여 Socket 인증과 room join.
- 현재 방 snapshot sync.
- 공개 입찰 `bid:submit`, `bid:accepted`, `bid:rejected`.
- 타이머 연장과 `auction:state` broadcast.
- 경매 시작, 일시정지, 재개, 낙찰, 유찰의 server sequence화.
- Firestore bid history와 final result persistence.
- reconnect 시 `auction:sync` snapshot.

제외한다.

- 비공개 입찰 `SEALED_BID` 전환.
- 희망 팀 배정 phase 전환.
- 일정과 명예의 전당 구조 변경.
- Supabase 재작성.
- Redis 필수 도입.
- RTDB fanout 즉시 제거.

## 주요 리스크

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| Firestore snapshot과 Socket.IO state 충돌 | 화면이 과거 상태로 되돌아갈 수 있다. | 진행 중 hot state는 Socket adapter가 소유하고 Firestore listener는 metadata와 persistence reconcile로 제한한다. |
| Socket 서버 장애 시 active state 유실 | 진행 중 경매가 멈추거나 상태가 손실된다. | phase 1은 fixture/canary 한정, phase 2부터 Redis snapshot 또는 Firestore checkpoint 도입. |
| 인증 경계 중복 | rules와 socket server validation이 불일치할 수 있다. | room role validation helper를 shared server module로 분리하고 테스트를 공유한다. |
| persistence 실패 | 화면은 낙찰됐지만 Firestore result가 누락될 수 있다. | accepted event와 persistence status를 분리하고 retry queue, reconciliation job을 둔다. |
| 인프라 복잡도 증가 | 배포와 모니터링 표면이 늘어난다. | 별도 `auction-server`를 canary로 운영하고 feature flag로 비활성화 가능하게 한다. |
| 기존 E2E 깨짐 | 테스트가 RTDB와 Firestore snapshot을 전제한다. | transport adapter 단위 테스트와 Socket fixture E2E를 병행한다. |

## 단계별 전환안

### Phase 0. 기준선 계측

현재 Firebase 구조의 p50, p95, fallback count, transaction 실패율을 측정한다. 이 단계에서는 사용자 동작을 바꾸지 않는다.

완료 기준은 8팀장 bid burst, reconnect, RTDB skip fixture에서 기준선 보고서가 남는 것이다.

### Phase 1. Socket shadow mode

Socket.IO 서버와 클라이언트 연결을 추가하되 경매 상태를 바꾸지 않는다. 클라이언트는 기존 Firebase 경로로 동작하고, Socket 서버는 join, auth, ping, server time, shadow event correlation만 수행한다.

완료 기준은 모든 역할이 Socket에 인증되고, room join과 disconnect/reconnect 로그가 안정적으로 수집되는 것이다.

### Phase 2. Fixture canary

`E2E_AUCTION_FIXTURE=1` 방에서만 Socket.IO state를 실제 화면에 적용한다. Firestore 운영 데이터는 건드리지 않는다.

완료 기준은 fixture 방에서 bid, timer extension, award, unsold, reconnect sync가 sequence 기준으로 통과하는 것이다.

### Phase 3. 공개 입찰 canary

운영 방 중 feature flag가 켜진 방에서만 `OPEN_ASCENDING` 공개 입찰 hot path를 Socket.IO로 처리한다. Firestore에는 bid history, system message, award result를 저장한다.

완료 기준은 동일 방에서 Firebase mode와 Socket mode를 각각 선택할 수 있고, archive와 schedule 계약이 깨지지 않는 것이다.

### Phase 4. Redis durable state

Socket 서버를 2대 이상 운영하거나 장애 복구 요구가 생기면 Redis를 도입한다. Redis에는 active room snapshot, sequence, timer, recent event log를 저장한다.

완료 기준은 Socket 서버 재시작 후 `auction:sync`로 경매 state가 복구되는 것이다.

### Phase 5. RTDB fanout 축소

Socket mode 방에서는 RTDB `auctionEvent`를 더 이상 primary fanout으로 사용하지 않는다. 필요하면 fallback 또는 운영 비교용으로만 유지한다.

완료 기준은 `useAuctionRealtime()`의 hot state 경로가 transport별로 명확히 분리되는 것이다.

## 성공 기준

- 모든 클라이언트가 `sequence` 기준 같은 경매 상태를 본다.
- `sequence` gap이 감지되면 `auction:sync`로 snapshot을 받아 회복한다.
- 입찰 request id가 중복 제출을 흡수한다.
- 입찰 수락 후 타이머 연장과 포인트 표시가 1개 state payload로 broadcast된다.
- Firestore archive, schedule, hall of fame 계약은 기존과 동일하게 유지된다.
- Socket server 장애 시 canary 방은 명확한 fallback 또는 pause 상태로 전환된다.

## 최종 판단

Hybrid 전환은 가능하고 장기적으로 경매 엔진 제어권을 높인다. 하지만 현재 코드베이스에서는 전송 계층 추가보다 상태 소유권 분리가 본 작업이다. 따라서 즉시 전면 전환하지 않고, 기준선 계측과 shadow mode를 먼저 진행한 뒤 공개 입찰 hot path만 canary로 옮기는 단계적 접근이 적절하다.
