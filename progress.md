Date: 2026-04-27
Author: Codex

# Session Progress Log

## [2026-05-07] 클라이언트 직접 입찰 후 RTDB 이벤트 전파 누락 수정
- **문제**: `placeBidDirect` 성공 후 RTDB `publishAuctionEvent`와 시스템 메시지(`queueSystemMessage`)가 호출되지 않아,
  다른 참가자 화면에서 입찰 채팅 로그와 타이머 5초 갱신이 반영되지 않던 버그 수정.
- **원인**: 클라이언트 직접 입찰 경로에서 Firestore `rooms` 문서와 `bids`만 업데이트하고,
  RTDB fanout과 `last_auction_event` 저장, 시스템 메시지 생성이 빠져 있었음.
- **수정**:
  - `broadcastBidEvent` Server Action 신규 추가 (`auctionFlowActions.ts`)
    - RTDB `BID_PLACED` 이벤트 발행 + `last_auction_event` 저장 + 시스템 메시지 생성을 한 번에 처리
  - `placeBidDirect` 성공 후 `broadcastBidEvent`를 **fire-and-forget**으로 호출 (`useBiddingControl.ts`)
    - 입찰 자체의 레이턴시(~140ms)에는 영향 없음
  - `placeBidDirect`가 `revision`을 리턴하도록 개선하여 정확한 이벤트 버전 정보 전달
- **테스트**: TypeScript 타입 체크 통과, 153개 단위 테스트 전체 통과.

## [2026-05-07] 프로젝트 상태 재점검 및 문서 동기화
- `master` 기준 워킹 트리가 깨끗한 상태임을 확인.
- 현재 단위 테스트 전체 실행 결과:
  - `npm run test`
  - 21개 test file / 153개 test 모두 통과
- 경매 E2E 확인 시도:
  - `npm run test:e2e:auction`
  - 184초 제한에서 timeout되어 이번 문서 갱신 시점에는 완료 검증하지 못함
- 현재 구현 기준 핵심 상태를 문서에 반영:
  - 입찰 1차 경로는 `placeBidDirect()`의 Firestore 클라이언트 SDK 직접 transaction
  - 실패 시 기존 `placeBid` Server Action으로 fallback
  - direct bid 보안 경계는 `/api/room-auth/firebase-token` custom token claim과 `firestore.rules`의 `isBidUpdate()` / `isBidHistoryCreate()`가 담당
  - Firestore room 문서는 canonical hot state, RTDB는 서버 발행 이벤트 fanout이라는 원칙은 유지
- 경매 E2E timeout과 운영 latency 관측 부재는 후속 추적 항목으로 유지.

## [2026-05-06] 경매 실시간성(Latency) 최적화: placeBid 클라이언트 마이그레이션
- `placeBid` 경로를 Vercel Server Action에서 Firestore 클라이언트 SDK 직접 트랜잭션(`runTransaction`)으로 마이그레이션.
- 클라이언트 직접 쓰기를 위해 `firestore.rules`에 강력한 `isBidUpdate()` 검증 로직(역할, 금액, 타이머 연장 범위, 잔액 등) 추가.
- 입찰 이벤트 전파 지연 병목(클라이언트 -> Vercel(미국) -> Firebase(싱가포르) -> 클라이언트)을 제거하여, 타이머 갱신 지연을 ~500ms에서 ~140ms로 약 70% 단축.
- `useBiddingControl` 훅에서 클라이언트 직접 입찰 우선 시도 후 실패 시 기존 Server Action으로 폴백하는 패턴 구현.
- `useBiddingControl` 테스트를 클라이언트 직접 입찰 모킹 기반으로 전면 리팩토링 및 153개 테스트 통과 확인.

## [2026-04-27] 일정 관리 서브시스템 리뷰 및 안정화 착수
- `master` 브랜치 기준으로 일정 관리 기능의 Architecture / Code Quality / Test / Performance 리뷰 수행.
- 핵심 결정 정리:
  - 서버 액션 공통 관리자 가드
  - Firestore transaction 전환
  - 스케줄 문서의 명시적 로스터 참조 저장
  - 일정 관리 핵심 테스트 묶음 추가
- `TODOS.md`에 일정 관리 관련 후속 작업 4개 추가.

## [2026-04-27] 일정 관리 UI 정리
- `LeagueScheduleManager`, `ScheduleMatchDayEditor`, `ScheduleCalendar`, `ScheduleRosterPanel`, `LeagueRecordSummaryPanel`에서 `text-[Npx]` 하드코딩을 `text-fluid-*` 기준으로 정리.
- 현재 일정 카드와 편집 패널의 시각적 위계를 높이고 완료 일정 read-only 배너를 추가.
- `🔒/🔓` 이모지를 Lucide 아이콘으로 교체.

## [2026-04-27] 일정 관리 서버 경계 보강
- `scheduleActions.ts`에 `requireScheduleAdmin()` 공통 가드를 추가해 일정 생성/저장/결과 등록/삭제/종료를 서버에서 보호.
- `saveLeagueScheduleDay`, `registerLeagueMatchResult`, `completeLeagueSchedule`를 transaction 기반으로 전환하고 `revision` 필드를 추가.
- 스케줄 문서에 `rosterSourceType` / `rosterSourceId`를 저장하고 직접 로스터 조회 경로를 우선 사용하도록 변경.
- `hall_of_fame`는 `schedule:{id}` 문서 id를 사용하도록 바꿔 종료/삭제 일관성을 개선.

## [2026-04-27] 일정 관리 회귀 테스트 1차 추가
- `src/features/schedules/api/__tests__/scheduleActions.test.ts` 추가:
  - 관리자 코드 검증
  - 일정 생성 권한 가드
  - 날짜 저장 transaction
  - 결과 등록 transaction
  - 일정 종료 / 삭제 흐름
- `__tests__/ScheduleMatchDayEditor.test.tsx` 추가:
  - 관리자 코드 확인 버튼 흐름
  - 완료 일정 잠금 상태
  - 상대 팀 옵션 필터링
  - 세트 로그 추가
  - 결과 등록 액션 연결
- `__tests__/LeagueScheduleManager.test.tsx` 추가:
  - 초기 catalog/timeline 로드
  - 관리자 코드 검증 후 일정 종료 시 재조회
  - 날짜 저장 예외 시 에러 표시 및 로딩 상태 복구
- `playwright/league-schedule.spec.ts` 추가:
  - 일정 생성 → 날짜 경기 저장 → 결과 등록 → 일정 종료
  - 완료 일정 잠금 → 관리자 코드 검증 후 편집 해제
- `playwright.config.ts` 추가 및 `/api/e2e/schedule-fixture/reset` + fixture 모드 구현
- 타깃 테스트 실행 통과:
  - `pnpm exec vitest run src/features/schedules/api/__tests__/scheduleActions.test.ts __tests__/ScheduleMatchDayEditor.test.tsx`
  - `pnpm exec vitest run __tests__/LeagueScheduleManager.test.tsx`
  - `npx playwright test playwright/league-schedule.spec.ts --config=playwright.config.ts`

## [2026-04-27] 현재 남은 작업
- 공개 읽기/관리자 편집 경로 분리 여부와 경기별 문서 분리 여부 결정

## [2026-04-27] 일정 관리 구조 결정 문서화
- `doc/results/260427_LeagueScheduleArchitectureDecision.md` 추가.
- 현재 채택안을 다음처럼 명시:
  - 단일 공개 경로 유지 + 서버 공통 관리자 가드
  - `match_days` 문서 유지 + transaction/revision 보강
- 재검토 트리거도 함께 정의:
  - 다인 운영 증가
  - 공개 링크 확산
  - 경기 행 단위 동시 수정 빈도 증가

## [2026-04-27] 후속 문서 정리
- `TODOS.md`에서 일정 관리 테스트 묶음을 완료 항목으로 승격.
- `plan.md`에 현재 채택 아키텍처와 재검토 트리거를 명시.
- 다음 단계는 구현 추가가 아니라 운영 관찰 지표 수집과 구조 재검토 조건 확인으로 정리.

## [2026-04-27] Firestore Rules 점검
- `firestore.rules`에 `league_schedules/{scheduleId}/match_days/{dateKey}` 규칙을 명시적으로 추가.
- `rooms` 계층은 토큰이 공개 문서에 섞여 있어 rules만으로 안전하게 강화할 수 없다는 점을 확인.
- `doc/SECURITY.md`에 현재 보안 모델, 일정 관리 경계, `rooms token segregation` 선행 과제를 정리.
- `TODOS.md`에 `rooms token segregation` 작업을 별도 backlog로 추가.

## [2026-04-27] rooms token segregation 1차 반영
- 신규 방 생성 시 `rooms` / `teams` 공개 문서에서 역할 토큰을 제거하고 `room_auth_secrets/{roomId}` + `team_tokens/{teamId}`에 저장하도록 변경.
- `/api/room-auth`는 private auth 문서를 우선 읽고, legacy room/team token 필드는 fallback으로만 사용하도록 변경.
- 주최자 링크 모달은 더 이상 실시간 store의 토큰 필드에 의존하지 않고 `/api/room-links`에서 organizer cookie 기반으로 링크를 조회.
- Firestore rules에 `room_auth_secrets` 비공개 경로를 명시.

## [2026-04-27] legacy room token migration 스크립트 추가
- `scripts/migrate_room_auth_secrets.js` 추가.
- 기본은 dry-run이며, `--write` 옵션에서만 실제 Firestore 문서를 수정하도록 구성.
- `package.json`에 `migrate:room-auth-secrets:dry-run`, `migrate:room-auth-secrets` 스크립트 추가.
- `README.md`, `doc/SECURITY.md`에 실행 방법과 목적을 기록.

## [2026-04-27] legacy room token dry-run 결과
- `node scripts/migrate_room_auth_secrets.js` 실행.
- Firestore 기준 `rooms` 4개를 스캔했고, 4개 모두 legacy `organizer/viewer` token과 팀장 token을 아직 public 문서에 유지 중인 것으로 확인.
- 각 방은 팀장 legacy token 2개씩 보유.
- 아직 `--write`는 실행하지 않았고, 실제 cleanup은 별도 승인 후 수행 예정.

## [2026-04-27] legacy room token cleanup 완료
- `node scripts/migrate_room_auth_secrets.js --write` 실행.
- `room_auth_secrets` 문서 4개와 `team_tokens` 문서 8개를 채우고, public room/team 문서의 legacy token 필드를 제거.
- 후속 dry-run 검증 결과:
  - `roomsWithLegacyRoomTokens: 0`
  - `roomsWithLegacyTeamTokens: 0`

## [2026-04-27] Firestore room read rules 재설계
- `firestore.rules`에서 top-level `rooms` collection list는 차단.
- 대신 `rooms/{roomId}` 단건 조회와 `teams`, `players`, `messages`, `bids` 하위 컬렉션의 read만 허용하도록 조정.
- `room_auth_secrets`는 계속 완전 비공개 유지.

## [2026-04-27] room auth 감사 스크립트 추가 및 검증
- `scripts/audit_room_auth_secrets.js` 추가.
- `package.json`에 `audit:room-auth-secrets` 스크립트 추가.
- 실행 결과:
  - `roomsMissingAuthDoc: []`
  - `roomsMissingOrganizerToken: []`
  - `roomsMissingViewerToken: []`
  - `roomsWithLegacyPublicTokens: []`
  - `teamsMissingAuthToken: []`
  - `teamsWithLegacyPublicTokens: []`
  - `ok: true`

## [2026-04-27] Firestore rules 운영 반영 완료
- `.firebaserc`를 실제 프로젝트 `gen-lang-client-0499827443`로 동기화.
- `firebase login:list`로 CLI 로그인 계정 확인: `tuosm123@gmail.com`
- `firebase deploy --only firestore:rules --project gen-lang-client-0499827443` 실행 성공.
- 현재 프로젝트의 Firestore rules가 운영 Firebase에 반영된 상태.

## [2026-04-27] named database rules 배포 수정 및 스모크 통과
- 앱이 `(default)`가 아니라 `minionsbid` named database를 사용한다는 점을 확인.
- `firebase.json`을 multi-database 형식으로 수정해 `(default)`와 `minionsbid` 모두 `firestore.rules`를 참조하도록 정리.
- `firebase deploy --only firestore:minionsbid --project gen-lang-client-0499827443` 실행 성공.
- `node scripts/smoke_room_rules.js` 재실행 결과:
  - room 단건 조회 허용
  - `teams`, `players`, `messages`, `bids` read 허용
  - top-level `rooms` list 차단
  - `room_auth_secrets` 및 `team_tokens` client read 차단
  - `ok: true`
