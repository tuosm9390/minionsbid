# 보안 메모 — Minions Bid

작성일: 2026-04-27
최근 갱신: 2026-05-07
대상: Firebase / Server Action 경계

---

## 1. 현재 보안 모델

- 중요한 변경은 기본적으로 Next.js Server Actions + Firebase Admin SDK로 처리한다.
- 예외적으로 입찰 hot path는 `placeBidDirect()`가 Firestore 클라이언트 SDK transaction을 1차 경로로 사용한다.
- direct bid 쓰기는 `/api/room-auth/firebase-token`이 발급한 Firebase custom token claim과 `firestore.rules`의 `isBidUpdate()` / `isBidHistoryCreate()`로 제한한다.
- 리그 일정 관리 변경은 서버 공통 관리자 가드로 보호된다.
- Firestore rules는 공개 읽기 컬렉션, 서버/관리자 쓰기 컬렉션, LEADER direct bid 쓰기 예외를 구분한다.

현재 공개 읽기 대상:
- `league_schedules`
- `league_schedules/{scheduleId}/match_days`
- `auction_archives`
- `hall_of_fame`
- `rooms/{roomId}` 단건 조회
- `rooms/{roomId}/teams`
- `rooms/{roomId}/players`
- `rooms/{roomId}/messages`
- `rooms/{roomId}/bids`

현재 쓰기 대상:
- 위 컬렉션의 쓰기는 `admin` custom claim 또는 서버 경유만 허용하는 방향을 유지한다.
- 예외: `rooms/{roomId}`의 `active_bid`, `timer_ends_at`, `auction_revision` 변경과 `rooms/{roomId}/bids` 생성은 LEADER custom token claim이 있고 rules 검증을 통과한 경우에만 클라이언트 직접 쓰기를 허용한다.

---

## 2. 일정 관리 보안 상태

2026-04-27 기준 일정 관리 서브시스템은 다음이 적용되어 있다.

- `createLeagueSchedule`, `saveLeagueScheduleDay`, `registerLeagueMatchResult`, `deleteLeagueSchedule`, `completeLeagueSchedule`는 모두 서버 관리자 코드 검증 필요
- 날짜 저장, 결과 등록, 일정 종료는 transaction 기반
- 완료 일정은 기본 read-only이며, 관리자 코드 검증 뒤에만 편집 가능

이 부분의 현재 리스크는 rules보다 운영 모델이다.
- 공개 `/league-schedule` 경로를 계속 유지할지
- 관리자 전용 편집 경로를 분리할지

이 결정은 `doc/results/260427_LeagueScheduleArchitectureDecision.md`를 따른다.

---

## 3. 경매방 Firestore 상태

2026-04-27 이후 `rooms` 계층의 역할 토큰 노출 리스크는 1차 정리되었다.

완료된 조치:
- 신규 방 생성은 `room_auth_secrets/{roomId}` + `team_tokens/{teamId}`에 역할 토큰을 저장한다.
- 공개 `rooms` / `teams` 문서에는 신규 토큰 필드를 더 이상 쓰지 않는다.
- legacy cleanup으로 기존 public room/team token 필드를 제거했다.
- `room_auth_secrets`와 `team_tokens`는 client read/write를 모두 차단한다.
- top-level `rooms` list는 차단하고, room id를 아는 클라이언트의 단건 read와 하위 구독 read만 허용한다.
- LEADER direct bid는 custom token claim 기반 rules로 쓰기 범위를 좁혔다.

남은 리스크:
- room id를 아는 클라이언트는 `rooms/{roomId}` 단건과 `teams`, `players`, `messages`, `bids` 하위 컬렉션을 읽을 수 있다.
- direct bid rules는 Firestore rules 표현력 안에서 방/역할/팀/금액/타이머/잔액을 검증하지만, 더 세밀한 read authorization까지 완성한 상태는 아니다.

---

## 4. 다음 보안 작업

### 4.1. 1순위

`rooms` 계층의 민감 토큰 분리는 완료된 상태로 유지해야 한다.

2026-04-27 구현 상태:
- 신규 방 생성은 `room_auth_secrets/{roomId}` + `team_tokens/{teamId}`에 토큰 저장
- 공개 `rooms` / `teams` 문서에는 신규 토큰 필드를 더 이상 쓰지 않음
- `/api/room-auth`와 `/api/room-links`는 private auth 문서를 우선 사용
- 기존 방 호환을 위해 legacy public token 필드는 fallback으로만 읽음
- legacy cleanup 스크립트: `npm run migrate:room-auth-secrets:dry-run` / `npm run migrate:room-auth-secrets`
- legacy cleanup 실행 결과: 4개 room, 8개 team 문서의 public token 필드 정리 완료
- auth 감사 스크립트: `npm run audit:room-auth-secrets`

2026-05-06 추가 구현 상태:
- `/api/room-auth/firebase-token`이 room cookie 검증 후 Firebase custom token을 발급
- LEADER token claim: `roomId`, `role`, `teamId`
- `isBidUpdate(roomId)`는 변경 가능 필드를 `active_bid`, `timer_ends_at`, `auction_revision`으로 제한
- `isBidHistoryCreate(roomId)`는 LEADER의 bid history 생성만 제한적으로 허용

### 4.2. 2순위

현재 direct bid에 도입된 custom token 기반 식별을 read rules까지 확장할지 검토.

### 4.3. 3순위

배포 전 rules 검증 절차를 문서화.
- 어떤 컬렉션이 공개 읽기인지
- 어떤 컬렉션이 서버 전용인지
- 민감 필드가 공개 문서에 섞여 있지 않은지

---

## 5. 현재 결론

- 일정 관리 쪽은 서버 가드 + transaction + 테스트까지 포함해 1차 안정화가 끝났다.
- 경매방 쪽은 신규 데이터 기준 token segregation의 핵심 경로를 반영했다.
- legacy room/team 문서에 남아 있던 public token 필드도 정리 완료했다.
- Firestore rules는 `rooms` 컬렉션 전체 list는 막고, `roomId`를 아는 경우의 room 단건 조회와 하위 실시간 구독 컬렉션만 공개 read로 허용하도록 좁혔다.
- 입찰 hot path는 client direct transaction을 허용하지만, LEADER custom token claim과 rules 검증을 통과한 제한된 필드/문서 쓰기만 가능하다.
- 위 rules는 2026-04-27에 Firebase 프로젝트 `gen-lang-client-0499827443`의 `minionsbid` named database까지 배포 완료.
- 라이브 스모크 검증 결과:
  - `rooms/{roomId}` 단건 조회 허용
  - `teams`, `players`, `messages`, `bids` 하위 컬렉션 read 허용
  - top-level `rooms` list 차단
  - `room_auth_secrets` 및 `team_tokens` client read 차단
- 운영 주의:
  - 저장소의 `.firebaserc`는 실제 프로젝트 ID를 고정하지 않는다.
  - Firebase CLI 배포는 항상 `--project <id>`를 명시한다.
- 다음 단계는 필요 시 Firebase Auth 또는 custom token 기반 식별을 도입해 공개 read 범위를 더 세밀하게 줄이는 것이다.
