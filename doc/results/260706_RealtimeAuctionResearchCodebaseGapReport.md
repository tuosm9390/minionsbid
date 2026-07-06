# 실시간 경매 리서치 문서 코드베이스 대조 보고서

작성일: 2026-07-06.

## 검토 자료와 접근 제한

검토 요청 자료는 다음 두 가지다.

| 자료                                                       | 확인 결과                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `https://chatgpt.com/s/t_6a4b00b3edcc8191a6541ea5361af9a6` | 브라우저에서는 로그인 shell만 표시되어 본문을 읽을 수 없었다. 이후 사용자가 본문을 대화에 직접 첨부해 내용을 검토했다.                                 |
| `C:\Users\tuosm\Downloads\deep-research-report (2).md`     | 전체 내용을 확인했다. WebSocket 중심 실시간 경매 설계, Pub/Sub, 원자적 입찰, 서버 권위 타이머, 재연결 복구, 보안, 관측성, 부하 테스트 권고가 핵심이다. |

따라서 이 보고서는 사용자가 첨부한 ChatGPT 본문, 접근 가능한 로컬 Markdown, 현재 코드베이스 근거를 함께 반영했다.

## 요약 결론

현재 Minions Bid는 로컬 리서치 문서가 권장하는 핵심 구조와 이미 상당히 잘 맞는다. Firestore가 정본 상태를 갖고, RTDB가 저지연 fanout과 presence를 담당하며, 공개 입찰 hot path는 Firestore transaction과 rules로 원자성과 권한을 확보한다. 서버 기준 타이머, revision 기반 수렴, 만료 복구, custom token, latency report까지 구현되어 있다.

첨부된 ChatGPT 본문은 Firebase를 버리지 말고 Socket.IO를 경매 전용 authoritative server 계층으로 추가하자는 결론이다. 이 권고는 장기 방향으로 타당하지만, 현재 코드베이스에 바로 적용하면 direct bid, Firestore rules, RTDB fanout, presence, archive 저장 계약을 함께 바꾸는 큰 작업이 된다. 따라서 즉시 전환보다 먼저 운영 부하와 지연 기준을 숫자로 확인하고, 기준 초과 시 Socket.IO hybrid로 단계 전환하는 것이 현실적이다.

보완이 필요한 영역은 두 층으로 나뉜다. 당장 필요한 것은 운영 신뢰성 보강이다. 이후 경매 규모나 지연 기준이 현재 Firebase 모델의 한계에 닿으면 Socket.IO authoritative engine을 별도 phase로 도입한다.

## 현재 구현이 잘 맞는 부분

| 리서치 권고         | 현재 코드베이스 근거                                                                                                                                                                             | 판단      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 서버 권위 상태 유지 | `rooms/{roomId}`의 `active_bid`, `current_player_id`, `timer_ends_at`, `auction_revision`을 정본으로 사용하는 계약이 `doc/AUCTION_REALTIME_CONTRACT.md`와 `doc/ARCHITECTURE.md`에 정리되어 있다. | 적합      |
| 원자적 입찰 처리    | `src/features/auction/api/placeBidClient.ts`가 Firestore `runTransaction`으로 room update와 bid history create를 한 transaction에서 처리한다.                                                    | 적합      |
| 최종 권한 방어      | `firestore.rules`의 `isBidUpdate()`와 `isBidHistoryCreate()`가 role, roomId, teamId, timer, revision, amount, roster slot을 검증한다.                                                            | 적합      |
| Pub/Sub fanout      | `src/features/auction/hooks/useAuctionRealtime.ts`가 RTDB `signals/{roomId}/auctionEvent`와 Firestore snapshot fallback을 함께 사용한다.                                                         | 적합      |
| 재연결 복구         | `last_auction_event`, `auction_revision`, RTDB `auctionEvents` history, room snapshot bid-shaped fallback이 구현되어 있다.                                                                       | 부분 적합 |
| 서버 기준 타이머    | `timer_ends_at` 정본과 `recoverExpiredAuction()` wake-up, 표시용 timerDuration 보정 제한이 구현되어 있다.                                                                                        | 적합      |
| latency 관측        | `src/features/auction/utils/latencyDebug.ts`와 `src/app/api/latency-report/route.ts`가 p50, p95, fallback count를 수집한다.                                                                      | 부분 적합 |
| 기능 검증           | Vitest, Playwright, Firebase Emulator E2E, multi-PC fixture가 존재한다.                                                                                                                          | 적합      |

## 첨부 ChatGPT 본문에 대한 코드베이스 기준 판단

첨부 본문의 핵심은 다음 구조다.

```text
Firebase = 인증, 영속 데이터, 일반 CRUD, 결과 저장
Socket.IO = 입찰 제출, 타이머 연장, 포인트 즉시 갱신, 방 브로드캐스트
Redis = 다중 Socket 서버와 active room state 저장
```

이 방향은 이론적으로 경매 도메인과 잘 맞는다. 특히 서버가 `sequence`, `currentBid`, `endsAt`, `participantPoints`를 단일 authoritative state로 결정한 뒤 Socket.IO room에 broadcast하는 구조는 경매 엔진 제어권을 명확히 만든다.

다만 현재 코드베이스는 단순한 `Client -> Firestore write -> onSnapshot -> Clients` 구조만은 아니다. `placeBidDirect()`가 Firestore transaction으로 room state와 bid history를 함께 쓰고, `firestore.rules`가 role, timer, revision, point balance, roster slot을 최종 검증한다. 이후 `broadcastBidEvent()` 계열 서버 액션과 RTDB `auctionEvent`, Firestore `last_auction_event`, RTDB `auctionEvents` 히스토리로 수렴한다. 즉 현재 구조의 authoritative 지점은 Socket 서버가 아니라 Firestore transaction과 rules다.

따라서 본문의 권고를 현재 프로젝트에 적용할 때 핵심 질문은 속도가 아니라 상태 결정 주체를 어디에 둘 것인지다.

| 선택지               | 상태 결정 주체                                  | 현재 코드 영향 | 판단                                                  |
| -------------------- | ----------------------------------------------- | -------------- | ----------------------------------------------------- |
| Firebase 유지        | Firestore transaction, rules, Server Action     | 최소           | 현재 운영 규모에서는 우선 유지 가능                   |
| Firebase + Socket.IO | Node Auction Server, Socket.IO sequence         | 큼             | 지연과 동시성 한계가 관측되면 가장 현실적인 전환안    |
| Supabase 재작성      | PostgreSQL transaction, Realtime 또는 별도 서버 | 매우 큼        | 신규 프로젝트라면 검토 가치가 있지만 현재는 비용이 큼 |

## Socket.IO 도입 시 예상 수정 범위

Socket.IO hybrid를 도입하면 새 서버를 추가하는 것보다 기존 경매 계약을 분리하는 작업이 더 크다.

| 영역            | 현재                                                              | Socket.IO hybrid에서 바뀔 점                                              |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 입찰 hot path   | `placeBidDirect()` Firestore transaction                          | `socket.emit("bid:submit")` 후 Auction Server가 검증과 broadcast          |
| 권한 검증       | Firebase custom token claim과 Firestore rules                     | Socket handshake에서 Firebase token 검증, 서버 내부 room role 검증        |
| 상태 순서       | `auction_revision`, `event_id`, RTDB event                        | server sequence 중심, 누락 감지 시 `auction:sync`                         |
| 타이머          | Firestore `timer_ends_at`, client wake-up, recover action         | Auction Server timer wheel 또는 per-room timer, snapshot sync             |
| 포인트와 roster | Firestore transaction과 rules                                     | 서버 메모리 또는 Redis state에서 즉시 차감, Firestore는 persistence       |
| fanout          | RTDB `auctionEvent`, `auctionEvents`, Firestore snapshot fallback | Socket.IO room broadcast, Redis adapter는 scale-out 시점                  |
| archive와 일정  | Firestore room/archive 정본                                       | Auction 종료 시 Firestore persistence contract 유지                       |
| 테스트          | Vitest, Playwright fixture, Firebase Emulator                     | Socket server integration, disconnect/reconnect, sequence gap 테스트 추가 |

## Socket.IO를 바로 넣기 전 선행 조건

Socket.IO를 추가하면 운영 서버, 배포, 인증, 장애 복구, 관측, 테스트 표면이 늘어난다. 그래서 다음 선행 조건을 충족한 뒤 진행하는 편이 안전하다.

1. 현재 Firebase 모델의 p95 입찰 전파 시간과 transaction 실패율을 측정한다.
2. 8팀장 bid burst, reconnect, RTDB 누락 상황을 자동 smoke로 고정한다.
3. `auction_revision`과 RTDB `auctionEvents` 히스토리 정책을 문서화한다.
4. direct bid idempotency key를 도입해 중복 제출 모델을 정리한다.
5. Socket.IO 전환 시 Firestore를 읽기 정본으로 계속 볼 필드와 보지 않을 필드를 나눈다.

이 선행 조건은 Socket.IO 전환을 미루기 위한 장치가 아니라, 전환 이후에도 그대로 필요한 경매 엔진 계약이다.

## 우선 보완 항목

### P0. 운영 부하와 지연 검증 게이트 추가

현재 Playwright는 기능 수렴 검증에는 강하지만 리서치 문서가 강조하는 동시 접속, bid burst, reconnect storm, p95 latency 기준을 자동으로 막는 게이트는 약하다. `latency_reports` 수집 경로는 있으나 CI나 수동 QA에서 명확한 합격 기준으로 쓰이는 부하 테스트 스크립트가 보이지 않는다.

권고안은 현재 규모에 맞춰 작게 시작하는 것이다. 예를 들어 8팀장, 30초 동안 연속 입찰, 1회 RTDB 이벤트 누락, 1회 reconnect를 포함하는 운영 smoke를 만들고 p95 end-to-end 800ms 이하 같은 기준을 둔다. 이후 10명, 100명 목표별 기준을 문서화한다.

관련 위치는 `playwright/`, `scripts/`, `src/app/api/latency-report/route.ts`, `doc/AUCTION_REALTIME_CONTRACT.md`다.

### P0. 이벤트 히스토리 보존 정책 명확화

현재 `useAuctionRealtime.ts`는 RTDB `signals/{roomId}/auctionEvents`를 읽어 revision 순서로 replay한다. 이는 로컬 Markdown의 missed event replay 권고와 방향이 맞다. 다만 보존 개수, TTL, cleanup, archive와의 관계, `lastEventId` 기반 부분 replay 계약이 문서상 명확하지 않다.

권고안은 `auctionEvents`를 최근 N개 또는 최근 M분으로 보존한다는 정책을 명시하고, reconnect 시 마지막 적용 revision 이후 이벤트만 적용한다는 계약을 테스트로 고정하는 것이다. 장기 감사는 RTDB가 아니라 Firestore bid history, messages, archive를 기준으로 두는 편이 맞다.

관련 위치는 `src/features/auction/hooks/useAuctionRealtime.ts`, `src/features/auction/api/auctionBidActions.ts`, `doc/AUCTION_REALTIME_CONTRACT.md`다.

### P1. direct bid idempotency 보강

`placeBidDirect()`는 매 호출마다 `bid-${estimatedNow}-${random}` 형태의 새 event id를 만든다. transaction과 rules가 잘못된 금액, 자기 팀 재입찰, revision 충돌은 막지만, 네트워크 재시도나 더블 클릭이 같은 사용자 의도를 같은 idempotency key로 묶는 구조는 아니다.

권고안은 버튼 클릭 단위 client request id를 먼저 만들고, direct bid와 fallback server action이 같은 id를 공유하게 하는 것이다. 같은 teamId, playerId, amount, request id가 재전송되면 이미 처리된 입찰로 응답하거나 안전하게 무시해야 한다. 이렇게 하면 latency marker, bid history, user double-submit 방어가 한 번에 좋아진다.

관련 위치는 `src/features/auction/hooks/useBiddingControl.ts`, `src/features/auction/api/placeBidClient.ts`, `src/features/auction/api/auctionBidActions.ts`, `firestore.rules`다.

### P1. latency report 인증과 오염 방지

`latency-report` route는 payload validation, TTL, source whitelist, 인스턴스 메모리 rate limit이 있다. 다만 운영 관측 엔드포인트가 비인증이므로 외부 요청이 임의 roomId로 metric을 오염시킬 수 있다. 리서치 문서의 관측성 권고는 좋지만, 관측 데이터가 의사결정 기준이 되려면 신뢰 경계도 필요하다.

권고안은 최소한 room auth cookie 또는 organizer token 검증을 요구하거나, client가 서버에서 발급받은 짧은 수명의 report token을 함께 보내게 하는 것이다. App Check를 도입한다면 이 endpoint도 적용 대상에 포함한다.

관련 위치는 `src/app/api/latency-report/route.ts`, `src/app/api/latency-report/__tests__/route.test.ts`, `doc/SECURITY.md`다.

### P1. room read 권한 세분화 계획 실행 여부 결정

`firestore.rules`는 room 단건 get과 teams, players, messages, bids read를 공개 허용하고, list는 제한한다. 현재 링크 기반 커뮤니티 앱과 archive UX에는 실용적이지만, 리서치 문서의 인증된 realtime channel 권고와 비교하면 read surface가 넓다. 기존 `doc/SECURITY.md`도 이 리스크를 이미 남겨두고 있다.

권고안은 당장 모든 read를 닫기보다 방 생성 옵션이나 운영 모드별로 단계화하는 것이다. 공개 뷰어가 필요한 방은 유지하고, 비공개 방은 custom token claim 기반 read로 좁히는 정책을 먼저 설계한다.

관련 위치는 `firestore.rules`, `database.rules.json`, `src/app/api/room-auth/firebase-token/route.ts`, `doc/SECURITY.md`다.

### P2. Firebase hot document 한계 기준 문서화

리서치 문서는 10명, 100명, 1,000명, 10,000명 수준별 아키텍처를 나눈다. 현재 구현은 bid마다 같은 room 문서의 `active_bid`, `timer_ends_at`, `auction_revision`을 갱신한다. 8팀장 커뮤니티 경매에는 적절하지만, bid burst가 커지면 Firestore 단일 문서 쓰기 병목이 먼저 한계가 될 수 있다.

권고안은 Redis, NATS, Kafka로 미리 옮기는 것이 아니라 Firebase 유지 기준을 숫자로 정하는 것이다. 예를 들어 동시 팀장 수, 초당 입찰 수, p95 latency, transaction abort 비율, Firestore write error율이 기준을 넘으면 hot state shard나 서버중계 WebSocket 검토로 넘어간다는 운영 의사결정 표를 문서화한다.

관련 위치는 `doc/ARCHITECTURE.md`, `doc/AUCTION_REALTIME_CONTRACT.md`, `doc/TECH_STATE_SNAPSHOT.md`다.

### P2. presence 정책과 자동 진행 정책 문서 최신화

리서치 문서는 reconnect와 실패 복구를 중요하게 본다. 현재 프로젝트는 과거에는 모든 팀장 presence를 강하게 요구했고, 최근 컨텍스트 노트에서는 presence/custom token 장애가 경매 진행을 막지 않도록 완화한 결정도 있다. 문서마다 표현이 조금 달라 운영자가 오해할 수 있다.

권고안은 현재 최종 정책을 한 문서에 고정하는 것이다. 시작 전 필수 연결 조건, 진행 중 끊김 처리, watchdog의 역할, 비공개 입찰에서 presence를 진단 정보로만 볼지 여부를 `doc/ARCHITECTURE.md`와 `doc/AUCTION_REALTIME_CONTRACT.md`에 맞춘다.

관련 위치는 `src/features/auction/hooks/usePresence.ts`, `src/features/auction/hooks/useAuctionPresenceGuard.ts`, `src/app/api/auction-watchdog/route.ts`, `doc/ARCHITECTURE.md`다.

### P2. 팀 배정 phase 계약 문서 보강

최근 구현으로 모든 선수 경매 종료 후 `팀 배정` phase가 생겼고, 확정 후에만 `경매 종료`와 archive, schedule로 넘어간다. `doc/AUCTION_REALTIME_CONTRACT.md`에는 desired team assignment가 hot state와 RTDB event를 건드리지 않는다고 정리되어 있어 방향은 맞다. 다만 `doc/ARCHITECTURE.md`의 scene 설명과 운영 흐름은 새 phase를 더 명확히 반영할 필요가 있다.

권고안은 `assignment` scene, `team_assignment.status === "CONFIRMED"` 종료 조건, archive schedule gate를 architecture 흐름도에 반영하는 것이다.

관련 위치는 `doc/ARCHITECTURE.md`, `doc/AUCTION_REALTIME_CONTRACT.md`, `src/features/auction/components/AuctionBoard.tsx`, `src/features/schedules/api/scheduleActions.ts`다.

### P2. Socket.IO hybrid 전환 기준과 canary 계획 추가

첨부 본문의 Firebase + Socket.IO + Redis 구조는 장기적으로 타당한 후보지만, 현재 코드베이스에서는 전환 기준이 먼저 필요하다. 기준 없이 도입하면 동일한 상태를 Firestore listener와 Socket.IO가 동시에 덮어쓰는 충돌이 생길 수 있다.

권고안은 다음 canary 순서다.

1. Socket.IO 서버를 먼저 읽기 전용 shadow mode로 붙여 bid latency와 sequence 설계를 검증한다.
2. fixture 방 또는 운영과 분리된 테스트 방에서만 `bid:submit`을 Socket.IO로 처리한다.
3. Firestore는 persistence만 담당하고 클라이언트는 진행 중 hot state를 Socket.IO state로만 교체한다.
4. Redis는 서버 2대 이상 또는 active room state 유실 복구 요구가 생긴 시점에 추가한다.
5. 안정화 후 RTDB `auctionEvent` fanout을 제거하거나 fallback 전용으로 격하시킨다.

관련 위치는 새 패키지 또는 `auction-server/`, `src/features/auction/api/placeBidClient.ts`, `src/features/auction/hooks/useAuctionRealtime.ts`, `doc/AUCTION_REALTIME_CONTRACT.md`다.

## 새 기술 도입에 대한 판단

로컬 Markdown은 WebSocket, Redis Pub/Sub, message broker, event sourcing를 일반적인 경매 아키텍처 권고로 제시한다. 첨부 ChatGPT 본문은 그중 Socket.IO를 현실적인 hybrid 전환안으로 제안한다. 현재 코드베이스에서는 Firebase가 이미 WebSocket 계열 managed realtime, transaction, security rules, managed fanout을 제공하지만, 상태 결정 주체가 Firestore transaction과 rules에 묶여 있다.

따라서 판단은 다음과 같다.

- 지금 당장 전체 경매를 Socket.IO로 옮기는 것은 비용이 크다.
- Redis, Kafka, NATS는 현재 9명 이상 경매 기준에서는 과하다.
- Socket.IO는 단순 속도 개선책이 아니라 경매 엔진을 중앙화하는 구조 변경으로 봐야 한다.
- 실제 지연, transaction abort, fanout 누락이 기준을 넘는다면 Firebase + Socket.IO hybrid가 Supabase 재작성보다 현실적인 다음 단계다.

기술 전환은 다음 조건 중 일부가 실제로 관측될 때 검토하는 것이 적절하다.

- Firestore room hot document transaction abort가 반복된다.
- 8팀장 또는 목표 운영 규모에서 p95 bid propagation이 합의 기준을 지속적으로 초과한다.
- RTDB fanout 누락이 `last_auction_event`와 `auctionEvents` replay로도 복구되지 않는다.
- 운영자가 audit replay, long-term event sourcing, cross-region scale을 실제 요구한다.

## 선택지 점수표

현재 코드베이스 기준의 상대 점수다.

| 항목                    | Firebase 유지 | Firebase + Socket.IO | Supabase 재작성 |
| ----------------------- | ------------: | -------------------: | --------------: |
| 단기 개발 비용          |             5 |                    3 |               1 |
| 기존 코드 재사용        |             5 |                    4 |               1 |
| 실시간 경매 제어권      |             3 |                    5 |               4 |
| 운영 인프라 단순성      |             5 |                    3 |               3 |
| 장기 데이터 모델 적합성 |             3 |                    3 |               5 |
| 장애 복구 설계 자유도   |             3 |                    5 |               4 |
| 현재 추천도             |             4 |                    3 |               1 |

점수만 보면 Firebase 유지가 현재는 우세하다. 다만 경매가 더 커지고 hot path 문제가 실제로 관측되면 Firebase + Socket.IO의 추천도가 올라간다.

## 권장 실행 순서

1. `auctionEvents` 보존 정책, presence 정책, team assignment phase를 문서 계약에 반영한다.
2. 8팀장 bid burst와 reconnect를 포함하는 운영 latency smoke를 만들고 p95 기준을 둔다.
3. direct bid idempotency key를 도입하고 fallback server action까지 같은 request id를 공유한다.
4. `latency-report`에 room auth 또는 짧은 수명 report token 검증을 추가한다.
5. private room read tightening 정책을 설계하고 rules smoke를 추가한다.
6. Firebase 유지 기준과 Socket.IO hybrid 전환 기준을 숫자로 문서화한다.
7. 기준 초과 시 Socket.IO shadow mode와 fixture canary 계획을 별도 구현 계획서로 작성한다.

## 최종 판단

현재 코드베이스의 방향은 로컬 리서치 문서와 충돌하지 않는다. 첨부 ChatGPT 본문의 Firebase + Socket.IO 권고도 장기 전환 후보로 타당하다. 다만 지금 바로 도입할 근거는 성능 문제가 실제로 계측됐는지에 달려 있다.

따라서 단기 결론은 Firebase 기반 구조를 유지하면서 운영 기준을 강화하는 것이다. 중기 결론은 p95 지연, transaction abort, fanout 복구 실패가 기준을 넘을 경우 Firebase + Socket.IO hybrid로 경매 hot path만 분리하는 것이다. Supabase 재작성은 신규 프로젝트라면 강한 후보지만, 현재 코드베이스에서는 마지막 선택지에 가깝다.
