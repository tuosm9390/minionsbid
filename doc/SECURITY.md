# 보안 메모 — Minions Bid

작성일: 2026-04-27
대상: Firebase / Server Action 경계

---

## 1. 현재 보안 모델

- 중요한 변경은 Next.js Server Actions + Firebase Admin SDK로 처리한다.
- 리그 일정 관리 변경은 서버 공통 관리자 가드로 보호된다.
- Firestore rules는 공개 읽기 컬렉션과 관리자 쓰기 컬렉션을 구분하는 최소 경계만 담당한다.

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

## 3. 경매방 Firestore 리스크

현재 가장 큰 보안 부채는 `rooms` 계층이다.

문제:
- legacy 데이터에서는 `rooms` 문서에 `organizer_token`, `viewer_token`이 함께 저장될 수 있음
- legacy 데이터에서는 `rooms/{roomId}/teams/{teamId}` 문서에 `leader_token`이 함께 저장될 수 있음
- 동시에 클라이언트는 Firestore `onSnapshot`으로 `rooms`, `teams`, `players`, `messages`, `bids`를 직접 구독함

의미:
- `rooms/*`를 공개 read로 열면 역할 토큰이 그대로 노출된다
- `rooms/*`를 닫으면 현재 클라이언트 실시간 구독 구조가 동작하지 않는다

즉, 이 문제는 rules 한 줄로 해결되지 않는다.

---

## 4. 다음 보안 작업

### 4.1. 1순위

`rooms` 계층에서 민감 토큰을 분리해야 한다.

권장 방향:
- 공개 문서: 화면 렌더링에 필요한 room/team/player/message/bid 정보만 유지
- 비공개 문서: organizer/viewer/leader token과 권한 판별 정보 저장
- `/api/room-auth`는 비공개 문서를 기준으로 검증

예시 구조:

```text
rooms/{roomId}
rooms/{roomId}/teams/{teamId}
rooms_private/{roomId}
rooms_private/{roomId}/team_auth/{teamId}
```

2026-04-27 구현 상태:
- 신규 방 생성은 `room_auth_secrets/{roomId}` + `team_tokens/{teamId}`에 토큰 저장
- 공개 `rooms` / `teams` 문서에는 신규 토큰 필드를 더 이상 쓰지 않음
- `/api/room-auth`와 `/api/room-links`는 private auth 문서를 우선 사용
- 기존 방 호환을 위해 legacy public token 필드는 fallback으로만 읽음
- legacy cleanup 스크립트: `npm run migrate:room-auth-secrets:dry-run` / `npm run migrate:room-auth-secrets`
- legacy cleanup 실행 결과: 4개 room, 8개 team 문서의 public token 필드 정리 완료
- auth 감사 스크립트: `npm run audit:room-auth-secrets`

### 4.2. 2순위

Firebase client auth 또는 최소한 custom token 기반 식별을 도입해 rules에서 역할별 읽기 범위를 더 세밀하게 제한할지 검토.

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
