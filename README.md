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
NEXT_PUBLIC_FIRESTORE_DATABASE_ID=(default)

FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=...
FIRESTORE_DATABASE_ID=(default)

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
npm run audit:room-auth-secrets
npm run smoke:room-rules
npm run migrate:room-auth-secrets:dry-run
npm run migrate:room-auth-secrets
```

## 운영 스크립트

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
- rules 배포 시 `(default)`뿐 아니라 `minionsbid`에도 반영되어야 합니다.
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

## 비고

이 프로젝트는 일반적인 계정 시스템 대신 역할 기반 토큰 링크를 사용해 방에 입장합니다.  
중요한 상태 변경은 Next.js Server Actions와 Firebase Admin SDK를 통해 서버에서 처리됩니다.
