# Firebase 운영 검증 강화 보고서

작성일: 2026-06-26.

## 요약

현재 서버가 아직 운영 백엔드에 연결되어 있지 않다는 전제에서도, Minions Bid는 Supabase 신규 연결보다 Firebase 연결을 우선하는 것이 유리하다. 이유는 현재 경매 핵심 경로가 이미 Firestore 정본 상태, RTDB presence/fanout, Firebase custom token claim, Firestore Rules direct bid 검증에 맞춰 구현되어 있기 때문이다.

과거 실제 경매에서 주최자 1명과 팀장 8명이 참여했을 때 일부 팀장에게 경매 권한이 제대로 주어지지 않았던 문제는 Firebase 자체의 구조적 한계라기보다, `/api/room-auth/firebase-token`과 RTDB presence write가 같은 인증 경로에 묶여 있어 장애가 “팀장 미접속”처럼 보일 수 있는 문제로 판단한다.

이번 보완 방향은 서비스 전환이 아니라 운영 검증 강화다. 즉, Firebase를 유지하되 custom token 발급, 8팀장 통합 검증, presence 인증 장애 진단, RTDB read 제한 계획, auth secret 감사 절차를 운영 게이트로 고정한다.

## 현재 권한 흐름

현재 팀장 권한은 URL role만으로 결정되지 않는다.

1. 방 생성 시 `room_auth_secrets/{roomId}`와 `team_tokens/{teamId}`에 토큰을 저장한다.
2. 팀장 링크는 `roomId`, `role=LEADER`, `teamId`, `token`을 전달한다.
3. 클라이언트는 `/api/room-auth/firebase-token`으로 Firebase custom token을 요청한다.
4. 서버는 저장된 leader token과 요청 token을 비교한 뒤 custom claim에 `role`, `roomId`, `teamId`를 넣는다.
5. RTDB presence write와 Firestore direct bid는 이 claim을 기준으로 허용된다.

관련 코드.

| 영역 | 파일 | 의미 |
|---|---|---|
| 방별 token 생성 | `src/features/auction/api/roomActions.ts` | organizer/viewer/leader token 생성과 저장 |
| token 검증 | `src/features/auction/utils/roomAuth.ts` | role별 token 비교 |
| custom token 발급 | `src/app/api/room-auth/firebase-token/route.ts` | Firebase Auth claim 발급 |
| direct bid | `src/features/auction/api/placeBidClient.ts` | Firestore client transaction |
| 최종 bid 방어선 | `firestore.rules` | LEADER claim, roomId, teamId, 금액, 정원 검증 |
| presence write | `src/features/auction/hooks/usePresence.ts` | RTDB `presence/{roomId}/{uid}` 기록 |

## 과거 권한 누락 이력 해석

팀장이 방에 들어와 있고 UI에서 팀 정보가 보이는 것과, 실제 경매 권한이 부여된 것은 별개다.

팀장 화면이 표시되는 데 필요한 조건.

- URL의 `roomId`, `role`, `teamId`.
- 공개 Firestore room/teams/players read.

실제 입찰과 presence 등록에 필요한 조건.

- `/api/room-auth/firebase-token` 성공.
- Firebase Auth `signInWithCustomToken()` 성공.
- claim의 `role == LEADER`, `roomId`, `teamId` 일치.
- RTDB/Firestore Rules 통과.

따라서 과거 증상은 “팀장이 접속하지 않았다”가 아니라 “팀장 접속을 증명하는 인증 경로 또는 claim 부여 경로가 실패했다”일 가능성이 있다. 특히 custom token route가 실패하면 direct bid와 presence가 동시에 영향을 받는다.

## Firebase 선택 시 보완 항목

### 1. `/api/room-auth/firebase-token` 배포 smoke를 P0로 둔다

운영 배포 후 최소 세 경로를 확인해야 한다.

| 케이스 | 기대 |
|---|---|
| 누락 입력 | 400 |
| 잘못된 leader token | 403 |
| 정상 leader token | 200 |

이번 작업에서 `npm run smoke:room-auth-firebase-token` 스크립트를 추가했다. 운영에서 아래 환경 변수를 넣어 실행한다.

```bash
ROOM_AUTH_SMOKE_BASE_URL=https://운영도메인 \
ROOM_AUTH_SMOKE_ROOM_ID=room-id \
ROOM_AUTH_SMOKE_LEADER_TEAM_ID=team-id \
ROOM_AUTH_SMOKE_LEADER_TOKEN=leader-token \
npm run smoke:room-auth-firebase-token
```

스크립트 출력은 custom token 값을 `[redacted]`로 치환한다.

### 2. 8팀장 Emulator E2E를 정기 게이트로 유지한다

`npm run test:e2e:auction:8leaders:emulator`는 Firebase Auth, Firestore, RTDB presence, 실제 팀장 8명 입장과 입찰 권한을 함께 검증한다. 이 프로젝트의 과거 장애 이력에 가장 직접적인 회귀 테스트다.

정기 게이트 권고.

- 배포 전 수동 또는 CI 게이트.
- Firebase 관련 패키지, Rules, room auth, presence, 입찰 hot path 변경 시 필수.
- 실패 시 “브라우저 접속 실패”, “custom token 실패”, “presence 누락”, “bid permission denied”를 분리해서 본다.

### 3. 주최자 UI에서 팀장 미접속과 presence 인증 실패를 분리한다

기존에는 custom token route 실패가 팀장 미접속처럼 보일 수 있었다. 이번 작업에서 `hasPresenceAuthError` 상태를 추가하고, `usePresence()`에서 Firebase Auth 실패 시 이를 기록하도록 했다.

표시 정책.

| 상태 | UI 의미 |
|---|---|
| presence auth 정상, 일부 팀장 presence 없음 | 실제 미접속 또는 연결 이탈 |
| presence auth 실패 | 팀장 접속 증명 경로 장애 |

주최자 화면은 presence 인증 실패 시 `PRESENCE 인증 오류` 알림을 표시한다. 운영자는 이 경우 팀장에게 재입장만 요구하기보다 custom token route smoke와 배포 로그를 먼저 확인해야 한다.

### 4. RTDB `presence`와 `signals` read 제한은 단계적으로 진행한다

현재 `database.rules.json`의 `presence/{roomId}`와 `signals/{roomId}` read는 공개다. 보안 관점에서는 `auth.token.roomId == $roomId` 기반으로 좁히는 것이 맞다.

다만 즉시 rules만 바꾸면 viewer 인증 흐름, 초기 `useFirebaseRealtime()` 구독 순서, custom token 획득 전 RTDB read 순서가 함께 영향을 받을 수 있다. 따라서 이번 변경에서는 rules를 바로 좁히지 않고, 보고서에 운영 결정과 선행 조건을 명시한다.

선행 조건.

- VIEWER도 room token 기반 Firebase Auth를 받을지 결정한다.
- `useFirebaseRealtime()`이 RTDB read 전에 room auth를 확보하도록 순서를 조정한다.
- RTDB emulator smoke에 `auth.token.roomId` 기반 read 허용/차단 케이스를 추가한다.
- 기존 관전자 링크와 운영 공유 방식의 영향도를 확인한다.

### 5. 방 생성 후 auth secret 감사 절차를 운영 루틴으로 둔다

`npm run audit:room-auth-secrets`는 방 수, auth doc 누락, organizer/viewer token 누락, 팀별 leader token 누락, legacy public token 잔존 여부를 확인한다.

운영 권고.

- 방 생성 후 경매 시작 전 실행.
- 운영 DB migration 후 실행.
- `teamsMissingAuthToken`이 있으면 해당 팀장은 UI에 들어와도 경매 권한을 받을 수 없으므로 경매를 시작하지 않는다.

## 이번 작업에서 반영한 변경

| 항목 | 반영 |
|---|---|
| firebase-token smoke | `scripts/smoke_room_auth_firebase_token.js`, `npm run smoke:room-auth-firebase-token` 추가 |
| smoke secret redaction | 정상 200 응답의 custom token 값을 `[redacted]`로 치환 |
| presence 인증 실패 상태 | `hasPresenceAuthError`, `setPresenceAuthError` 추가 |
| 주최자 UI 분리 | `AuctionBoard`에서 `PRESENCE 인증 오류`와 일반 연결 끊김 문구 분리 |
| RTDB read 제한 | 즉시 rules 변경 대신 선행 조건과 단계적 계획 문서화 |

## 잔여 리스크

1. RTDB `presence`와 `signals` read가 아직 공개다.
2. VIEWER 인증 정책이 확정되지 않으면 RTDB read 제한을 안전하게 적용하기 어렵다.
3. custom token route는 여전히 direct bid와 presence의 공통 장애점이다.
4. 실제 운영 Firebase와 Vercel 환경의 latency, cold start, 번들링 오류는 Emulator만으로 완전히 검증되지 않는다.

## 최종 판단

현재 코드베이스와 과거 장애 이력을 함께 보면, Supabase로 전환하는 것보다 Firebase 연결을 유지하고 운영 검증을 강화하는 편이 더 유리하다. Supabase로 바꿔도 권한 문제가 사라지지 않고 JWT/RLS/Realtime authorization으로 재구현된다. 반면 Firebase 유지 전략은 이미 구현된 Firestore Rules, RTDB presence, 8팀장 E2E 표면을 활용해 실제 장애 가능성을 더 직접적으로 낮춘다.
