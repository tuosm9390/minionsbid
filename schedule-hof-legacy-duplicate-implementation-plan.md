# 명예의 전당 Legacy 중복 등록 방지 구현 계획

작성일: 2026-05-19.

기준 문서: `schedule-hof-post-stability-analysis.md`.

## 목표

기존 `.add()` 방식으로 저장된 명예의 전당 문서와 새 `archive:{archiveId}` 결정적 문서가 같은 `archive_id`로 중복 생성되는 경계를 닫는다.

현재 UI는 `getAuctionArchivesForHof()`에서 기존 문서의 `archive_id`를 제외하므로 일반 화면 흐름에서는 중복 가능성이 낮다. 그러나 `registerHallOfFameEntry()` 서버 액션 자체는 `hall_of_fame/archive:{archiveId}` 존재 여부만 확인하므로, 직접 액션 호출이나 stale 클라이언트 상태에서는 기존 `.add()` 문서와 새 deterministic 문서가 공존할 수 있다.

## 성공 기준

- `hall_of_fame/archive:{archiveId}`가 있으면 등록을 거부한다.
- 기존 랜덤 id 문서가 같은 `archive_id`를 갖고 있어도 등록을 거부한다.
- 정상 신규 archive 등록은 기존처럼 성공한다.
- 기존 명예의 전당 조회, 삭제, archive 목록 제외 동작은 유지된다.
- 대상 Vitest와 빌드가 통과한다.

## 변경 범위

대상 파일.

- `src/features/hall-of-fame/api/hallOfFameActions.ts`.
- `src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts`.

비대상 파일.

- `RegistrationModal.tsx`는 입력 형태가 이미 최소화되어 있으므로 수정하지 않는다.
- Firestore rules는 변경하지 않는다.
- 기존 hall of fame 문서 마이그레이션은 하지 않는다.
- 일정 관리 서버 액션은 변경하지 않는다.

## 구현 방향

### 1. 중복 검사 헬퍼 추가

`hallOfFameActions.ts`에 같은 archive id 등록 여부를 확인하는 헬퍼를 추가한다.

권장 형태.

- 함수명 후보: `hasHallOfFameEntryForArchive(archiveId: string)`.
- 조회 방식: `adminDb.collection('hall_of_fame').where('archive_id', '==', archiveId).limit(1).get()`.
- 반환값: matching 문서가 있으면 `true`, 없으면 `false`.

이 헬퍼는 기존 랜덤 id 문서와 새 deterministic 문서를 모두 포착한다. 새 deterministic 문서도 `archive_id` 필드를 저장하므로 같은 query 기준으로 잡힌다.

### 2. 등록 액션에 중복 검사 적용

`registerHallOfFameEntry()`에서 archive id와 team 입력을 정규화한 뒤, archive 재조회 transaction 이전에 중복 검사를 수행한다.

흐름.

1. 관리자 코드 검증.
2. `archiveId`, `teamId`, `teamName`, `seasonName`, `seasonLabel` 정규화.
3. 필수 입력 검증.
4. `hasHallOfFameEntryForArchive(archiveId)` 실행.
5. 이미 등록되어 있으면 `이미 명예의 전당에 등록된 경매입니다.` 반환.
6. 기존 transaction에서 deterministic 문서 존재 여부를 한 번 더 확인하고 archive/team 재조회 후 저장.

이 방식은 transaction query 없이 최소 변경으로 legacy 중복을 막는다. 결정적 문서 동시 생성 경계는 기존 transaction의 deterministic doc read로 계속 보호한다.

### 3. 오류 메시지 유지

중복 오류 메시지는 기존 deterministic 중복 테스트와 동일하게 유지한다.

- `이미 명예의 전당에 등록된 경매입니다.`

메시지를 새로 만들지 않으면 UI 처리와 테스트가 단순해진다.

## 테스트 계획

대상 파일: `src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts`.

추가 테스트.

- 기존 random id 문서가 같은 `archive_id`를 가진 경우 등록을 거부한다.
- 이때 `archive:arc1` 문서가 없어도 새 문서를 만들지 않는다.
- deterministic 중복 테스트는 유지한다.

테스트 더블 보강.

- 현재 hall of fame 테스트 mock collection에 `where()`가 없다면 추가한다.
- `where('archive_id', '==', archiveId).limit(1).get()` 흐름이 `dbState.hallOfFame`에서 archive id matching 문서만 반환하도록 구현한다.
- 기존 `getAuctionArchivesForHof()` 테스트가 전체 문서 조회를 쓰므로 `where()` 추가가 기존 get 동작을 깨지 않게 한다.

## 검증 명령

우선 실행.

- `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts`.

통합 확인.

- `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts src/features/schedules/api/__tests__/scheduleActions.test.ts __tests__/LeagueScheduleManager.test.tsx`.
- `npm run build`.

Playwright는 UI 변경이 없으므로 필수는 아니다.

## 커밋 기준

한 커밋으로 묶는다.

- 커밋 메시지 후보: `fix: 명예의 전당 legacy 중복 등록 방지`.

커밋 전 확인.

- 대상 Vitest 통과.
- 통합 확인 또는 최소 `npm run build` 통과.
- 기존 사용자 변경인 `DESCRIPTION.md`, `event-miss-analysis.md`, `security-report.md`는 건드리지 않는다.

## 남는 리스크

이 계획은 legacy 중복을 실용적으로 닫는 최소 구현이다.

완전한 동시성 보장을 위해서는 `hall_of_fame_archive_index/{archiveId}` 같은 별도 unique index 문서가 더 강하다. 다만 현재 리스크는 기존 `.add()` 문서와 새 deterministic 문서의 호환성 경계이므로, 이번 최소 개선에서는 query 기반 중복 검사와 deterministic transaction 조합이면 충분하다.
