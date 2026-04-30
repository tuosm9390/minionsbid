# 아키텍처 가이드 — Minions Bid

작성일: 2026-03-24
대상: Firebase 기반 실시간 경매 툴

---

## 1. 개요
Minions Bid는 초저지연 실시간 동기화가 핵심인 경매 애플리케이션입니다. **Firestore room 문서가 현재 경매 hot state의 정본**이고, **Firebase Realtime Database**는 그 정본을 빠르게 fanout하는 저지연 채널입니다. 복잡한 비즈니스 로직은 **Next.js Server Actions**를 통해 원자적으로 처리됩니다.

---

## 2. 데이터 아키텍처

### 데이터베이스 레이어
- **Firestore**: 방 설정, 선수 정보, 팀 구성, 그리고 현재 경매 canonical state 저장.
- **Realtime Database (RTDB)**: 최신 경매 이벤트와 실시간 메시지를 모든 클라이언트에 빠르게 fanout.

### 데이터 흐름
1. **Mutation**: 클라이언트가 입찰(Bid) 또는 상태 변경 요청 → Next.js Server Action 호출.
2. **Validation**: 서버 사이드 transaction 안에서 권한, 포인트 잔액, 타이머 유효성, 현재 선두 상태를 검증.
3. **Write**: 서버가 Firestore room canonical state와 필요한 하위 문서를 업데이트.
4. **Broadcast**: Firebase RTDB가 연결된 모든 클라이언트에게 변경된 상태를 즉시 푸시.
5. **Heal**: RTDB 이벤트를 놓친 화면은 Firestore room snapshot의 `last_auction_event`와 `auction_revision`으로 빠르게 복구.
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
- 클라이언트는 local optimistic UI를 허용하지만, 최종 판정은 항상 서버 transaction 결과가 덮어씁니다.
- `bids` 컬렉션은 현재 선두 판정이 아니라 history / audit 용도로 사용합니다.
- 디버그/검증 계층에서는 `eventId` 기반 latency marker를 사용해 `client-response`, `rtdb`, `room-fallback` 적용 시점을 추적합니다.

### 타이머 (Timer)
- 서버의 `timerEnds_at` 타임스탬프를 기준으로 각 클라이언트가 로컬에서 카운트다운을 수행합니다.
- organizer는 항상 경매에 참여한다는 운영 가정을 둡니다.
- 팀장 연결이 끊기면 organizer presence guard가 경매를 즉시 일시정지하고, 재연결 시 organizer가 다시 재개합니다.
- `/api/auction-watchdog`는 선택적 backup route로만 유지합니다. 실시간 경매 품질이나 500ms 입찰 SLA의 핵심 메커니즘은 아닙니다.

### 관측 (Observability)
- representative bid 전파 품질은 DOM 변화만이 아니라 `eventId` 기반 latency marker로도 본다.
- fixture 경로는 `appliedAt - clickedAt <= 500ms`를 직접 검증한다.
- production 경로는 네트워크 편차를 고려해 우선 `client-response -> rtdb` 또는 `client-response -> room-fallback`의 동일 `eventId` correlation을 확인한다.

---

## 5. 보안 모델
- **Next.js Server Actions**: 클라이언트의 직접적인 DB 쓰기를 차단하고 모든 쓰기 요청은 서버를 경유합니다.
- **Zod Validation**: 모든 API 엔드포인트 및 Server Action의 경계에서 Zod 스키마를 사용하여 입력 데이터를 반드시 검증 및 살균합니다.
- **Strict RLS & IDOR Prevention**: Firebase Security Rules를 통해 권한이 없는 리소스 접근을 차단하며, 서버 사이드에서 요청자의 권한을 매번 검증하여 IDOR 공격을 적극적으로 방지합니다.
- **Zero Trust**: 클라이언트에서 전달된 데이터나 URL 파라미터를 절대 신뢰하지 않으며, 항상 서버의 상태(Session, DB 권한)를 기준으로 요청을 처리합니다.
- **React Portal**: 모달 시스템을 `Portal`을 사용하여 DOM 최상단에 배치하며, 포커스 트래핑 및 키보드 접근성(A11y)을 보장합니다.
