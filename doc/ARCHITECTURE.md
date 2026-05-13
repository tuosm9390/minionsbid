# 아키텍처 가이드 — Minions Bid

작성일: 2026-03-24
최근 갱신: 2026-05-13
대상: Firebase 기반 실시간 경매 툴

---

## 1. 개요
Minions Bid는 초저지연 실시간 동기화가 핵심인 경매 애플리케이션입니다. **Firestore room 문서가 현재 경매 hot state의 정본**이고, **Firebase Realtime Database**는 그 정본을 빠르게 fanout하는 저지연 채널입니다. 대부분의 상태 변경은 **Next.js Server Actions**와 Firebase Admin SDK가 처리하되, 입찰 hot path는 2026-05-06부터 Firestore 클라이언트 SDK 직접 transaction을 1차 경로로 사용합니다.

---

## 2. 데이터 아키텍처

### 데이터베이스 레이어
- **Firestore**: 방 설정, 선수 정보, 팀 구성, 그리고 현재 경매 canonical state 저장.
- **Realtime Database (RTDB)**: 최신 경매 이벤트와 실시간 메시지를 모든 클라이언트에 빠르게 fanout.

### 데이터 흐름
1. **Mutation**: 실시간 공개 입찰은 `placeBidDirect()`가 Firestore 클라이언트 SDK transaction으로 먼저 시도하고, 실패하면 기존 Server Action `placeBid`로 fallback한다. 비공개 입찰은 direct bid 예외를 사용하지 않고 전용 Server Action으로 제출/잠금/공개/확정을 처리한다. 추첨/시작/일시정지/낙찰/유찰/재경매 등 운영 액션은 Server Action을 경유한다.
2. **Validation**: direct bid는 Firebase custom token claim과 `firestore.rules`의 `isBidUpdate()` / `isBidHistoryCreate()`가 최종 검증한다. Server Action 경로는 서버 transaction 안에서 권한, 포인트 잔액, 타이머 유효성, 현재 선두 상태를 검증한다.
3. **Write**: Firestore room canonical state와 필요한 하위 문서를 업데이트한다.
4. **Broadcast**: 서버 액션 경로는 RTDB `auctionEvent`를 동기 발행한다. direct bid 경로는 Firestore snapshot을 1차 전파로 사용하고, 비동기 `broadcastBidEvent` Server Action이 RTDB 이벤트 + `last_auction_event` 저장 + 시스템 메시지를 뒤따라 전파한다.
5. **Heal**: RTDB 이벤트를 놓친 화면은 Firestore room snapshot의 `last_auction_event`와 `auction_revision`으로 빠르게 복구한다.
6. **UI Update**: `useAuctionRealtime` 훅이 새로운 상태를 감지하고 Zustand 스토어 업데이트 → UI 리렌더링.

### 일정 관리 서브시스템
- **스토리지**: `league_schedules`, `match_days`, `hall_of_fame`는 Firestore를 사용한다.
- **권한 경계**: `/league-schedule`은 공개 경로를 유지하지만 일정 생성/저장/결과 등록/삭제/종료는 모두 Server Action의 관리자 가드를 통과해야 한다.
- **쓰기 일관성**: `saveLeagueScheduleDay`, `registerLeagueMatchResult`, `completeLeagueSchedule`는 transaction과 `revision`을 사용한다.
- **로스터 연결**: 스케줄 문서는 `rosterSourceType` / `rosterSourceId`를 저장하고, 로스터 조회는 전체 스캔보다 직접 조회를 우선한다.
- **결정 기록**: 현재 채택안과 재검토 트리거는 `doc/results/260427_LeagueScheduleArchitectureDecision.md`를 기준으로 본다.

---

## 3. 프론트엔드 아키텍처

### 씬 시스템 (Scene System)
`AuctionBoard`는 복잡한 조건부 렌더링을 피하기 위해 **씬(Scene)** 개념을 사용합니다.
- `AuctionWaitingState`: 참여자 대기 및 연결 상태 확인.
- `LotteryAnimation`: 다음 경매 선수 추첨 (슬롯머신 애니메이션).
- `ActiveAuction`: 실시간 타이머 및 입찰 컨트롤 활성화.
- `SealedBidBoard`: 비공개 입찰 제출 중, 잠금, 점수공개 카드 애니메이션을 담당.
- `AuctionResultModal`: 낙찰 결과 발표 및 팀 배정 확인.

### 컴포넌트 레이어링
1. **Core (lib)**: Firebase SDK 초기화, 유틸리티 함수.
2. **Hooks (features/auction/hooks)**: 실시간 구독(`useAuctionRealtime`), 비즈니스 로직 캡슐화(`useAuctionBoard`).
3. **Store (features/auction/store)**: 전역 경매 상태 관리 (Zustand).
4. **UI Elements**: 아토믹 단위의 픽셀 컴포넌트 (Button, Box, Badge).

---

## 4. 실시간 동기화 전략

### 입찰 (Bidding)
- 경매 정답은 room 문서의 `active_bid`, `current_player_id`, `timer_ends_at`, `auction_revision`이 가집니다.
- 클라이언트는 local optimistic UI를 허용하지만, 최종 판정은 Firestore transaction commit 결과가 덮어씁니다.
- 입찰 hot path는 `placeBidDirect()`의 클라이언트 직접 transaction이며, 보안은 custom token claim과 Firestore rules가 담당합니다.
- direct bid 실패 시 기존 Server Action `placeBid`로 fallback하여 호환성과 복구 경로를 유지합니다.
- `bids` 컬렉션은 현재 선두 판정이 아니라 history / audit 용도로 사용합니다.
- 디버그/검증 계층에서는 `eventId` 기반 latency marker를 사용해 `client-response`, `rtdb`, `room-fallback` 적용 시점을 추적합니다.

### 비공개 입찰 (Sealed Bid)
- 방 메타의 `auction_mode`가 `SEALED_BID`일 때만 활성화된다. 값이 없으면 기존 공개 입찰인 `OPEN_ASCENDING`으로 취급한다.
- 비공개 입찰은 `active_bid`, `BID_PLACED`, `placeBidDirect()`를 사용하지 않는다.
- 제출 데이터는 `rooms/{roomId}/sealed_bid_rounds/{roundId}/submissions/{teamId}`에 저장하고, 타이머 중에는 금액과 제출 여부를 다른 클라이언트에 fanout하지 않는다.
- room hot state의 `sealed_bid_*` 필드는 라운드 phase, 최소 금액, 재입찰 대상 팀, 공개 카드 결과를 표현한다.
- `SEALED_BID_REVEALED`는 공개 결과만 확정한다. 선수 SOLD/UNSOLD와 팀 포인트 차감은 카드 애니메이션 완료 후 `SEALED_BID_AWARDED`에서 확정한다.
- 최고가 동점이면 같은 선수에 대해 최고 동점 팀만 새 비공개 재입찰 라운드를 시작하고, 직전 최고 금액을 최소 금액으로 사용한다.

### 타이머 (Timer)
- 서버의 `timerEnds_at` 타임스탬프를 기준으로 각 클라이언트가 로컬에서 카운트다운을 수행합니다.
- organizer는 항상 경매에 참여한다는 운영 가정을 둡니다.
- 팀장 연결이 끊기면 organizer presence guard가 경매를 즉시 일시정지하고, 재연결 시 organizer가 다시 재개합니다.
- `/api/auction-watchdog`는 선택적 backup route로만 유지합니다. 실시간 경매 품질이나 500ms 입찰 SLA의 핵심 메커니즘은 아닙니다.

### 관측 (Observability)
- representative bid 전파 품질은 DOM 변화만이 아니라 `eventId` 기반 latency marker로도 본다.
- fixture 경로는 `appliedAt - clickedAt <= 500ms`를 직접 검증한다.
- Server Action fallback 경로는 네트워크 편차를 고려해 `client-response -> rtdb` 또는 `client-response -> room-fallback`의 동일 `eventId` correlation을 확인한다.
- direct bid 경로는 현재 Firestore commit/snapshot 전파 시간을 우선 본다. direct bid의 canonical `eventId` 반환/marker 연결은 운영 latency 관측 체계 도입 시 보강 대상이다.

---

## 5. 보안 모델
- **Next.js Server Actions**: 운영 액션과 대부분의 데이터 변경은 서버를 경유합니다.
- **Direct Bid Exception**: 입찰 hot path만 클라이언트 Firestore transaction을 허용하며, custom token claim과 Firestore rules가 역할/방/팀/금액/타이머/잔액을 검증합니다.
- **Input Validation**: API 엔드포인트와 Server Action 경계에서 입력을 검증하고 일반화된 사용자 오류 메시지를 유지합니다.
- **Strict Rules & IDOR Prevention**: Firebase Security Rules를 통해 권한이 없는 리소스 접근을 차단하며, 서버 사이드에서 요청자의 권한을 매번 검증하여 IDOR 공격을 적극적으로 방지합니다.
- **Zero Trust**: 클라이언트에서 전달된 데이터나 URL 파라미터를 절대 신뢰하지 않으며, 항상 서버의 상태(Session, DB 권한)를 기준으로 요청을 처리합니다.
- **React Portal**: 모달 시스템을 `Portal`을 사용하여 DOM 최상단에 배치하며, 포커스 트래핑 및 키보드 접근성(A11y)을 보장합니다.
