# Firebase 통합 환경 테스트 구현 계획

## 1. 목표

fixture가 아닌 Firebase Emulator Suite를 사용해 주최자 1명과 팀장 8명의 경매 권한 흐름을 검증한다.

최종 목표 명령.

```bash
npm run test:e2e:auction:8leaders:emulator
```

직접 화면 확인 명령.

```bash
npm run test:e2e:auction:8leaders:emulator:headed
```

이 명령은 다음을 실제 Firebase SDK 경로로 검증해야 한다.

- `createRoom()`이 Firestore와 `room_auth_secrets`에 실제 문서를 만든다.
- `/api/room-auth/firebase-token`이 각 팀장 token을 검증하고 custom token을 발급한다.
- 각 브라우저 context가 Auth emulator에 서로 다른 팀장 claim으로 로그인한다.
- RTDB emulator에 presence가 등록된다.
- Firestore rules가 direct bid update와 bid history create를 허용한다.
- 8개 팀장 화면 모두 경매 시작 후 입찰 UI 권한을 받는다.

## 2. 구현 원칙

- 기존 fixture 테스트는 유지한다.
- `E2E_AUCTION_FIXTURE`와 `NEXT_PUBLIC_E2E_AUCTION_FIXTURE`를 켜지 않는 별도 runner를 만든다.
- 운영 Firebase에 쓰지 않는다.
- Firebase rules를 완화하지 않는다.
- production build/start 기반으로 실행해 개발 오버레이가 보이지 않게 한다.
- Emulator 연결은 명시 플래그가 있을 때만 켠다.

## 3. 단계 1. Emulator 연결 기반 추가

### 3-1. `firebase.json`

`emulators` 설정을 추가한다.

권장 변경.

```json
{
  "emulators": {
    "firestore": {
      "host": "127.0.0.1",
      "port": 8080
    },
    "database": {
      "host": "127.0.0.1",
      "port": 9000
    },
    "auth": {
      "host": "127.0.0.1",
      "port": 9099
    },
    "ui": {
      "enabled": true,
      "host": "127.0.0.1",
      "port": 4000
    }
  }
}
```

### 3-2. Client SDK 연결

대상 파일.

- `src/lib/firebase.ts`.
- `src/features/auction/realtime/clientAdapter.ts`.

변경 내용.

- `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1`일 때만 emulator 연결을 수행한다.
- Firestore: `connectFirestoreEmulator(db, host, port)`.
- Auth: `connectAuthEmulator(auth, url, { disableWarnings: true })`.
- RTDB: `connectDatabaseEmulator(rtdb, host, port)`.

주의.

- HMR과 다중 import에서 중복 연결되지 않도록 global flag를 둔다.
- `getDatabase()` 호출 뒤 RTDB emulator를 연결해야 한다.
- production 배포 환경에서 플래그가 없으면 기존 동작과 같아야 한다.

### 3-3. Admin SDK 연결

대상 파일.

- `src/lib/firebaseAdmin.ts`.

변경 내용.

- `USE_FIREBASE_EMULATOR=1`이면 service account cert 대신 project id 기반 초기화를 허용한다.
- `E2E_SCHEDULE_FIXTURE=1`이 Admin 초기화를 막는 현재 로직은 통합 runner에서 사용하지 않는다.
- 환경 변수는 runner에서 다음처럼 설정한다.

```env
USE_FIREBASE_EMULATOR=1
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_PROJECT_ID=minionsbid-e2e
NEXT_PUBLIC_FIREBASE_PROJECT_ID=minionsbid-e2e
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1
```

### 3-4. Firestore database id

1차 구현은 운영과 동일하게 `minionsbid` named database를 사용한다.

환경 변수.

```env
NEXT_PUBLIC_FIRESTORE_DATABASE_ID=minionsbid
FIRESTORE_DATABASE_ID=minionsbid
```

만약 emulator named database 지원 문제로 막히면, 구현 중단 후 `(default)` 전환 여부를 별도 판단한다.

## 4. 단계 2. Emulator runner 작성

새 파일.

- `scripts/run_auction_8leaders_emulator.js`.

역할.

1. Firebase Emulator Suite를 시작한다.
2. Next production build를 실행한다.
3. `next start`를 emulator 환경 변수와 함께 시작한다.
4. Playwright 통합 spec을 실행한다.
5. Playwright, Next, Emulator process를 정리한다.

권장 실행 방식.

- `firebase emulators:start --only firestore,database,auth --project minionsbid-e2e`.
- Firebase CLI가 없으면 명확한 오류를 출력한다.
- emulator ready 확인은 포트 connect로 처리한다.
- runner는 `--headed`, `--debug` 같은 추가 Playwright args를 그대로 전달한다.

`package.json` 추가.

```json
{
  "test:e2e:auction:8leaders:emulator": "node ./scripts/run_auction_8leaders_emulator.js",
  "test:e2e:auction:8leaders:emulator:headed": "node ./scripts/run_auction_8leaders_emulator.js --headed",
  "test:e2e:auction:8leaders:emulator:debug": "node ./scripts/run_auction_8leaders_emulator.js --debug"
}
```

## 5. 단계 3. 통합 테스트 helper route 작성

fixture route는 사용하지 않는다.

새 route 후보.

- `src/app/api/e2e/firebase-auction/create/route.ts`.
- `src/app/api/e2e/firebase-auction/state/route.ts`.
- `src/app/api/e2e/firebase-auction/cleanup/route.ts`.

전제.

- 이 route들은 `USE_FIREBASE_EMULATOR=1`일 때만 활성화한다.
- 운영 Firebase에서는 404 또는 403을 반환한다.
- `E2E_AUCTION_FIXTURE=1`과 별개로 동작한다.

### 5-1. create route

역할.

- `createRoom()` Server Action과 같은 서버 경계로 8팀 방을 만든다.
- 결과로 organizer, viewer, 8개 leader link를 반환한다.
- 반환 link에는 `role`, `teamId`, `token` 또는 `authToken`을 포함한다.

권장 구현.

- 기존 `createRoom()`을 직접 import해 사용한다.
- payload는 8팀장 visual fixture와 유사하게 생성하되 Firestore에 실제 문서가 생성되어야 한다.
- route 응답에 `roomId`, `captainLinks`, `organizerLink`, `viewerLink` 포함.

### 5-2. state route

역할.

- Admin SDK로 Firestore/RTDB 상태를 읽어 진단한다.
- room document, teams count, players count, room auth secret 존재 여부, team token count, presence count를 반환한다.

### 5-3. cleanup route

역할.

- 테스트 room과 관련 subcollection, `room_auth_secrets`, RTDB presence/signals를 삭제한다.
- cleanup 실패 시 삭제 대상 id를 응답에 남긴다.

## 6. 단계 4. 8팀장 Firebase 통합 spec 작성

새 파일.

- `playwright/auction-eight-leaders-emulator.spec.ts`.

테스트 1. 8팀장 권한 happy path.

흐름.

1. `/api/e2e/firebase-auction/create`로 8팀 방 생성.
2. organizer context 1개와 leader context 8개 생성.
3. 각 leader link로 접속.
4. 각 page에서 Firebase Auth current user claim을 읽는다.
5. claim의 `roomId`, `role`, `teamId`가 링크와 일치하는지 확인한다.
6. RTDB presence count가 8 leader 이상이 될 때까지 polling한다.
7. organizer 또는 helper route로 첫 선수를 추첨/경매 시작한다.
8. 8개 leader page 모두에서 `입찰하기` 버튼 enabled, number input visible 확인.
9. 각 팀장이 1회 direct bid를 순차 제출한다.
10. Firestore state에서 `auction_revision`, `active_bid`, `bids` count를 확인한다.
11. cleanup route 실행.

테스트 2. 잘못된 token negative case.

흐름.

1. 정상 8팀 room 생성.
2. 한 leader link의 token만 다른 팀 token 또는 임의 token으로 바꾼다.
3. 해당 페이지에서 custom token 발급 실패 또는 입찰 불가 상태를 확인한다.
4. 정상 leader 하나는 입찰 가능함을 확인한다.
5. cleanup route 실행.

## 7. 진단 정보

실패 시 다음 정보를 첨부한다.

- leader별 URL.
- role/teamId/token hash.
- Firebase Auth uid.
- ID token claims.
- 입찰 버튼 상태.
- Firestore room `active_bid`, `auction_revision`, `current_player_id`.
- bid count.
- RTDB presence count와 leader teamIds.
- `/api/room-auth/firebase-token` 실패 status가 있으면 status와 body.

첨부 파일 이름 예시.

- `firebase-eight-leader-diagnostics.json`.
- `firebase-eight-leader-presence.json`.
- `firebase-eight-leader-room-state.json`.

## 8. 검증 명령

최소 검증.

```bash
npm run test:e2e:auction:8leaders:emulator
```

직접 확인.

```powershell
$env:E2E_VISUAL_PAUSE="1"
npm run test:e2e:auction:8leaders:emulator:headed
```

기존 회귀.

```bash
npm run test:e2e:auction:8leaders
npm run test:e2e:multi-pc
npm run test:e2e:auction
```

Firebase rules 관련 확인.

```bash
npm run smoke:room-rules
```

단, `smoke:room-rules`는 배포된 원격 rules smoke 성격이므로 emulator 통합 테스트와 목적이 다르다. 실패 시 원인을 분리해서 보고한다.

## 9. 커밋 분리

권장 커밋 단위.

1. `Firebase emulator 연결 기반 추가`.
2. `8팀장 Firebase 통합 테스트 runner 추가`.
3. `8팀장 Firebase 통합 Playwright 테스트 추가`.
4. `Firebase 통합 테스트 문서화`.

각 커밋은 최소 검증 결과를 포함한다.

## 10. 리스크와 대응

### named database emulator 호환성

`minionsbid` named database 연결이 emulator에서 막히면 전체 테스트가 진행되지 않는다.

대응.

- 먼저 named database로 시도한다.
- 실패 로그를 근거로 `(default)` 테스트 database로 전환하는 별도 결정을 한다.

### Admin SDK emulator 초기화

현재 Admin 초기화는 service account를 요구한다.

대응.

- `USE_FIREBASE_EMULATOR=1` 전용 초기화 경로를 추가한다.
- 운영 초기화 경로는 건드리지 않는다.

### 8개 direct bid 한 라운드 검증

한 라운드에서 8명이 순차 입찰하면 최고 입찰자 상태 때문에 각 팀의 min bid가 계속 바뀐다.

대응.

- 각 입찰 직전 input value를 읽어서 그대로 제출한다.
- 입찰 후 해당 팀이 `최고 입찰 유지 중`이 되는지 확인한다.
- 이전 최고 팀은 다시 enabled가 되는지 한두 번만 표본 확인한다.

### Emulator process 정리 실패

Windows에서 child process가 남을 수 있다.

대응.

- runner에서 SIGINT/SIGTERM handler를 둔다.
- stop 순서는 Playwright, Next, Firebase emulator 순으로 둔다.
- 필요 시 PID 기반 종료는 사용자 승인 없이 destructive하게 하지 않는다.

## 11. 완료 기준

작업 완료는 다음이 모두 만족될 때로 본다.

- `npm run test:e2e:auction:8leaders:emulator` 통과.
- `npm run test:e2e:auction:8leaders` 통과.
- `npm run test:e2e:multi-pc` 통과.
- `npm run test:e2e:auction` 통과 또는 기존 flaky로 판명된 실패를 재실행 근거와 함께 기록.
- README에 fixture 테스트와 Firebase emulator 통합 테스트의 차이가 명확히 문서화됨.
- 실패 시 teamId/token/claim/presence/firestore state를 추적할 수 있는 첨부가 남음.
