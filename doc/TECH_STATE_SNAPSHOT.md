Date: 2026-03-24 16:35:00
Author: Antigravity

# Technical State Snapshot — Minions Bid

## 1. 아키텍처 현황 (Architecture Status)

### 1.1. 데이터 계층 (Data Layer)
- **상태**: Supabase에서 Firebase Realtime Database로 100% 전환 완료.
- **동기화**: `useAuctionRealtime.ts`를 통해 전역 상태(`useAuctionStore`)와 실시간 동기화.
- **최적화**: `findLast`를 이용한 공지사항 검색 최적화(O(1)) 적용.

### 1.2. 스타일 시스템 (Style System)
- **테마**: Tailwind CSS v4 기반의 `Cyber-Pixel` 테마.
- **타이포그래피**: `text-fluid-xs` ~ `text-fluid-xl` 반응형 스케일 토큰 적용.
- **애니메이션**: GPU 가속을 활용한 `animate-shine`, `animate-urgent-shake`, `animate-minion-bounce` 정의.

## 2. 컴포넌트 무결성 (Component Integrity)

### 2.1. AuctionBoard
- **씬 시스템**: Framer Motion `AnimatePresence` 기반의 유연한 장면 전환(Wait → Lottery → Bidding → Result).
- **타입 안전성**: 모든 Props와 내부 로직에서 `as any` 제거 및 인터페이스 정밀화 완료.

### 2.2. BiddingControl
- **인터랙션**: `isLeading` 상태에 따른 시각적 강조 및 입찰 에러 핸들링 고도화.
- **모바일**: 터치 친화적인 버튼 크기(56px) 및 레이아웃 최적화.

## 3. 테스트 및 품질 (Quality Assurance)

### 3.1. 단위 테스트 (Unit Tests)
- `PixelIcon.test.tsx`, `usePresence.test.ts`, `useBiddingControl.test.tsx` 등 핵심 로직 커버리지 확보.
- Vitest 기반의 지속적 통합 환경 구축.

### 3.2. 반응형 지원 (Responsive Support)
- 375px(iPhone SE)부터 1440px+ 데스크톱까지 일관된 UX 제공.
- `RoomClient.tsx` 내 모바일 아코디언 로직을 통한 화면 공간 효율화.

## 4. 잔존 이슈 및 부채 (Technical Debt)

- **Security**: Firebase Security Rules의 서버 사이드 제약 강화 필요.
- **Accessibility**: ARIA Live Region을 통한 실시간 상황 음성 안내 보완.
- **Performance**: 다중 접속 시의 네트워크 패킷 최적화 검토 필요.
