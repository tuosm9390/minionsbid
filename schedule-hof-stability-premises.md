# 명예의 전당과 일정 관리 안정화 전제

작성일: 2026-05-19.

## 목적

이 문서는 명예의 전당과 일정 관리 코드 리뷰에서 확인된 리스크를 실제 안정화 작업으로 옮기기 위한 전제와 성공 기준을 정리한다.

이번 작업의 중심은 기능 확장이 아니라 서버 권위성, 데이터 정합성, 중복 방지, 회귀 검증을 보강하는 것이다.

## 핵심 전제

- 공개 페이지 구조는 유지한다. `/hall-of-fame`과 `/league-schedule`은 계속 읽기 가능한 공개 경로로 둔다.
- 변경 권한은 서버 액션의 관리자 코드 검증에 둔다. Firestore rules를 완화하거나 클라이언트 직접 쓰기를 추가하지 않는다.
- 서버는 클라이언트가 보낸 archive id, team name, match id, date key를 신뢰하지 않는다.
- 명예의 전당 기록은 `auction_archives` 또는 일정 종료 결과에서 서버가 재구성한 값만 저장한다.
- 일정 경기의 팀 이름은 해당 일정의 roster source에서 복원 가능한 팀으로 제한한다.
- 일정 날짜는 schedule `starts_at`과 `ends_at` 범위 안에서만 저장한다. `ends_at`이 없으면 시작일 이후만 허용한다.
- 완료된 일정은 기본 read-only 정책을 유지한다. 관리자 코드 검증 후 편집 가능하더라도 서버 검증은 동일하게 적용한다.
- 기존 저장 데이터와 legacy fallback은 유지한다. 새 검증이 과거 정상 데이터를 불필요하게 숨기거나 삭제하지 않게 한다.

## 비목표

- 일정 UI 전체 재설계는 하지 않는다.
- 명예의 전당 전시 디자인 개편은 하지 않는다.
- 관리자 인증 방식을 세션 기반 로그인으로 바꾸지 않는다.
- Firestore 데이터 모델을 대규모 마이그레이션하지 않는다.
- 경매 실시간 계약, RTDB event envelope, `auction_revision` 규칙은 건드리지 않는다.

## 개선 대상

1. 명예의 전당 수동 등록.
   - 현재 리스크는 `registerHallOfFameEntry()`가 클라이언트 payload를 그대로 저장하고 `.add()`로 중복 등록을 허용한다는 점이다.
   - 개선 전제는 서버가 `archive_id`로 `auction_archives`를 다시 읽고, 선택한 팀이 archive `result_snapshot` 안에 있는지 확인한 뒤 저장하는 것이다.
   - 저장 문서 id는 결정적으로 만들어 같은 archive가 중복 등록되지 않게 한다.

2. 명예의 전당 archive 제외 목록.
   - 현재 리스크는 `getHallOfFameArchiveIdSet()`의 200개 제한 때문에 오래된 등록 archive가 다시 선택지에 나타날 수 있다는 점이다.
   - 개선 전제는 제한 없는 조회 또는 별도 인덱싱 가능한 방식으로 등록 archive id 전체를 제외하는 것이다.

3. 일정 날짜 저장.
   - 현재 리스크는 `saveLeagueScheduleDay()`가 date key를 schedule 기간과 대조하지 않는다는 점이다.
   - 개선 전제는 transaction 안에서 schedule 문서를 읽은 뒤 `starts_at`, `ends_at`, `status`를 기준으로 저장 가능 여부를 판정하는 것이다.

4. 일정 팀 검증.
   - 현재 리스크는 `saveLeagueScheduleDay()`가 임의 팀 이름을 저장할 수 있다는 점이다.
   - 개선 전제는 schedule roster source에서 팀 목록을 복원하고, 홈팀과 원정팀이 같은 source 그룹에 존재하는지 서버에서 확인하는 것이다.
   - 같은 날짜 안 중복 배정 정책은 현재 UI의 의도와 맞춰 서버에서도 유지한다.

5. 일정 전환 UI 상태.
   - 현재 리스크는 `LeagueScheduleManager`가 일정 전환 시 기존 `selectedDateKey`를 유지할 수 있다는 점이다.
   - 개선 전제는 선택된 일정이 바뀌면 해당 일정의 시작일 또는 첫 match day로 날짜를 재설정하는 것이다.

## 성공 기준

- 관리자 코드가 없거나 틀린 경우 명예의 전당 등록, 삭제, 일정 생성, 일정 저장, 결과 등록, 종료, 삭제가 모두 실패한다.
- 명예의 전당 수동 등록은 존재하지 않는 archive id, 존재하지 않는 팀, 조작된 선수 목록으로 저장되지 않는다.
- 같은 archive는 명예의 전당에 한 번만 등록된다.
- 일정 저장은 기간 밖 날짜를 거부한다.
- 일정 저장은 roster source에 없는 팀 이름을 거부한다.
- 완료 일정은 UI 잠금과 서버 검증이 동시에 유지된다.
- 일정 종료는 기존처럼 `hall_of_fame/schedule:{scheduleId}` 문서를 결정적으로 생성한다.
- 기존 테스트와 빌드가 통과한다.

## 최소 테스트 범위

- `src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts`.
  - archive 재조회 기반 저장.
  - 조작된 팀 payload 거부.
  - 중복 archive 등록 거부.
  - archive 제외 목록이 등록 기록 수에 의존하지 않는지 확인.

- `src/features/schedules/api/__tests__/scheduleActions.test.ts`.
  - 기간 밖 date key 저장 거부.
  - roster source에 없는 팀 저장 거부.
  - 완료 일정 편집 정책 유지.
  - 일정 종료 후 deterministic hall of fame entry 유지.

- `__tests__/ScheduleMatchDayEditor.test.tsx`.
  - 완료 일정 잠금과 관리자 검증 후 편집 해제 유지.

- `playwright/league-schedule.spec.ts`.
  - fixture 기반 일정 생성, 날짜 저장, 결과 등록, 종료 흐름 유지.

## 검증 명령

- `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts src/features/schedules/api/__tests__/scheduleActions.test.ts src/features/schedules/utils/leagueRecords.test.ts src/features/schedules/utils/leagueNextMatches.test.ts src/features/schedules/utils/leagueMatchTime.test.ts src/features/schedules/utils/leagueMatchRules.test.ts __tests__/ScheduleMatchDayEditor.test.tsx`.
- `npm run build`.
- 일정 UI를 수정한 경우 `npx playwright test playwright/league-schedule.spec.ts`.

## 작업 순서 권장

1. 명예의 전당 서버 액션을 archive 재조회와 deterministic document id 기반으로 바꾼다.
2. 명예의 전당 테스트에 조작 payload와 중복 등록 케이스를 추가한다.
3. 일정 서버 액션에 date range와 roster team 검증을 추가한다.
4. 일정 전환 시 선택 날짜를 schedule 기준으로 재설정한다.
5. 대상 Vitest, 빌드, 필요한 경우 Playwright fixture를 실행한다.

## 남은 판단 지점

- 명예의 전당 수동 등록 문서 id를 `archive:{archiveId}`로 둘지 기존 archive id 그대로 둘지 결정해야 한다.
- 일정 저장에서 같은 팀이 같은 날짜 여러 경기 출전 가능한 운영 규칙인지 확인해야 한다.
- `ends_at`이 없는 일정에서 허용할 미래 날짜 상한을 둘지 결정해야 한다.
