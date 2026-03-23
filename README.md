# 🎮 Minions Bid (League Auction Tool)

리그 오브 레전드 커뮤니티를 위한 실시간 멀티플레이어 선수 경매 도구입니다. 고전적인 8비트 픽셀 아트와 현대적인 사이버펑크 스타일이 결합된 **Cyber-Pixel** 테마를 제공하며, 주최자와 팀장들이 실시간으로 선수를 입찰하고 팀을 구성할 수 있습니다.

---

## ✨ 핵심 기능

- **실시간 경매 시스템**: Firebase Realtime Database를 활용한 초저지연 입찰 및 상태 동기화.
- **Cyber-Pixel 디자인**: `DungGeunMo`, `Galmuri11`, `Press Start 2P` 폰트를 활용한 독창적인 아케이드 스타일 UI.
- **씬(Scene) 기반 아키텍처**: 대기, 추첨, 경매, 결과 씬으로 구성된 역동적인 경매 흐름.
- **모바일 최적화**: 반응형 레이아웃 및 터치 타겟 최적화를 통해 모바일에서도 원활한 입찰 가능.
- **방 관리 기능**: 엑셀 업로드를 통한 대규모 선수/팀 등록 지원.

---

## 🛠 기술 스택

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS (OKLCH, v4 기반)
- **Backend/Database**: Firebase (Firestore, Realtime Database, Auth)
- **State Management**: Zustand (Client State), Firebase Realtime (Server State)
- **Motion/UI**: Framer Motion, React Portal (Modal System)

---

## 🚀 시작하기

### 환경 변수 설정
`.env.local` 파일을 생성하고 다음 항목을 입력하세요:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=...
```

### 설치 및 실행
```bash
npm install
npm run dev
```

---

## 📄 문서 가이드

- **[DESIGN.md](./DESIGN.md)**: Cyber-Pixel 디자인 시스템 및 컴포넌트 명세.
- **[doc/ARCHITECTURE.md](./doc/ARCHITECTURE.md)**: Firebase 중심의 실시간 아키텍처 및 데이터 흐름.
- **[doc/AUCTION_LOGIC.md](./doc/AUCTION_LOGIC.md)**: 경매 타이머, 입찰 규칙 및 낙찰 로직 상세.
- **[plan.md](./plan.md)**: 현재 진행 중인 리디자인 및 기능 개선 로드맵.
- **[TODOS.md](./TODOS.md)**: 기술 부채 및 소규모 최적화 항목.

---

## 🛡️ 보안 및 성능

- **Firebase Security Rules**: 데이터 경로별 엄격한 읽기/쓰기 권한 제어.
- **React Portal**: 모달 시스템을 DOM 최상단으로 분리하여 CSS 제약 해소.
- **Fluid Typography**: 브라우저 너비에 따라 유동적으로 변화하는 가독성 높은 폰트 스케일링.
