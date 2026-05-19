# 명예의 전당과 일정 관리 안정화 구현 계획

작성일: 2026-05-19.

기준 문서: `schedule-hof-stability-premises.md`.

## 목표

명예의 전당과 일정 관리 기능에서 서버가 최종 데이터를 판정하도록 보강한다. 구현은 수동 명예의 전당 등록, 일정 날짜 저장, 일정 팀 검증, 일정 전환 UI 상태에 집중한다.

## 성공 기준

- 명예의 전당 수동 등록은 서버가 archive를 재조회해 저장한다.
- 같은 auction archive는 명예의 전당에 중복 등록되지 않는다.
- 조작된 팀명, 선수 목록, room id, won at 값은 명예의 전당에 저장되지 않는다.
- 일정 날짜 저장은 schedule 기간 밖 date key를 거부한다.
- 일정 경기 저장은 roster source에 없는 팀 이름을 거부한다.
- 일정 전환 시 선택 날짜가 새 일정 기준으로 재설정된다.
- 기존 공개 읽기 경로와 관리자 코드 기반 변경 경계는 유지된다.
- 대상 Vitest, 빌드, 필요한 Playwright 검증이 통과한다.

## 변경 범위

### 1. 명예의 전당 서버 액션

대상 파일.

- `src/features/hall-of-fame/api/hallOfFameActions.ts`.
- `src/features/hall-of-fame/types.ts`.
- `src/features/hall-of-fame/components/RegistrationModal.tsx`.
- `src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts`.

구현 방향.

- `registerHallOfFameEntry()`의 입력을 최소화한다.
  - 클라이언트는 `archiveId`, `teamId` 또는 `teamName`, `seasonName`, `seasonLabel`, `adminCode`만 전달한다.
  - `room_id`, `won_at`, `winning_team_leader`, `winning_team_players`는 서버가 archive에서 재구성한다.
- 서버에서 `auction_archives/{archiveId}`를 읽는다.
- archive가 없거나 `result_snapshot`에 선택 팀이 없으면 일반화된 오류를 반환한다.
- 저장 문서 id는 `archive:${archiveId}`를 우선 후보로 쓴다.
  - `schedule:{scheduleId}`와 충돌하지 않고 출처가 명확하다.
  - 기존 `.add()`로 저장된 과거 문서는 유지한다.
- transaction 안에서 `hall_of_fame/archive:{archiveId}` 존재 여부를 확인하고 없을 때만 생성한다.
- `getHallOfFameArchiveIdSet()`는 200개 제한을 제거한다.
  - 전체 조회가 커질 경우 후속 최적화로 archive id index 컬렉션을 검토한다.
- `getAuctionArchivesForHof()`는 기존 `.add()` 문서의 `archive_id`와 새 deterministic 문서의 `archive_id`를 모두 제외한다.

테스트.

- 정상 등록 시 서버 archive 값으로 저장되는지 확인한다.
- 조작된 payload의 선수 목록이 저장되지 않는지 확인한다.
- 존재하지 않는 archive id를 거부하는지 확인한다.
- 존재하지 않는 팀 선택을 거부하는지 확인한다.
- 같은 archive 중복 등록을 거부하는지 확인한다.
- 200개 초과 hall of fame entry가 있어도 제외 목록이 누락되지 않는지 확인한다.

### 2. 일정 서버 액션 검증

대상 파일.

- `src/features/schedules/api/scheduleActions.ts`.
- `src/features/schedules/api/__tests__/scheduleActions.test.ts`.
- 필요 시 `src/features/schedules/types.ts`.

구현 방향.

- `saveLeagueScheduleDay()` transaction 안에서 schedule 문서를 읽은 뒤 `mapScheduleDoc()` 결과를 기준으로 검증한다.
- date key 검증 헬퍼를 추가한다.
  - `startsAt` 당일보다 이전이면 거부한다.
  - `endsAt`이 있으면 종료일 이후를 거부한다.
  - `endsAt`이 없으면 시작일 이후는 허용한다.
- roster 검증 헬퍼를 추가한다.
  - schedule의 `rosterSourceType`과 `rosterSourceId`가 있으면 해당 source에서 팀을 우선 복원한다.
  - legacy fallback은 기존 `loadRosterTeams(schedule)` 경로를 유지한다.
  - 저장할 모든 홈팀과 원정팀이 복원된 roster team 이름에 포함되어야 한다.
  - 같은 경기의 홈팀과 원정팀이 같으면 기존처럼 거부한다.
- 같은 날짜 중복 배정 정책은 현재 UI와 맞춰 유지한다.
  - 현재 UI는 같은 날짜 안에서 한 팀이 한 번만 선택되도록 제한한다.
  - 서버도 같은 date payload 안에서 동일 팀이 두 번 이상 등장하면 거부하는 방향을 기본값으로 둔다.
- 완료 일정 검증을 서버에 명시한다.
  - 현재 UI는 관리자 검증 후 완료 일정 편집을 허용한다.
  - 서버는 관리자 코드가 맞으면 완료 일정 편집을 허용하되 동일한 date, roster 검증을 적용한다.

테스트.

- 시작일 이전 date key 저장을 거부한다.
- 종료일 이후 date key 저장을 거부한다.
- `endsAt`이 없는 일정은 시작일 이후 date key 저장을 허용한다.
- roster source에 없는 팀 저장을 거부한다.
- 같은 날짜 payload 안 중복 팀 배정을 거부한다.
- 기존 결과 보존 로직은 팀, 포맷이 유지될 때 계속 동작한다.
- 완료 일정은 관리자 코드 없이는 거부되고, 관리자 코드가 맞으면 검증을 통과한 변경만 허용된다.

### 3. 일정 전환 UI 상태

대상 파일.

- `src/components/LeagueScheduleManager.tsx`.
- 필요 시 `__tests__/ScheduleMatchDayEditor.test.tsx` 또는 새 컴포넌트 테스트.

구현 방향.

- `selectedScheduleId`가 바뀌고 timeline이 로드되면 `selectedDateKey`를 새 일정 기준으로 재설정한다.
- 우선순위는 다음과 같다.
  1. 새 일정의 첫 `days[0].dateKey`.
  2. 새 일정의 `startsAt` 날짜.
  3. 오늘 날짜.
- 기존 effect의 `(prev) => prev || ...` 방식은 다른 일정의 날짜를 계속 유지할 수 있으므로 제거한다.
- 사용자가 같은 일정 안에서 날짜를 바꾸는 동작은 유지한다.

테스트.

- 일정 A에서 날짜를 선택한 뒤 일정 B로 전환하면 B의 첫 날짜 또는 시작일로 바뀌는지 확인한다.
- 날짜 전환 후 `saveLeagueScheduleDay()`에 전달되는 `dateKey`가 새 일정 기준인지 확인한다.

### 4. Fixture와 E2E 유지

대상 파일.

- `src/features/schedules/api/e2eScheduleFixture.ts`.
- `playwright/league-schedule.spec.ts`.

구현 방향.

- 운영 서버 액션 검증과 fixture 경로의 의미가 크게 벌어지지 않게 한다.
- fixture도 기간 밖 date key와 roster에 없는 팀을 거부하도록 맞추는 것을 우선한다.
- Playwright fixture가 기존 정상 플로우를 계속 통과해야 한다.

## 작업 순서

1. 명예의 전당 테스트를 먼저 추가한다.
2. 명예의 전당 서버 액션을 archive 재조회와 deterministic id 저장으로 변경한다.
3. 명예의 전당 UI payload를 최소 입력 형태로 조정한다.
4. 명예의 전당 대상 Vitest를 실행한다.
5. 일정 서버 액션 테스트를 추가한다.
6. 일정 date range와 roster 검증 헬퍼를 구현한다.
7. fixture 검증을 운영 경로와 맞춘다.
8. 일정 대상 Vitest를 실행한다.
9. `LeagueScheduleManager`의 일정 전환 날짜 reset을 수정한다.
10. 필요한 컴포넌트 또는 Playwright 검증을 실행한다.
11. `npm run build`로 전체 컴파일을 확인한다.

## 커밋 분리 기준

- 커밋 1. 명예의 전당 서버 권위성 보강.
- 커밋 2. 일정 저장 서버 검증 보강.
- 커밋 3. 일정 전환 UI 상태 보정.
- 커밋 4. fixture 또는 E2E 보정이 별도 변경으로 커질 경우 분리.

각 커밋은 대상 테스트 통과 후 생성한다.

## 검증 명령

우선 실행.

- `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts`.
- `npx vitest run src/features/schedules/api/__tests__/scheduleActions.test.ts`.
- `npx vitest run __tests__/ScheduleMatchDayEditor.test.tsx`.

통합 확인.

- `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts src/features/schedules/api/__tests__/scheduleActions.test.ts src/features/schedules/utils/leagueRecords.test.ts src/features/schedules/utils/leagueNextMatches.test.ts src/features/schedules/utils/leagueMatchTime.test.ts src/features/schedules/utils/leagueMatchRules.test.ts __tests__/ScheduleMatchDayEditor.test.tsx`.
- `npm run build`.

UI 또는 fixture 변경 시 추가 실행.

- `npx playwright test playwright/league-schedule.spec.ts`.

## 리스크와 완화

- 기존 `.add()` 기반 명예의 전당 문서가 남아 있을 수 있다.
  - 완화는 새 등록만 deterministic id로 저장하고, 조회와 제외 목록은 기존 문서도 계속 인정하는 것이다.
- archive team id가 없는 legacy archive가 있을 수 있다.
  - 완화는 `teamId` 우선, 없으면 정규화된 `teamName` fallback으로 찾는 것이다.
- roster 복원이 Firestore 읽기를 추가해 일정 저장 비용이 늘 수 있다.
  - 완화는 `rosterSourceType`과 `rosterSourceId` 직접 조회를 우선하고 legacy 전체 scan은 fallback으로만 유지하는 것이다.
- 같은 날짜 중복 출전 정책이 실제 운영과 다를 수 있다.
  - 완화는 구현 전 운영 규칙을 확인하고, 불확실하면 서버 검증을 팀 존재 검증까지만 먼저 적용하는 것이다.

## 완료 보고 형식

최종 보고에는 다음을 포함한다.

- 변경된 서버 액션과 UI 파일.
- 추가 또는 수정된 테스트 파일.
- 실행한 검증 명령과 결과.
- 남은 운영 판단 지점.
