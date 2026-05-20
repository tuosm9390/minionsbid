# Firebase 통합 환경 테스트 전제조건

## 목표

8팀장 경매 권한 문제를 fixture가 아니라 실제 Firebase 경계까지 포함해 검증한다.

여기서 통합 환경 테스트란 다음을 포함한다.

- Firestore `rooms`, `teams`, `players`, `bids`, `messages` 문서 생성과 구독.
- `room_auth_secrets`와 `team_tokens` 기반 역할 token 검증.
- `/api/room-auth/firebase-token` custom token 발급.
- Firebase Auth custom token 로그인.
- Firestore Security Rules 기반 direct bid 허용/차단.
- Realtime Database presence와 signal fanout.
- Playwright 다중 브라우저 컨텍스트에서 주최자 1명과 팀장 8명 동시 접속.

## 현재 상태

현재 8팀장 visual 테스트는 Firebase 통합 테스트가 아니다.

- `E2E_AUCTION_FIXTURE=1`과 `NEXT_PUBLIC_E2E_AUCTION_FIXTURE=1`을 켠다.
- 서버 메모리의 `e2eAuctionFixture`가 방, 팀, 선수, 입찰 상태를 저장한다.
- 클라이언트는 `/api/e2e/auction-fixture/state`를 polling한다.
- 입찰도 `/api/e2e/auction-fixture/command`로 처리한다.
- Firestore, RTDB, Firebase Auth, Firestore Rules는 검증하지 않는다.

통합 테스트에서는 이 fixture 경로를 꺼야 한다.

## 권장 1차 대상

1차 통합 테스트는 운영 Firebase가 아니라 Firebase Emulator Suite를 대상으로 한다.

이유는 다음과 같다.

- 운영 Firebase 데이터를 오염시키지 않는다.
- 반복 실행과 cleanup이 쉽다.
- Firestore Rules, RTDB Rules, Auth custom token 흐름을 실제 SDK 경로로 검증할 수 있다.
- 8팀장 문제의 원인이 token 문서, custom claim, security rules, presence 중 어디인지 좁힐 수 있다.

운영 Firebase 대상 테스트는 2차 수동 검증으로 둔다.

## 필수 선행 변경

### 1. Firebase Emulator 설정

`firebase.json`에 emulator 포트 정의가 필요하다.

권장 포트.

- Firestore: `127.0.0.1:8080`.
- Realtime Database: `127.0.0.1:9000`.
- Auth: `127.0.0.1:9099`.
- Emulator UI: `127.0.0.1:4000`.

현재 `firebase.json`은 rules 경로만 있고 `emulators` 설정이 없다.

### 2. 클라이언트 SDK emulator 연결

현재 `src/lib/firebase.ts`는 `getFirestore()`와 `getAuth()`만 호출하고 emulator 연결을 하지 않는다.

통합 테스트에는 다음 연결이 필요하다.

- `connectFirestoreEmulator(db, '127.0.0.1', 8080)`.
- `connectAuthEmulator(auth, 'http://127.0.0.1:9099')`.
- RTDB는 `getAuctionClientServices()` 또는 Firebase 초기화 경계에서 `connectDatabaseEmulator(rtdb, '127.0.0.1', 9000)`.

주의.

- 연결은 브라우저에서 한 번만 수행되어야 한다.
- production 배포에서 켜지면 안 된다.
- `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1` 같은 명시 플래그가 필요하다.

### 3. Admin SDK emulator 연결

Firebase Admin SDK는 emulator 환경 변수를 통해 로컬 emulator로 연결된다.

필요 환경 변수.

```env
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

현재 `src/lib/firebaseAdmin.ts`는 `E2E_SCHEDULE_FIXTURE=1`이면 Admin 초기화를 스킵한다. 통합 테스트에서는 schedule fixture 플래그와 auction fixture 플래그를 끄고 Admin SDK를 초기화해야 한다.

Emulator 환경에서는 실제 service account private key가 없어도 동작 가능한 초기화 방식을 별도로 둬야 한다.

권장 전제.

- `USE_FIREBASE_EMULATOR=1`이면 `admin.initializeApp({ projectId, databaseURL })` 형태로 초기화한다.
- 운영 service account 인증 경로와 emulator 초기화 경로를 분리한다.

### 4. named Firestore database 문제

이 프로젝트는 운영에서 named database `minionsbid`를 사용한다.

현재 설정.

- `firebase.json` Firestore rules 대상 database: `minionsbid`.
- `.env.local` 예시는 `NEXT_PUBLIC_FIRESTORE_DATABASE_ID=minionsbid`.
- Playwright fixture runner는 `(default)`를 사용한다.

통합 테스트에서 결정해야 할 것.

1. Emulator도 `minionsbid` named database로 맞춘다.
2. 통합 테스트만 `(default)` database로 단순화한다.

권장안은 1번이다. 운영과 같은 database id를 써야 Rules 배포 대상과 SDK 경로 차이를 줄일 수 있다.

전제 환경 변수.

```env
NEXT_PUBLIC_FIRESTORE_DATABASE_ID=minionsbid
FIRESTORE_DATABASE_ID=minionsbid
```

### 5. E2E fixture 플래그 비활성화

Firebase 통합 테스트에서는 아래 플래그를 켜면 안 된다.

```env
E2E_AUCTION_FIXTURE=1
NEXT_PUBLIC_E2E_AUCTION_FIXTURE=1
```

켜져 있으면 클라이언트가 Firestore/RTDB 대신 fixture polling 경로를 사용한다.

일정 기능과 무관한 테스트라도 `E2E_SCHEDULE_FIXTURE=1`은 Admin 초기화를 막으므로 통합 테스트 runner에서는 끄는 것이 기본이다.

### 6. 테스트 데이터 생성 방식

통합 테스트는 실제 `createRoom()` Server Action 경로를 사용해야 한다.

검증해야 할 문서.

- `rooms/{roomId}`.
- `rooms/{roomId}/teams/{teamId}`.
- `rooms/{roomId}/players/{playerId}`.
- `room_auth_secrets/{roomId}`.
- `room_auth_secrets/{roomId}/team_tokens/{teamId}`.

방 생성 후 leader link는 server action 결과 또는 UI 링크 모달에서 얻는다.

권장 1차 구현은 UI를 거치지 않고 helper route 또는 server action 호출로 방을 만든 뒤 Playwright가 각 링크로 접속하는 방식이다. 방 생성 UI 회귀는 후속으로 분리한다.

### 7. Cleanup 전제

Emulator는 테스트 시작마다 비어 있어야 한다.

가능한 방식.

- Emulator process를 테스트마다 새로 띄운다.
- Firestore emulator REST endpoint로 전체 데이터를 reset한다.
- 테스트 전용 project id를 사용하고 import/export를 사용하지 않는다.

운영 Firebase 대상 테스트를 실행할 경우에는 별도 cleanup이 필수다.

- 테스트 room name prefix를 둔다.
- 테스트 종료 후 room, subcollections, `room_auth_secrets`, RTDB presence/signals를 삭제한다.
- cleanup 실패 시 삭제 대상 id를 로그로 남긴다.

## 권한 검증 성공 기준

8팀장 통합 테스트는 최소한 다음을 검증해야 한다.

1. 8개 팀장 링크가 서로 다른 `teamId`와 token을 가진다.
2. `/api/room-auth/firebase-token`이 8개 팀장 모두에게 custom token을 발급한다.
3. 각 브라우저 context의 Firebase Auth user custom claim이 해당 room/team과 일치한다.
4. RTDB presence에 8개 leader 세션이 등록된다.
5. 경매 시작 후 8명 모두 입찰 input과 `입찰하기` 버튼이 enabled 된다.
6. 각 팀장이 최소 1회 direct bid를 제출할 수 있다.
7. Firestore `rooms/{roomId}.active_bid`, `auction_revision`, `bids` history가 규칙을 통과해 갱신된다.
8. 잘못된 token 또는 다른 팀 token으로 입장한 negative case는 입찰이 차단된다.

## 비범위

1차 통합 테스트에서는 다음을 제외한다.

- 실제 운영 Firebase 프로젝트에 대한 자동 write 테스트.
- 전체 경매 종료, 아카이브 저장, 명예의 전당 등록.
- 모바일 실제 기기 테스트.
- 성능 부하 테스트.
- Firebase Rules 완화.

## 실행 명령 전제

최종 목표 명령은 다음 형태가 적절하다.

```bash
npm run test:e2e:auction:8leaders:emulator
```

내부 동작.

1. Firebase Emulator Suite 시작.
2. Next production build.
3. `next start`를 emulator 환경 변수와 함께 시작.
4. Playwright 8팀장 통합 spec 실행.
5. 서버와 emulator 종료.

headed 확인 명령.

```bash
npm run test:e2e:auction:8leaders:emulator:headed
```

## 운영 Firebase 수동 검증 전제

운영 또는 staging Firebase에 직접 붙는 테스트는 별도 명령과 명시적 환경 변수를 요구해야 한다.

필수 전제.

- staging Firebase project 사용 권장.
- production project는 기본 차단.
- `ALLOW_REMOTE_FIREBASE_E2E=1` 같은 명시 플래그 없이는 실행하지 않는다.
- 테스트 room prefix와 cleanup 루틴 필수.
- 실행 전 현재 project id, database id, RTDB URL을 콘솔에 출력한다.

운영 Firebase 자동 테스트는 위험도가 높으므로, Emulator 통합 테스트가 안정화된 뒤에만 진행한다.

## 구현 순서 제안

1. `firebase.json`에 emulator 설정 추가.
2. client SDK emulator 연결 플래그 추가.
3. Admin SDK emulator 초기화 경로 추가.
4. emulator runner script 작성.
5. 8팀장 통합 spec 작성.
6. createRoom 결과에서 8개 leader link를 얻는 helper 작성.
7. custom token 발급과 Auth claim 진단 helper 추가.
8. RTDB presence 진단 helper 추가.
9. 8팀장 입찰 enabled 상태와 1회 direct bid 검증.
10. negative token case 1개 추가.
11. headed 실행 문서화.
12. 기존 fixture 기반 테스트와 통합 테스트를 모두 실행해 회귀 확인.

## 남은 의사결정

- Emulator Firestore database id를 `minionsbid`로 강제할지 여부.
- 테스트 데이터 생성을 UI 경유로 할지, API/helper route로 할지 여부.
- RTDB presence 검증을 Admin SDK read로 할지, 클라이언트 화면 상태로만 볼지 여부.
- 8명 전체 direct bid를 한 라운드에서 순차 검증할지, 각 팀별 별도 라운드/별도 room으로 나눌지 여부.
