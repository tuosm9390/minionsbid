# Minions Bid

리그 오브 레전드 커뮤니티를 위한 실시간 선수 경매 및 시즌 운영 도구입니다.  
선수 드래프트, 리그 일정 관리, 명예의 전당 기록을 하나의 흐름으로 연결해 커뮤니티 리그 운영을 간단하게 만드는 것이 목표입니다.

## 주요 기능

- 실시간 경매방 생성 및 역할별 입장 링크 발급
- 팀장/선수 등록과 Excel 업로드 지원
- 라이브 입찰, 낙찰, 유찰, 재경매 흐름 지원
- 리그 일정 생성, 날짜별 경기 편성, 결과 등록
- 우승팀 명예의 전당 아카이브

## 기술 스택

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Firebase Firestore
- Firebase Realtime Database
- Firebase Admin SDK
- Zustand
- Framer Motion

## 빠른 시작

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 만들고 아래 값을 채웁니다.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=...
NEXT_PUBLIC_FIRESTORE_DATABASE_ID=minionsbid

FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=...
FIRESTORE_DATABASE_ID=minionsbid

HALL_OF_FAME_ADMIN_CODE=...
CRON_SECRET=...
```

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 주요 명령어

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:e2e:auction:8leaders
npm run test:e2e:multi-pc
npm run test:e2e:auction
npm run audit:room-auth-secrets
npm run smoke:room-rules
npm run migrate:room-auth-secrets:dry-run
npm run migrate:room-auth-secrets
```

## 다수 PC 상황 재현 테스트

한 로컬 PC에서 자동 재현할 때는 Playwright가 organizer, 두 leader, viewer를 서로 다른 브라우저 컨텍스트로 띄웁니다. 각 컨텍스트는 쿠키와 세션 저장소가 분리되어 서로 다른 PC의 브라우저처럼 동작합니다.

```bash
npm run test:e2e:multi-pc
```

실제 휴대폰이나 다른 노트북까지 붙여 수동 확인하려면 개발 서버를 LAN에 열어 둡니다.

```bash
npm run dev:lan -- --port 3000
```

같은 네트워크의 기기에서 `http://<로컬PC-IP>:3000`으로 접속한 뒤, 방 생성 화면에서 발급된 organizer, leader, viewer 링크를 각각 다른 브라우저나 기기에 배정합니다. 자동 검증은 fixture 기반 `test:e2e:multi-pc`를 우선 사용하고, 최종 체감 확인이 필요할 때만 LAN 접속을 병행합니다.

### 8팀장 권한 직접 확인

주최자 1명과 팀장 8명이 동시에 접속한 상태를 자동으로 열고, 모든 팀장의 입찰 권한을 확인합니다.
이 명령은 production build/start 서버에서 실행되어 개발 서버의 컴파일 오버레이가 화면에 뜨지 않습니다.

```bash
npm run test:e2e:auction:8leaders
```

브라우저 화면을 직접 보려면 headed 실행을 사용합니다.

```bash
npm run test:e2e:auction:8leaders:headed
```

경매 시작 직후 멈춘 상태에서 9개 화면을 직접 확인하려면 PowerShell에서 pause 플래그를 켭니다.

```powershell
$env:E2E_VISUAL_PAUSE="1"
npm run test:e2e:auction:8leaders:headed
```

Playwright Inspector로 단계별 확인이 필요하면 debug 실행을 사용합니다.

```bash
npm run test:e2e:auction:8leaders:debug
```

실패하면 테스트 결과에 팀장별 `teamId`, URL, 입찰 버튼 상태, input 값, 경고 문구가 JSON 첨부로 남습니다.
테스트용 경매 타이머는 화면 로드가 끝난 뒤 60초로 시작합니다.

## 운영 스크립트

### Direct bid hot path

입찰은 레이턴시를 줄이기 위해 `placeBidDirect()`가 Firestore 클라이언트 SDK transaction으로 먼저 처리합니다.

- 성공 시 Firestore room canonical state와 `bids` history가 직접 갱신된다.
- 실패 시 기존 `placeBid` Server Action으로 fallback한다.
- direct bid 보안은 `/api/room-auth/firebase-token` custom token claim과 `firestore.rules`의 `isBidUpdate()` / `isBidHistoryCreate()`가 담당한다.
- 추첨, 시작, 일시정지, 낙찰, 유찰, 재경매 같은 운영 액션은 계속 Server Action 경유다.

### Optional auction watchdog

기본 경매 흐름은 organizer 상시 참여 + presence guard를 전제로 동작합니다. 팀장 연결이 끊기면 organizer 화면이 즉시 경매를 일시정지하고, 재연결되면 다시 재개합니다.

`/api/auction-watchdog` route는 이 흐름의 핵심이 아니라 선택적 backup path입니다.

- organizer가 항상 경매를 진행하는 운영이라면 cron 없이도 된다.
- 별도 서버 sweep를 쓰고 싶을 때만 `CRON_SECRET`을 설정하고 `/api/auction-watchdog`를 외부 scheduler에 연결한다.
- 이 route는 500ms급 실시간 입찰 품질을 담당하지 않는다. 입찰 즉시성은 room canonical state, RTDB fanout, organizer presence guard가 담당한다.

### Realtime debug markers

실시간 경매 품질 검증용으로 브라우저는 최근 입찰 marker를 `window.__auctionLatencyMarkers__`에 남길 수 있습니다.

- `client-response`: 입찰자가 서버 응답에서 받은 `eventId`
- `rtdb`: 다른 화면이 RTDB `auctionEvent`로 반영한 시점
- `room-fallback`: RTDB miss 후 Firestore room snapshot으로 복구한 시점

이 marker는 운영 기능이 아니라 디버그/Playwright 검증용입니다.

### legacy room token 정리

신규 방은 `room_auth_secrets`에 역할 토큰을 저장하지만, 예전 방 문서에는 `rooms` / `teams` 공개 문서에 legacy token 필드가 남아 있을 수 있습니다.

먼저 dry-run으로 대상 개수를 확인합니다.

```bash
npm run migrate:room-auth-secrets:dry-run
```

실제 반영은 아래 명령으로 수행합니다.

```bash
npm run migrate:room-auth-secrets
```

이 스크립트는 다음을 수행합니다.
- `rooms.organizer_token`, `rooms.viewer_token`을 `room_auth_secrets/{roomId}`로 이동
- `rooms/{roomId}/teams/{teamId}.leader_token`을 `room_auth_secrets/{roomId}/team_tokens/{teamId}`로 이동
- 이동이 끝난 legacy public token 필드는 삭제

### room auth 감사

현재 방 데이터가 private auth 구조를 잘 따르는지 확인합니다.

```bash
npm run audit:room-auth-secrets
```

이 스크립트는 다음을 검사합니다.
- 모든 room에 `room_auth_secrets/{roomId}`가 존재하는지
- organizer/viewer token이 private auth 문서에 있는지
- 각 team에 `team_tokens/{teamId}`가 존재하는지
- public `rooms` / `teams` 문서에 legacy token 필드가 다시 생기지 않았는지

### Firestore rules 스모크 검증

배포된 rules가 의도대로 동작하는지 확인합니다.

```bash
npm run smoke:room-rules
```

이 스크립트는 다음을 검증합니다.
- 클라이언트 SDK로 `rooms/{roomId}` 단건 조회 허용
- `teams`, `players`, `messages`, `bids` 하위 컬렉션 read 허용
- top-level `rooms` collection list 차단
- `room_auth_secrets` 및 `team_tokens` client read 차단

참고:
- 이 프로젝트는 named Firestore database `minionsbid`를 사용합니다.
- `(default)` 데이터베이스는 사용하지 않으며, rules 배포 대상은 `minionsbid`입니다.
- 저장소의 `.firebaserc`는 placeholder로 유지하고, 실제 배포는 `--project <firebase-project-id>`를 명시해 수행합니다.

## 프로젝트 구조

```text
src/
  app/             Next.js 라우트와 페이지
  components/      공용 및 화면 조합 컴포넌트
  features/
    auction/       실시간 경매 도메인
    schedules/     리그 일정 도메인
    hall-of-fame/  우승 기록 도메인
  lib/             Firebase 초기화 및 공용 유틸리티
```

## 문서

- [`DESCRIPTION.md`](./DESCRIPTION.md): 프로젝트 구조와 데이터 흐름 설명
- [`DESIGN.md`](./DESIGN.md): Cyber-Pixel 디자인 시스템
- [`doc/ARCHITECTURE.md`](./doc/ARCHITECTURE.md): 아키텍처 메모
- [`doc/AUCTION_LOGIC.md`](./doc/AUCTION_LOGIC.md): 경매 로직 설명
- [`doc/AUCTION_REALTIME_CONTRACT.md`](./doc/AUCTION_REALTIME_CONTRACT.md): 경매 실시간 정합성 계약
- [`doc/SECURITY.md`](./doc/SECURITY.md): Firebase / Server Action / direct bid 보안 경계
- [`doc/TECH_STATE_SNAPSHOT.md`](./doc/TECH_STATE_SNAPSHOT.md): 현재 기술 상태 스냅샷
- [`progress.md`](./progress.md): 세션별 진행 로그
- [`TODOS.md`](./TODOS.md): 완료 항목과 후속 작업 추적

## 비고

이 프로젝트는 일반적인 계정 시스템 대신 역할 기반 토큰 링크를 사용해 방에 입장합니다.  
대부분의 상태 변경은 Next.js Server Actions와 Firebase Admin SDK를 통해 서버에서 처리됩니다. 입찰 hot path만 레이턴시 최적화를 위해 Firestore client transaction을 허용하며, 이 경로는 custom token claim과 Firestore Security Rules가 검증합니다.
