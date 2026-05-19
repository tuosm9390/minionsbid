# 명예의 전당과 일정 관리 안정화 후속 분석

작성일: 2026-05-19.

## 결론

현재 프로젝트 상태 기준으로 명예의 전당과 일정 관리의 주요 안정성 문제는 상당 부분 해결되었다.

해결된 핵심 리스크는 다음이다.

- 명예의 전당 수동 등록에서 클라이언트가 보낸 room id, 선수 목록, 우승일을 그대로 저장하던 문제.
- 같은 경매 archive가 새 수동 등록 경로에서 반복 등록되던 문제.
- 명예의 전당 archive 제외 목록이 200개 제한 때문에 누락될 수 있던 문제.
- 일정 저장이 schedule 기간 밖 날짜를 허용하던 문제.
- 일정 저장이 roster source에 없는 임의 팀 이름을 허용하던 문제.
- 같은 날짜에 같은 팀을 여러 경기에 배정할 수 있던 문제.
- 일정 전환 후 이전 일정의 선택 날짜가 새 일정 저장 payload로 전달될 수 있던 문제.

실행 검증도 완료되어 있다.

- 대상 Vitest 8개 파일 45개 테스트 통과.
- `npm run build` 통과.
- `npx playwright test playwright/league-schedule.spec.ts` 2개 테스트 통과.

따라서 현재 남은 문제는 공개 화면 또는 일반 운영 플로우를 즉시 깨뜨리는 종류보다는, 기존 데이터 호환성과 동시성 경계에서 발생할 수 있는 좁은 안정성 리스크다.

## 해결 수준

### 명예의 전당

해결 수준은 높다.

현재 `registerHallOfFameEntry()`는 `auction_archives/{archiveId}`를 서버 transaction 안에서 다시 읽고, archive 안의 팀만 우승팀으로 저장한다. 새 수동 등록은 `hall_of_fame/archive:{archiveId}` 결정적 문서 id를 사용하므로 같은 archive의 신규 중복 등록은 막힌다.

다만 기존 `.add()` 기반 문서가 이미 `hall_of_fame`에 있고 같은 `archive_id`를 가진 경우, 직접 서버 액션 호출이 `archive:{archiveId}` 문서를 새로 만들 수 있다. UI의 archive 목록에서는 기존 문서의 `archive_id`를 제외하므로 일반 화면 플로우에서는 낮은 가능성이지만, 서버 액션 자체의 불변식으로는 아직 완전히 닫히지 않았다.

### 일정 저장

해결 수준은 높다.

`saveLeagueScheduleDay()`는 저장 전 schedule을 읽고 date key가 기간 안인지 확인한다. roster source에서 복원한 팀 이름만 저장하며, 같은 경기의 동일 팀과 같은 날짜 중복 팀 배정을 모두 거부한다. fixture도 같은 규칙을 적용한다.

남은 경계는 roster 검증이 transaction 밖에서 수행된다는 점이다. archive 기반 일정은 사실상 정적인 source라 문제가 작다. room 기반 일정은 저장 직전과 실제 write 사이에 room roster가 바뀔 수 있으나, 현재 운영 모델에서 일정은 주로 완료 archive 기반으로 생성되므로 즉시 필수 리스크는 낮다.

### 일정 결과 등록과 종료

해결 수준은 중간 이상이다.

결과 등록은 기존 match id를 찾아 transaction으로 점수를 저장하므로 임의 match 생성에는 쓰이지 않는다. 일정 종료도 roster source에서 우승팀을 찾아 `hall_of_fame/schedule:{scheduleId}` 결정적 문서를 만든다.

다만 결과 등록은 date range와 roster source를 다시 검사하지 않는다. 정상 경로에서는 `saveLeagueScheduleDay()`가 이미 검증한 match만 결과 등록 대상이 되므로 충분하지만, 과거에 저장된 잘못된 match day 또는 직접 DB 수정으로 들어온 데이터까지 방어하려면 추가 검증이 필요하다.

## 최소 필수 개선 전제

현재 기준으로 최소한으로 필수적인 후속 개선은 하나다.

### 기존 명예의 전당 문서와의 중복 등록 방지

전제.

- `hall_of_fame/archive:{archiveId}` 결정적 문서 존재 여부만으로 중복을 판단하지 않는다.
- 같은 `archive_id`를 가진 기존 `.add()` 문서가 이미 있으면 새 `archive:{archiveId}` 문서를 생성하지 않는다.
- UI archive 제외 목록뿐 아니라 `registerHallOfFameEntry()` 서버 액션 자체가 이 불변식을 보장한다.
- 기존 `.add()` 문서를 마이그레이션하지 않아도 중복 생성은 막아야 한다.

권장 구현 방향.

- transaction 진입 전 또는 transaction 안에서 같은 `archive_id`를 가진 hall of fame 문서 존재 여부를 확인한다.
- Firestore transaction에서 query 사용이 부담되면, 최소 구현은 등록 직전에 `hall_of_fame.where('archive_id', '==', archiveId).limit(1).get()`을 수행하고, deterministic doc existence와 함께 중복을 거부한다.
- 완전한 동시성까지 보려면 별도 `hall_of_fame_archive_index/{archiveId}` 문서 또는 deterministic id 마이그레이션을 검토한다.

성공 기준.

- 기존 `.add()` 문서가 `archive_id: arc1`을 갖고 있으면 `registerHallOfFameEntry({ archiveId: 'arc1' })`는 실패한다.
- 새 `archive:arc1` 문서가 이미 있어도 동일하게 실패한다.
- `getAuctionArchivesForHof()`의 제외 목록과 서버 액션 중복 판단이 같은 archive id 기준을 공유한다.
- 기존 명예의 전당 표시와 삭제 동작은 유지된다.

최소 테스트.

- `src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts`에 legacy `.add()` 문서가 같은 `archive_id`를 가진 경우 등록을 거부하는 테스트를 추가한다.
- 기존 deterministic 중복 등록 테스트는 유지한다.

## 필수는 아니지만 다음 안정화 후보

- `registerLeagueMatchResult()`에서 schedule 기간과 roster source를 다시 검증한다.
- room 기반 일정 저장에서 roster 검증과 write 사이의 동시성 경계를 좁힌다.
- `endsAt`이 없는 일정의 미래 날짜 상한을 운영 정책으로 정한다.
- 명예의 전당 archive id index 컬렉션을 도입해 대량 기록에서도 제외 목록과 중복 검사를 비용 예측 가능하게 만든다.

이 항목들은 현재 검증된 일반 운영 플로우 기준으로는 즉시 필수라기보다, 운영 규모가 커지거나 DB 직접 보정이 잦아질 때 우선순위가 올라가는 후보로 본다.
