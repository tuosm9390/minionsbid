# 기술 상태 스냅샷 — Minions Bid

작성일: 2026-03-24
버전: v2.1.0 (Firebase Migration Completed)

---

## 1. 핵심 스택 (Current Stack)
| 분류 | 기술명 | 비고 |
|------|-------|------|
| **Framework** | Next.js 15.1.x | App Router 기반 |
| **Language** | TypeScript 5.7.x | strict mode 활성화 |
| **Styling** | Tailwind CSS v4 | OKLCH, Cyber-Pixel 테마 |
| **Realtime** | Firebase RTDB | 초저지연 경매 동기화 |
| **Database** | Firestore | 방/선수/팀 메타데이터 저장 |
| **Auth** | Firebase Auth | 익명(Anonymous) 및 이메일 인증 |
| **State** | Zustand | 클라이언트 전역 상태 관리 |
| **Motion** | Framer Motion | 씬 전환 및 슬롯 애니메이션 |

---

## 2. 주요 아키텍처 상태
- **Firebase 통합**: Supabase에서 Firebase로의 완전한 전환 완료. `lib/firebase.ts` 및 `lib/firebaseAdmin.ts`를 통한 클라이언트/서버 권한 분리.
- **모달 시스템**: `React Portal`을 활용하여 모든 모달이 DOM 최상단에서 렌더링됨. 부모 요소의 CSS 제약(Z-index, transform) 문제 해결.
- **씬 시스템**: `AuctionBoard` 내부에서 `Scene` 타입을 기반으로 상태별 전용 컴포넌트(`Waiting`, `Lottery`, `Active`, `Result`)를 독립적으로 렌더링.
- **반응형**: `text-fluid-*` 유틸리티와 모바일 전용 아코디언 레이아웃 적용 완료.

---

## 3. 진행 중인 과제 (Active Work)
- **리디자인 페이즈 3-6**: `BiddingControl` 인터랙션 강화 및 `ChatPanel` 시각 분리 작업.
- **낙찰 애니메이션**: `SoldOverlay` 전체화면 효과 및 픽셀 파티클 시스템 보강.
- **팀 리스트 시각화**: 포인트 잔액을 픽셀 게이지 바(`Gauge Bar`)로 전환하여 가시성 확보.

---

## 4. 기술 부채 및 병목 (Technical Debt)
- **성능 최적화**: `useAuctionBoard.ts` 내 메시지 배열 역순 검색(`findLast`) 미적용.
- **타입 안전성**: `AuctionBoard.tsx` L49 부근의 `as any` 타입 캐스트 잔존.
- **텍스트 크기**: 일부 컴포넌트(`BidStatus`, `BiddingControl` 등)에 하드코딩된 `text-[Npx]` 클래스 산재.

---

## 5. 인프라 및 배포
- **Hosting**: Vercel (Next.js 최적화 배포)
- **DB Region**: `asia-northeast3` (서울 리전 사용으로 지연시간 최소화)
