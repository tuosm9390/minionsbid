# 프로젝트 구현 계획서 — Minions Bid

작성일: 2026-03-24
상태: **완료 (Phase 6 수료)**

---

## 1. 현재 진행 상황 (Current Progress)

- [x] **Firebase 마이그레이션**: Supabase → Firebase 완전 전환.
- [x] **모달 시스템 개선**: React Portal 도입으로 모든 모달 정렬 문제 해결.
- [x] **Phase 1 (전역 스타일)**: `globals.css` 및 `tailwind.config.ts`에 Cyber-Pixel 디자인 토큰 적용.
- [x] **Phase 2 (경매 보드)**: `AuctionWaitingState`, `BidStatus` 기본 디자인 시스템 통합.
- [x] **Phase 3 (인터랙션 강화)**: BiddingControl 골드 광택 효과, ChatPanel 메시지 시각 분리.
- [x] **Phase 4 (정보 시각화)**: TeamList 포인트 게이지 바 및 아코디언 레이아웃 구현.
- [x] **Phase 5 (레이아웃 최적화)**: 전역 텍스트 fluid 토큰 적용 및 모바일 반응형 최적화.
- [x] **Phase 6 (최종 폴리싱)**: SoldOverlay 애니메이션 고도화 및 ARIA 접근성 강화.

---

## 2. 향후 로드맵 (Post-Launch)

### 가용성 및 성능
- [ ] **성능 모니터링**: 실사용 환경에서의 Firebase RTDB 부하 모니터링.
- [ ] **에러 추적**: Sentry 연동을 통한 클라이언트 사이드 예외 감지.

### 추가 기능 제안
- [ ] **Sound System**: 8-bit 효과음 엔진 탑재.
- [ ] **Dark Mode**: Cyber-Pixel 테마의 다크 모드 스킨 개발.

---

## 3. 기술 부채 해결 완료 (Resolved)

- [x] **성능**: `useAuctionBoard.ts` 내 `findLast()` 최적화 적용.
- [x] **타입**: `AuctionBoard.tsx` 내 `as any` 제거 완료.
- [x] **보안**: Admin SDK 기반의 서버 사이드 입찰 검증 시스템 정착.
