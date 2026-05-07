Date: 2026-05-07 09:40:00
Author: Codex

# Technical State Snapshot — Minions Bid

## 1. 아키텍처 현황 (Architecture Status)

### 1.1. 데이터 계층 (Data Layer)
- **상태**: Supabase 의존 경매 경로는 Firebase 기반으로 전환 완료.
- **정본**: Firestore `rooms/{roomId}`가 현재 경매 hot state의 정본이며, `auction_revision`은 방 단위 단조 증가 counter.
- **fanout**: Realtime Database는 서버 발행 이벤트와 메시지를 빠르게 퍼뜨리는 저지연 채널.
- **동기화**: `useAuctionRealtime.ts`를 통해 전역 상태(`useAuctionStore`)와 실시간 동기화하며, RTDB miss는 Firestore room snapshot으로 회복.
- **입찰 경로**: 2026-05-06부터 `placeBidDirect()`가 Firestore 클라이언트 SDK `runTransaction`으로 1차 입찰을 처리하고, 실패 시 기존 Server Action `placeBid`로 fallback.
- **입찰 보안**: direct bid는 `/api/room-auth/firebase-token` custom token claim과 `firestore.rules`의 `isBidUpdate()` / `isBidHistoryCreate()` 검증에 의존.
- **최적화**: `findLast`를 이용한 공지사항 검색 최적화(O(1)) 적용.
- **일정 관리**: Firestore 기반 일정/전적/명예의 전당 흐름이 별도 서브시스템으로 운영 중.
- **일정 저장 일관성**: `saveLeagueScheduleDay`, `registerLeagueMatchResult`, `completeLeagueSchedule`는 transaction 기반으로 동작.
- **로스터 연결**: 스케줄 문서는 `rosterSourceType` / `rosterSourceId`를 저장해 직접 조회를 우선 사용.

### 1.2. 스타일 시스템 (Style System)
- **테마**: Tailwind CSS v4 기반의 `Cyber-Pixel` 테마.
- **타이포그래피**: `text-fluid-xs` ~ `text-fluid-xl` 반응형 스케일 토큰 적용.
- **애니메이션**: GPU 가속을 활용한 `animate-shine`, `animate-urgent-shake`, `animate-minion-bounce` 정의.
- **일정 관리 화면**: `LeagueScheduleManager`, `ScheduleMatchDayEditor`, `ScheduleCalendar`, `ScheduleRosterPanel`, `LeagueRecordSummaryPanel`도 같은 fluid token 체계로 정리 완료.

## 2. 컴포넌트 무결성 (Component Integrity)

### 2.1. AuctionBoard
- **씬 시스템**: Framer Motion `AnimatePresence` 기반의 유연한 장면 전환(Wait → Lottery → Bidding → Result).
- **타입 안전성**: 모든 Props와 내부 로직에서 `as any` 제거 및 인터페이스 정밀화 완료.

### 2.2. BiddingControl
- **인터랙션**: `isLeading` 상태에 따른 시각적 강조 및 입찰 에러 핸들링 고도화.
- **모바일**: 터치 친화적인 버튼 크기(56px) 및 레이아웃 최적화.

### 2.3. LeagueScheduleManager
- **권한 모델**: 공개 `/league-schedule` 경로는 유지하되 모든 변경 액션은 서버 관리자 가드로 보호.
- **상태 일관성**: 일정 종료 후 로컬 optimistic patch 대신 catalog/timeline 재조회로 source of truth를 서버에 둠.
- **완료 일정 UX**: 기본 read-only, 관리자 코드 검증 후 편집 해제.
- **구조 결정 문서**: 현재 채택안과 재검토 트리거는 `doc/results/260427_LeagueScheduleArchitectureDecision.md`에 기록.

## 3. 테스트 및 품질 (Quality Assurance)

### 3.1. 단위 테스트 (Unit Tests)
- `PixelIcon.test.tsx`, `usePresence.test.ts`, `useBiddingControl.test.tsx` 등 핵심 로직 커버리지 확보.
- Vitest 기반의 지속적 통합 환경 구축.
- 2026-05-07 로컬 확인: `npm run test` 통과, 21개 test file / 153개 test 통과.
- 일정 관리 회귀 테스트 추가:
  - `src/features/schedules/api/__tests__/scheduleActions.test.ts`
  - `__tests__/ScheduleMatchDayEditor.test.tsx`
  - `__tests__/LeagueScheduleManager.test.tsx`

### 3.2. E2E 테스트
- Playwright 기반 `/league-schedule` 대표 플로우 2개 추가.
- `E2E_SCHEDULE_FIXTURE=1` 모드에서 Firebase 없이 결정적 fixture 상태로 일정 관리 E2E 수행 가능.
- 경매 E2E는 `npm run test:e2e:auction`으로 fixture 기반 실행 가능.
- 2026-05-07 로컬 확인에서는 `npm run test:e2e:auction`이 184초 제한에서 timeout되어 완료 결과를 확보하지 못했다.

### 3.3. 반응형 지원 (Responsive Support)
- 375px(iPhone SE)부터 1440px+ 데스크톱까지 일관된 UX 제공.
- `RoomClient.tsx` 내 모바일 아코디언 로직을 통한 화면 공간 효율화.

## 4. 잔존 이슈 및 부채 (Technical Debt)

- **Security**: direct bid 쓰기 경계는 custom token + rules로 닫혔지만, room 단건 read와 하위 구독 read는 아직 `roomId`를 아는 클라이언트에게 열려 있다. 필요 시 read path도 custom token claim 기반으로 세분화한다.
- **Performance**: direct bid로 입찰 round-trip 병목은 줄였지만, 운영 환경에서 eventId 기반 p95 latency 관측 체계는 아직 없다.
- **E2E Stability**: `npm run test:e2e:auction` 로컬 완료 검증이 이번 점검에서 timeout되었으므로 final-second fixture 안정화와 실행 시간 관찰이 필요하다.
- **League Schedule Architecture**: 현재는 단일 공개 경로 + 서버 가드, `match_days` 문서 + transaction/revision 보강을 채택했다. 운영자 증가, 공개 링크 확산, 경기 행 단위 동시 수정이 늘어나면 관리자 전용 경로 또는 per-match 문서 분리 재검토 필요.
