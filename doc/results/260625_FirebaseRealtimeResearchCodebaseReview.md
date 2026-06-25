# Firebase 실시간 설계 리서치 코드베이스 대조 보고서

작성일: 2026-06-25
대상 문서: `C:\Users\tuosm\Downloads\deep-research-report.md`
대상 코드베이스: Minions Bid, `D:\development\league-auction`

## 결론

외부 리서치 보고서의 핵심 권고는 “Firestore를 영속 정본 상태로, Realtime Database를 presence와 저지연 fanout으로 분리하라”는 것이다. 현재 Minions Bid의 경매 아키텍처는 이 권고를 이미 강하게 반영하고 있다. `doc/ARCHITECTURE.md:10`은 Firestore room 문서를 경매 hot state의 정본으로 두고 RTDB를 fanout 채널로 둔다고 명시하며, `doc/AUCTION_REALTIME_CONTRACT.md:5`도 같은 계약을 “빠르게 보이는 화면”이 아니라 “같은 진실을 빠르게 보는 화면”으로 정의한다.

다만 현재 구현은 일반적인 Firebase 권고보다 더 구체적인 운영 목표를 갖고 있다. 방 단위 실제 동시 사용자는 주최자 1명과 팀장 8명 수준이고, 입찰 체감 목표는 p95 500ms 안팎이다. 따라서 “대규모 불특정 다수 실시간 서비스”라는 리서치 보고서의 일반론을 그대로 적용하기보다, 현재 규모에서는 기존 하이브리드 구조를 유지하면서 공개 read 범위, custom token 의존성, 단일 room 문서 hot spot, 운영 복구 drill을 보강하는 것이 가장 현실적이다.

## 현재 코드베이스가 리서치 권고와 잘 맞는 부분

### 1. Firestore와 RTDB의 역할 분리가 명확하다

현재 경매 정본은 Firestore `rooms/{roomId}`의 `active_bid`, `current_player_id`, `timer_ends_at`, `auction_revision`, `last_auction_event`가 가진다. 이 계약은 `doc/AUCTION_REALTIME_CONTRACT.md:9`와 `doc/ARCHITECTURE.md:60`에 명시되어 있고, 실제 구독 훅도 room snapshot을 최종 수렴 경로로 사용한다.

RTDB는 `signals/{roomId}/auctionEvent`, `signals/{roomId}/auctionEvents`, `signals/{roomId}/latestMessage`, `presence/{roomId}` 같은 저지연 전파 경로로 쓰인다. 서버 발행 함수 `publishAuctionEvent()`는 `src/features/auction/api/auctionFlowShared.ts:124`에서 최신 이벤트를 쓰고, 이벤트 히스토리는 `src/features/auction/api/auctionFlowShared.ts:127`에서 fire-and-forget으로 분리한다. 이 구조는 리서치 보고서의 “RTDB는 ephemeral fanout, Firestore는 durable state” 권고와 잘 맞는다.

### 2. RTDB 이벤트 유실을 Firestore snapshot으로 회복한다

리서치 보고서는 RTDB를 저지연 채널로 쓸 경우 정본 복구 경로가 필요하다고 본다. 이 프로젝트는 그 부분이 상당히 잘 설계되어 있다. `useAuctionRealtime`은 `last_auction_event`와 `auction_revision`을 기준으로 RTDB 이벤트를 놓친 화면을 회복하고, direct bid의 `last_auction_event`가 늦거나 실패해도 bid-shaped room snapshot만으로 `liveBid`와 `timerEndsAt`을 투영한다. 관련 구현은 `src/features/auction/hooks/useAuctionRealtime.ts:398`, `src/features/auction/hooks/useAuctionRealtime.ts:479`, `src/features/auction/hooks/useAuctionRealtime.ts:504`에 있다.

특히 event 없는 room snapshot이 `auctionEventRevision`을 올리지 않는 처리는 좋은 설계다. 같은 revision의 RTDB 낙찰·유찰 이벤트가 뒤늦게 도착해도 막지 않기 때문이다. 이는 리서치 보고서의 “eventual/custom merge를 애플리케이션이 설계해야 한다”는 지점에 대한 실제 답이다.

### 3. 입찰 hot path는 성능과 보안을 함께 고려했다

입찰은 Vercel Server Action 왕복을 줄이기 위해 `placeBidDirect()`가 Firestore client transaction을 먼저 수행한다. 구현은 `src/features/auction/api/placeBidClient.ts:90`에서 `runTransaction`을 사용하고, `auction_revision`을 정확히 1 증가시키며 bid history를 같은 transaction에 쓴다. 서버 후속 전파는 `broadcastBidEvent()`가 처리하고, Firestore 정본 상태와 기대 revision이 맞는 경우에만 RTDB `BID_PLACED` 이벤트를 발행한다. 관련 검증은 `src/features/auction/api/auctionBidActions.ts:51`과 `src/features/auction/api/auctionBidActions.ts:71`에 있다.

보안 경계도 단순히 클라이언트를 믿지 않는다. `firestore.rules:31`의 `isBidUpdate()`는 LEADER claim, roomId, teamId, 변경 가능 필드, 현재 선수, 금액 증가, 자기 팀 재입찰 금지, revision 증가, 타이머 갱신 범위, 포인트 잔액, 팀 정원을 검사한다. `firestore.rules:70`의 `isBidHistoryCreate()`는 `getAfter()`로 같은 transaction의 room `active_bid.event_id`와 bid 문서 id가 일치하는지 확인한다. 리서치 보고서가 말한 “Security Rules가 API gateway 일부를 대체한다”는 현실을 잘 반영한 편이다.

### 4. 비공개 입찰은 서버 전용 경계를 잘 지킨다

비공개 입찰 제출 금액은 공개 전까지 클라이언트가 직접 읽거나 쓰면 안 된다. 현재 rules는 `rooms/{roomId}/sealed_bid_rounds`와 `submissions`를 모두 `allow read, write: if false`로 막는다. 이 계약은 `firestore.rules:129`에 있고, 실제 제출은 `submitSealedBid()` 서버 액션이 `src/features/auction/api/auctionSealedBidActions.ts:104`에서 Admin SDK로 저장한다.

이 부분은 리서치 보고서보다 현재 코드베이스가 더 구체적으로 잘 작업된 영역이다. 보고서는 일반적으로 “민감한 영속 데이터는 Firestore와 서버 검증”을 권고하지만, 이 프로젝트는 공개 입찰과 비공개 입찰의 실시간 이벤트 계약을 분리하고, 타이머 중 제출 여부와 금액을 fanout하지 않는 정책까지 문서화했다.

### 5. Presence 구현은 Firebase의 강점을 제대로 사용한다

`usePresence`는 LEADER와 ORGANIZER만 자기 presence를 RTDB에 쓰고, `onDisconnect().remove()`로 연결 종료 시 자동 정리를 등록한다. 구현은 `src/features/auction/hooks/usePresence.ts:88`과 `src/features/auction/hooks/usePresence.ts:97`에 있다. 전체 presence 구독은 모든 역할이 수행하고, 50ms debounce로 동시 입장 때 React state 갱신 폭주를 줄인다. 관련 구현은 `src/features/auction/hooks/usePresence.ts:105`와 `src/features/auction/hooks/usePresence.ts:135`에 있다.

리서치 보고서가 RTDB presence를 Firestore보다 적합한 기능으로 본 점과 현재 구조는 일치한다. 또한 `doc/PRESENCE_CUSTOM_TOKEN_REVIEW.md:150`은 RTDB `onDisconnect()`와 custom token 기반 presence를 유지하는 결정을 이미 정리해 두었다.

### 6. 운영 검증 표면이 일반 보고서보다 구체적이다

현재 프로젝트는 `package.json:12`부터 `package.json:28`까지 경매 E2E, 8팀장 Emulator E2E, room rules smoke, room auth secret audit, backfill, migration 스크립트를 갖고 있다. README도 Firebase Auth, Firestore, RTDB Emulator를 함께 붙인 8팀장 검증을 설명한다. `README.md:144`와 `playwright/auction-eight-leaders-emulator.spec.ts:235`가 그 표면이다.

운영 지연 관측도 별도 API가 있다. `src/app/api/latency-report/route.ts:1`은 클라이언트 경매 latency report를 `latency_reports`에 저장하고, `src/app/api/latency-report/route.ts:21`은 30일 TTL 기준 필드를 둔다. 운영 체크리스트는 `p95_end_to_end_ms <= 500ms`, `fallback_count == 0`을 통과 기준으로 삼는다. 관련 내용은 `doc/results/260612_LiveAuctionOpsChecklist.md:51`과 `doc/results/260612_LiveAuctionOpsChecklist.md:100`에 있다.

## 보완해야 할 점과 설계 리스크

### 1. RTDB `signals`와 `presence` read가 공개다

가장 우선순위가 높은 보완점이다. `database.rules.json:3`의 `presence/{roomId}`와 `database.rules.json:13`의 `signals/{roomId}`는 `.read: true`다. roomId를 알면 접속자 역할 목록, 실시간 경매 이벤트, 최신 시스템 메시지를 읽을 수 있다. Firestore도 `rooms/{roomId}` 단건과 하위 `teams`, `players`, `messages`, `bids` read가 공개에 가깝다. 이 상태는 `firestore.rules:105`, `firestore.rules:113`, `firestore.rules:118`, `firestore.rules:123`, `firestore.rules:128`에 나타난다.

현재 서비스가 내부 공유형 경매 도구라면 즉시 치명적이라고 단정할 수는 없다. 하지만 리서치 보고서의 보안 모델 기준으로는 “roomId가 권한”인 구조가 된다. 기존 개선 계획도 이 문제를 이미 S5로 기록했고, `doc/results/260611_CodebaseImprovementPlan.md:111`은 `signals`와 `presence` 읽기에 최소 `auth != null`을 요구하는 방향을 제안한다.

권고는 단계적이다. 먼저 VIEWER도 custom token 또는 익명 Firebase Auth를 받는지 결정하고, 그 다음 RTDB read를 `auth.token.roomId == $roomId` 기준으로 좁힌다. Firestore room 하위 read도 최소한 `request.auth.token.roomId == roomId` 또는 viewer token claim 기반으로 제한할 수 있는지 검토한다.

### 2. Custom token route가 입찰과 presence의 공통 장애점이다

현재 direct bid는 Firestore Security Rules의 LEADER claim이 필요하고, presence write도 RTDB auth uid가 필요하다. `/api/room-auth/firebase-token`은 room token을 검증한 뒤 custom token을 발급한다. 구현은 `src/app/api/room-auth/firebase-token/route.ts:31`, `src/app/api/room-auth/firebase-token/route.ts:43`, `src/app/api/room-auth/firebase-token/route.ts:72`에 있다.

이 구조는 보안상 타당하지만, 장애 영향 범위가 크다. `doc/PRESENCE_CUSTOM_TOKEN_REVIEW.md:84`도 custom token 발급 API가 장애를 내면 direct bid와 presence가 동시에 영향을 받는 단일 장애점이라고 정리한다. 최근 운영 import crash를 고친 이력이 있다는 점을 감안하면, 이 경로는 단순 기능 테스트보다 운영 가용성 관점에서 계속 봐야 한다.

권고는 custom token 제거가 아니다. 현재 direct bid 구조에서는 claim 기반 auth가 필요하다. 대신 token route에 대한 별도 smoke, 운영 synthetic check, 에러율 알림, presence 인증 장애와 실제 미접속을 UI에서 분리하는 진단을 우선해야 한다.

### 3. 단일 room 문서 hot state는 현재 규모에는 맞지만 확장 한계가 분명하다

경매의 핵심 상태가 `rooms/{roomId}` 단일 문서에 모인다. 리서치 보고서가 말한 Firestore hot document 문제에 해당한다. 현재 실제 동시 입찰자는 8팀장 수준이라 transaction 직렬화가 기능적으로는 맞다. 하지만 더 큰 방, 자동 입찰, 잦은 재입찰 같은 패턴으로 확장되면 병목이 된다.

이 리스크는 이미 `load-tests/LOAD_TEST_PLAN.md:37`과 `load-tests/LOAD_TEST_PLAN.md:160`에 기록되어 있다. 다만 현재 부하 리허설은 로컬 production build 중심이고, 문서도 실 Firebase RTDB fanout과 Vercel cold start는 미측정이라고 명시한다. 관련 내용은 `load-tests/LOAD_TEST_PLAN.md:487`에 있다.

권고는 지금 구조를 갈아엎는 것이 아니다. 현재 방 크기에서는 단일 문서 transaction이 오히려 공정하고 단순하다. 다만 운영 목표가 “팀장 8명”을 넘어가면 `active_bid`를 별도 shard나 CAS 문서로 분리하는 설계 검토가 필요하다.

### 4. RTDB fanout이 중복 경로를 갖고 있어 비용과 복잡도가 증가한다

현재 경매 이벤트는 RTDB overwrite node인 `auctionEvent`, 히스토리 node인 `auctionEvents/{eventId}`, Firestore `last_auction_event`, 시스템 메시지 `latestMessage`로 나뉜다. 이 구조는 복구성에는 좋지만, 이벤트 하나가 여러 쓰기로 증폭된다. `load-tests/LOAD_TEST_PLAN.md:26`과 `load-tests/LOAD_TEST_PLAN.md:68`도 이중·삼중 쓰기 비용을 지적한다.

이미 일부는 개선되어 있다. `publishAuctionEvent()`는 `auctionEvent`만 await하고 히스토리는 fire-and-forget으로 처리한다. 관련 구현은 `src/features/auction/api/auctionFlowShared.ts:124`와 `src/features/auction/api/auctionFlowShared.ts:127`에 있다. 따라서 현재 문제는 즉시 장애라기보다 운영 비용과 추적 복잡도다.

권고는 히스토리 쓰기 유지 여부를 latency report 기반으로 결정하는 것이다. `room-fallback` 비율이 낮고 `auctionEvents` 히스토리 재전송이 실제 복구에 거의 쓰이지 않는다면, 보존 범위나 TTL을 더 줄일 수 있다.

### 5. 일정 관리의 `match_days.matches[]`는 현재 운영에는 충분하지만 동시 편집에는 약하다

리서치 보고서는 작은 독립 문서 모델을 권장한다. 일정 기능은 현재 `match_days/{dateKey}` 문서 안의 `matches[]` 배열을 transaction으로 통째 갱신한다. 실제 구현은 `src/features/schedules/api/scheduleActions.ts:741`부터 transaction을 시작하고, `src/features/schedules/api/scheduleActions.ts:818`에서 날짜 문서를 set하며 revision을 증가시킨다.

이 구조는 현재 운영자 수가 적고 날짜 단위 편집이 중심이면 단순하고 좋다. 그러나 경기 행 단위 동시 수정이 늘어나면 배열 전체 갱신이 충돌 단위를 키운다. 이 리스크는 `doc/results/260427_LeagueScheduleArchitectureDecision.md:13`에 이미 기록되어 있고, 현재 채택안도 `match_days` 유지와 transaction/revision 보강이다.

권고는 운영 지표 기반 재검토다. 같은 날짜를 여러 운영자가 동시에 편집하거나 공개 링크 확산으로 관리자 경계가 더 중요해지면, `match_days/{dateKey}/matches/{matchId}` 문서 분리 또는 match-level patch API로 바꾸는 것이 맞다.

### 6. App Check와 재해복구는 코드베이스 안에서 충분히 구체화되어 있지 않다

리서치 보고서는 App Check, 백업, PITR, restore drill을 운영 체크리스트의 일부로 본다. 현재 코드베이스에는 App Check 초기화 코드가 검색되지 않았고, Firestore scheduled backup, PITR, RTDB daily backup, restore drill 문서도 구체적인 운영 절차로 보이지 않는다. 반면 latency와 watchdog 운영 문서는 잘 정리되어 있다.

권고는 실전 경매 관점의 최소 운영 문서 추가다. `FIRESTORE_DATABASE_ID` named database 기준 backup 설정 여부, RTDB backup 여부, 결과 아카이브 복구 절차, restore drill 주기를 `doc/SECURITY.md`나 운영 체크리스트에 넣는 것이 좋다. App Check는 인증 대체재가 아니므로, read rules를 좁힌 뒤 abuse 감소용으로 별도 적용 여부를 결정하는 편이 안전하다.

## 현재 코드베이스가 리서치 보고서보다 더 잘 작업된 부분

1. `auction_revision`을 timestamp가 아니라 단조 counter로 고정한 점이 좋다. 리서치 보고서는 버전 필드 필요성을 말하지만, 이 프로젝트는 이벤트 적용 규칙과 migration policy까지 계약화했다. 근거는 `doc/AUCTION_REALTIME_CONTRACT.md:44`와 `src/features/auction/utils/auctionRealtime.ts:251`이다.

2. direct bid의 보안 검증이 구체적이다. 단순 role check가 아니라 금액, 현재 선수, 자기 팀 최고가 여부, 타이머 갱신 허용 범위, 포인트 잔액, 팀 정원, bid history id까지 rules에서 검증한다. 근거는 `firestore.rules:31`부터 `firestore.rules:83`까지다.

3. RTDB 이벤트 유실 복구 경로가 실제 코드로 구현되어 있다. Firestore room snapshot, `last_auction_event`, RTDB event history, bid-shaped snapshot fallback이 각자 역할을 갖고 있다. 근거는 `src/features/auction/hooks/useAuctionRealtime.ts:479`, `src/features/auction/hooks/useAuctionRealtime.ts:504`, `src/features/auction/hooks/useAuctionRealtime.ts:729`다.

4. 비공개 입찰의 정보 비공개 경계가 명확하다. 제출 금액을 클라이언트 구독 대상에서 제거하고 서버 액션으로만 다루며, 공개 전 RTDB 이벤트도 발행하지 않는다. 근거는 `doc/AUCTION_REALTIME_CONTRACT.md:118`과 `firestore.rules:129`다.

5. 테스트 표면이 실제 운영 시나리오에 가깝다. 8팀장 Emulator E2E는 Firebase Auth, RTDB presence, Firestore bids를 함께 검증한다. 근거는 `playwright/auction-eight-leaders-emulator.spec.ts:235`와 `playwright/auction-eight-leaders-emulator.spec.ts:322`다.

6. 운영 관측이 단순 로그가 아니라 p95와 fallback count 중심으로 설계되어 있다. 근거는 `src/app/api/latency-report/route.ts:92`, `doc/results/260612_LiveAuctionOpsChecklist.md:56`, `doc/results/260612_LiveAuctionOpsChecklist.md:100`이다.

## 우선순위별 권고

| 우선순위 | 항목 | 이유 | 제안 검증 |
|---|---|---|---|
| P0 | RTDB `presence`와 `signals` read 제한 설계 | roomId 유출 시 접속자와 경매 이벤트가 읽힌다 | RTDB rules unit 또는 emulator smoke 추가 |
| P0 | custom token route synthetic check | direct bid와 presence의 공통 장애점이다 | 400, 403, 정상 LEADER 200, cross-team 403 자동 확인 |
| P1 | Firestore room 하위 read를 viewer/leader claim 기반으로 좁힐지 결정 | 현재 roomId 기반 공개 read가 남아 있다 | `smoke:room-rules`에 read 권한 케이스 확장 |
| P1 | 실 Firebase/Vercel 대상 latency gate 정례화 | 로컬 prod 부하는 좋아도 RTDB fanout과 cold start는 별도다 | 운영 스모크 후 `latency_reports` p95와 fallback count 확인 |
| P1 | backup, PITR, restore drill 운영 문서화 | 리서치 보고서의 DR 관점이 현재 문서에 약하다 | named DB restore rehearsal 절차 문서 |
| P2 | `match_days.matches[]` 재검토 트리거 유지 | 현재는 충분하지만 동시 편집 증가 시 취약하다 | 운영자 수, 같은 날짜 동시 편집 빈도 기록 |
| P2 | RTDB 이벤트 히스토리 보존 범위 조정 | 복구성은 좋지만 write amplification이 있다 | `source_counts.room-fallback`, history replay 빈도 분석 |

## 최종 판단

현재 코드베이스의 큰 방향은 리서치 보고서의 권장안과 일치한다. 특히 경매 핵심 경로는 Firestore 정본, RTDB 저지연 fanout, custom token 기반 direct bid, revision 기반 수렴, Playwright 중심 검증까지 갖춰져 있어 일반적인 Firebase 실시간 설계보다 더 구체적으로 구현되어 있다.

보완의 초점은 아키텍처 전환이 아니라 경계 강화다. RTDB와 Firestore read 범위를 room token claim 기반으로 좁히고, custom token route와 실 Firebase latency를 운영 게이트로 고정하며, 백업·복구 절차를 문서화하면 현재 설계를 유지한 채 리서치 보고서가 우려한 보안·운영 리스크를 상당 부분 줄일 수 있다.
