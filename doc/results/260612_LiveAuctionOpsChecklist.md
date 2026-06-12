# 실전 경매 운영 체크리스트 (2026-06-12 작성, 경매 예정일 D-10 기준)

> 대상: 2026-06-22경 예정된 실전 경매.
> 원칙: **D-5부터 코드 프리즈** — 버그 수정 외 코드 변경 금지. 이 문서의 항목은 전부 코드가 아닌 운영 확인 작업이다.
> 관련 문서: `doc/results/260611_CodebaseImprovementPlan.md`(개선 이력), `load-tests/LOAD_TEST_PLAN.md` 9장(리허설 결과).

---

## 1. 지금 바로 확인 (D-10 ~ D-7)

### 1-1. [ ] 프로덕션 배포 상태 확인

최근 푸시(`28a4a03`까지)에는 latency 관측, E2E 안정화, 보안 수정이 포함되어 있다. 프로덕션에 반영됐는지 확인한다.

- **확인 방법**: Vercel 대시보드 → 프로젝트 → Deployments에서 최신 Production 배포의 커밋 해시가 `28a4a03`(또는 그 이후)인지, 상태가 Ready인지 확인.
- **통과 기준**: 최신 master 커밋이 Production에 Ready 상태로 배포됨.
- **실패 시**: 빌드 로그 확인. 로컬에서는 `npm run build`가 통과한 상태이므로, 실패한다면 환경 변수 누락일 가능성이 높다.

### 1-2. [ ] Vercel 환경 변수 점검

- **확인 방법**: Vercel → Settings → Environment Variables (Production)에서 아래 항목 존재 확인.

| 변수 | 필수 여부 | 비고 |
|------|----------|------|
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_DATABASE_URL` | 필수 | 기존 운영 중이면 이미 설정됨 |
| `FIRESTORE_DATABASE_ID` | 필수 | named database 사용 중 — 로컬 `.env.local` 값과 동일해야 함 |
| `NEXT_PUBLIC_FIREBASE_*` 일체 | 필수 | 클라이언트 SDK 용 |
| `CRON_SECRET` | **권장 (선택)** | 아래 1-3 참고 |

- **통과 기준**: 필수 항목 전부 존재. 값 변경 시 재배포가 필요하다는 점 주의.

### 1-3. [ ] CRON_SECRET 설정 (선택이지만 권장)

watchdog(`/api/auction-watchdog`)은 핵심 경로가 아닌 선택적 백업이지만, 실전 당일 경매 상태가 꼬였을 때 수동 sweep을 돌릴 수 있는 비상 수단이 된다. 설정 안 하면 라우트가 항상 401이며 경매 진행에는 지장 없다.

- **생성**: 터미널에서 실행 후 출력된 64자 문자열을 사용.
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **설정 위치**: Vercel Production 환경 변수 `CRON_SECRET` + 로컬 `.env.local`(같은 값) → Vercel 재배포.
- **동작 확인**: 설정·배포 후 아래 호출이 200을 반환하는지 확인 (미설정 헤더로는 401이어야 정상).
  ```powershell
  curl -H "Authorization: Bearer <생성한 값>" https://<운영 도메인>/api/auction-watchdog
  ```

### 1-4. [ ] latency 관측 동작 확인 (배포 후 1회)

이번에 추가된 운영 관측이 실제로 적재되는지 확인한다. 이 확인이 끝나야 1-5(TTL)도 진행 가능하다.

- **확인 방법**: 운영 URL에서 테스트 방을 하나 만들고 팀장 링크로 입장해 입찰을 2~3회 수행 → 30초 이상 대기(또는 탭 닫기) → Firebase Console → Firestore → **`FIRESTORE_DATABASE_ID`에 해당하는 데이터베이스 선택**(기본 `(default)` 아님 주의) → `latency_reports` 컬렉션에 문서가 생겼는지 확인.
- **문서 필드 해석**:

| 필드 | 의미 | 정상 범위 |
|------|------|----------|
| `p95_end_to_end_ms` | 입찰 클릭→화면 반영 p95 | **≤ 500ms 목표** |
| `sample_count` | 집계된 완료 입찰 수 | 입찰 횟수와 비슷 |
| `source_counts.rtdb` | RTDB 정상 경로로 반영된 수 | 대부분이 여기에 있어야 함 |
| `source_counts.room-fallback` | Firestore 폴백으로 반영된 수 | 0에 가까울수록 좋음 |
| `fallback_count` | placeBid 서버 액션 폴백 발동 수 | **0이어야 정상** — 0이 아니면 `fallback_reasons` 기록해 둘 것 |

- **통과 기준**: 문서 생성됨 + `fallback_count: 0` + `p95_end_to_end_ms ≤ 500`.
- **뒷정리**: 테스트 방은 종료 처리.

### 1-5. [ ] Firestore TTL 정책 생성 (1-4 이후)

`latency_reports` 문서는 `expires_at`(+30일)을 갖고 있다. TTL 정책을 등록하면 자동 정리된다. 1-4에서 첫 문서가 생긴 뒤에 진행해야 콘솔 드롭다운에 컬렉션이 보인다.

- **방법 A (콘솔)**: console.cloud.google.com → Firestore → 해당 데이터베이스 선택 → "TTL(수명)" 탭 → 정책 만들기 → 컬렉션 그룹 `latency_reports`, 필드 `expires_at`.
- **방법 B (CLI)**:
  ```
  gcloud firestore fields ttls update expires_at --collection-group=latency_reports --database=<FIRESTORE_DATABASE_ID 값> --project=<FIREBASE_PROJECT_ID 값>
  ```
- **통과 기준**: TTL 정책 상태가 Active. 미설정해도 동작에는 무관(데이터만 누적).

---

## 2. 리허설 겸 스모크 테스트 (D-3 ~ D-1)

운영 URL에서 실제 기기 2~3대(주최자 PC + 팀장 1~2명, 가능하면 모바일 1대 포함)로 경매 전체 흐름을 1회 돌린다. **부하 검증은 이미 완료**(로컬 prod 빌드, p95 수 ms — `LOAD_TEST_PLAN.md` 9장)이므로 여기서는 실 Firebase·Vercel 환경의 기능 동작만 본다.

### 2-1. [ ] 전체 흐름 스모크

순서대로 확인하고 각 단계에서 모든 참가 화면이 동기화되는지 본다.

1. 방 생성 (팀 구성, 포인트, 선수 명단 업로드 — xlsx 업로드 포함)
2. 단축 URL 생성 → 팀장 링크 배포 → 팀장 입장 (`role=LEADER&teamId=...` 파라미터 유지 확인)
3. 추첨(draw) → 추첨 연출 → 경매 시작
4. 입찰 수 회 (마지막 8초 이내 입찰 시 타이머 연장 확인)
5. 낙찰 → 로스터·포인트 반영 (모든 화면 동일 값)
6. 한 명 유찰시키기 → 재경매 시작 → 재경매 타이머 정상 적용 확인
7. 채팅·공지 송수신 (중복 표시 없는지)
8. **팀장 탭 강제 종료 → 경매 자동 일시정지 → 재입장 → 자동 재개** (presence guard)

- **통과 기준**: 전 단계에서 화면 간 불일치·멈춤 없음. 8번에서 일시정지/재개 메시지가 모든 화면에 표시.

### 2-2. [ ] 체감 응답 확인 + 관측 데이터 대조

- 입찰 클릭→반영이 체감상 즉각적인지(0.5초 이내).
- 스모크 후 `latency_reports`에서 이 세션의 `p95_end_to_end_ms`와 `fallback_count` 확인. **여기서 `fallback_count > 0`이거나 p95 > 500ms면 실전 전에 원인을 봐야 한다** — `fallback_reasons` 값과 함께 보고할 것.

### 2-3. [ ] 단축 URL 제약 인지

- `/api/short-links`는 요청당 링크 20개, IP당 분당 30요청 제한이 있다. 8팀 기준 한 번에 생성하면 충분히 여유 있으나, 반복 재생성 시 429가 날 수 있다 — 429가 나오면 1분 대기.

### 2-4. [ ] CI 그린 확인

- GitHub → Actions → quality-ci가 최신 master에서 통과 상태인지 확인. 코드 프리즈 시작 시점의 기준선이 된다.

---

## 3. 실전 당일 (D-day)

### 3-1. [ ] 시작 전 (경매 30분 전)

- [ ] 운영 URL에 미리 접속해 페이지를 한 번 로드한다 — Vercel 함수 워밍업 (Cold Start는 리허설에서 실측하지 못한 유일한 항목).
- [ ] 주최자 PC: 크롬 최신, 유선 또는 안정적 네트워크, 절전 모드 해제.
- [ ] 참가자 안내 멘트 준비: "끊기면 같은 링크로 재입장하면 된다", "팀장이 나가면 경매가 자동으로 멈췄다가 재접속 시 재개된다".
- [ ] 방 생성은 시작 30분~1시간 전에 미리 완료, 링크 배포까지 끝내 둔다.

### 3-2. [ ] 운영 중 모니터링

- **이상 징후 시 확인 순서**: ① 해당 참가자 새로고침 → ② 주최자 화면 기준으로 상태 판단(주최자 화면이 canonical) → ③ Vercel 대시보드 → Logs에서 에러 확인.
- **타이머/경매 상태가 꼬인 것 같을 때** (CRON_SECRET 설정한 경우):
  ```powershell
  curl -H "Authorization: Bearer <CRON_SECRET>" https://<운영 도메인>/api/auction-watchdog
  ```
  만료된 경매를 일괄 정리(sweep)한다. 핵심 복구는 클라이언트 recover 경로가 자동으로 하므로, 이건 그래도 안 풀릴 때의 마지막 수단.
- **하지 말 것**: 경매 진행 중 배포(재배포 시 서버리스 인스턴스 교체로 순단 가능). 문제가 있어도 경매 종료 후 수정.

### 3-3. [ ] 종료 직후

- [ ] 결과 아카이브 저장(명예의 전당 저장 기능) 확인.
- [ ] 이슈가 있었다면 발생 시각·증상을 그 자리에서 메모 (Vercel 로그는 보존 기간이 짧다).

---

## 4. 경매 이후 (사후 작업)

### 4-1. [ ] latency 데이터 분석 → Phase 3-9 결정

- `latency_reports`에서 실전 세션 문서들을 모아 확인:
  - `fallback_count` 합계가 **0이면** → `useBiddingControl.ts`의 placeBid 서버 액션 폴백 경로 제거 진행 (Phase 3-9).
  - **0이 아니면** → `fallback_reasons` 분석 후 폴백 유지 + 원인 수정.
  - `p95_end_to_end_ms`가 500ms를 넘는 문서가 있으면 `source_counts` 비율(rtdb vs room-fallback)로 병목 구간 판단.

### 4-2. [ ] 후속 개선 재개

- Phase 3-10: 스케줄 대형 컴포넌트 분할 (일정 관리 아키텍처 미결정 2건 결정 포함 — TODOS.md 참고).
- Phase 4: RTDB/Firestore read 범위 제한 — 내부 공유 전용 운영이므로 낮은 우선순위 유지.
- 운영 중 발견된 이슈를 TODOS.md에 기록.

---

## 부록: 빠른 참조

| 무엇 | 어디서 |
|------|--------|
| latency 리포트 | Firebase Console → Firestore → named DB → `latency_reports` |
| 서버 로그 | Vercel 대시보드 → 프로젝트 → Logs |
| 수동 sweep | `curl -H "Authorization: Bearer <CRON_SECRET>" https://<운영 도메인>/api/auction-watchdog` |
| 부하 리허설 결과 | `load-tests/LOAD_TEST_PLAN.md` 9장 |
| 개선 이력 전체 | `doc/results/260611_CodebaseImprovementPlan.md` |
