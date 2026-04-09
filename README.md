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
```

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
