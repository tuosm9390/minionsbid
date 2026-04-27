# League Schedule Architecture Decision

작성일: 2026-04-27  
대상: `/league-schedule` 일정 관리 서브시스템

---

## 1. 배경

일정 관리 서브시스템은 다음 리스크를 안고 있었다.

- 공개 경로에서 일정 생성/저장/결과 등록/삭제/종료가 서버에서 일관되게 보호되지 않음
- `match_days/{dateKey}` 문서의 `matches[]` 배열을 통째로 갱신하는 구조라 동시 수정에 취약
- 일정 하나를 열 때 `rooms` 전체와 최근 `auction_archives`를 훑는 로스터 조회 비용이 큼

2026-04-27 기준 구현은 다음을 이미 반영했다.

- 공통 관리자 가드
- Firestore transaction
- `rosterSourceType` / `rosterSourceId` 기반 직접 조회
- 회귀 테스트와 Playwright fixture 기반 E2E

남은 구조 결정은 두 가지였다.

1. 공개 읽기 전용 경로와 관리자 편집 경로를 분리할지
2. `match_days.matches[]` 구조를 유지할지, 경기별 문서로 분리할지

---

## 2. 결정

### 2.1 권한 모델

**현재 채택안: 단일 공개 경로 유지 + 서버 공통 관리자 가드 + 명시적 관리자 코드 검증**

채택 이유:

- 현재 코드베이스와 운영 흐름에 가장 작은 변경으로 안정성을 확보할 수 있다.
- 이미 구현된 `/league-schedule` 화면과 편집 흐름을 유지하면서 서버 권한 경계를 닫을 수 있다.
- 테스트와 fixture까지 포함해 지금 상태를 반복 검증할 수 있다.

보완 조건:

- 모든 변경 액션은 서버에서 관리자 코드 검증을 통과해야 한다.
- UI 비활성화는 보조 수단일 뿐이며, 서버 가드가 진짜 경계다.
- 완료 일정은 기본 read-only 상태이고, 관리자 코드 검증 후에만 편집이 열린다.

재검토 트리거:

- 실제 운영 관리자가 2명 이상으로 늘어나는 경우
- `/league-schedule` 링크가 커뮤니티 전체에 널리 공유되는 경우
- 감사 추적이나 역할 분리 요구가 생기는 경우

그 시점의 목표 구조:

- 공개 읽기 전용 경로: `/league-schedule`
- 관리자 편집 경로: `/league-schedule/admin`
- 관리자 인증은 shared secret 대신 세션 또는 역할 기반으로 전환 검토

### 2.2 저장 단위

**현재 채택안: `match_days/{dateKey}` 문서 유지 + transaction + revision 보강**

채택 이유:

- per-match 문서 분리보다 구현 비용이 작고, 현재 제품 범위에서는 충분히 방어적이다.
- 일정 저장과 결과 등록을 기존 UI/도메인 모델에서 크게 흔들지 않고 안정화할 수 있다.
- transaction과 revision으로 “조용한 마지막 저장 승리” 리스크를 크게 줄일 수 있다.

보완 조건:

- 날짜 저장, 결과 등록, 일정 종료는 모두 transaction 안에서 처리한다.
- 문서에는 `revision`을 기록한다.
- 결과 보존은 `id + 팀 조합 + 포맷` 일치 조건에서만 허용한다.

재검토 트리거:

- 서로 다른 운영자가 같은 날짜의 서로 다른 경기 행을 실제로 자주 편집하는 경우
- 한 날짜의 경기 수가 증가해 배열 전체 갱신 비용이 체감되는 경우
- 경기 단위 감사 로그, 부분 롤백, 세밀한 충돌 메시지가 필요해지는 경우

그 시점의 목표 구조:

- `league_schedules/{scheduleId}/match_days/{dateKey}/matches/{matchId}`
- 또는 match-level patch API와 optimistic revision 경계

---

## 3. 현재 정리된 원칙

- **Server authority first**: 일정 변경은 항상 서버가 최종 판정한다.
- **Minimal diff now**: 현재는 운영 안정화가 우선이며, 라우트 분리와 문서 분리는 다음 단계 구조 개선으로 남긴다.
- **Deterministic tests required**: 권한/transaction/UI lock 변경에는 unit/component/E2E 회귀 테스트가 따라붙어야 한다.
- **Explicit roster linkage**: 일정은 로스터 소스를 문서에 명시적으로 들고 있어야 한다.

---

## 4. 후속 작업

즉시 필요한 후속 작업은 없다. 현재 우선순위는 구현보다 관찰이다.

- 실제 운영자가 몇 명인지 확인
- 동시에 같은 날짜를 수정하는 빈도 관찰
- 공개 링크 확산 정도 확인

위 세 항목이 커지면 권한 라우팅과 저장 단위를 다음 스프린트에서 다시 연다.
