# 프로젝트 구현 계획서 — Minions Bid

작성일: 2026-03-24
상태: **Phase 3 (인터랙션 강화) 진행 중**

---

## 1. 현재 진행 상황 (Current Progress)

- [x] **Firebase 마이그레이션**: Supabase → Firebase 완전 전환.
- [x] **모달 시스템 개선**: React Portal 도입으로 모든 모달 정렬 문제 해결.
- [x] **Phase 1 (전역 스타일)**: `globals.css` 및 `tailwind.config.ts`에 Cyber-Pixel 디자인 토큰 적용.
- [x] **Phase 2 (경매 보드)**: `AuctionWaitingState`, `BidStatus` 기본 디자인 시스템 통합.

---

## 2. 향후 구현 로드맵 (Redesign & Feature)

### Phase 3: 인터랙티브 컨트롤 강화 (진행 중)
- [ ] **BiddingControl 리팩터링**: 입찰 버튼 크기 확대(`min-h-[48px]`), 선두 상태 시 골드 광택(`Shine`) 애니메이션 추가.
- [ ] **ChatPanel 시각 분리**: 시스템 메시지(이벤트 로그 스타일)와 유저 채팅을 명확하게 구분.
- [ ] **CenterTimer 긴박감 부여**: 남은 시간 5초 이하 시 진동(`Shake`) 및 색상 점진적 변화 효과.

### Phase 4: 정보 시각화 및 팀 관리
- [ ] **TeamList 포인트 게이지**: 팀별 포인트 잔액을 시각적인 픽셀 게이지 바(`Gauge Bar`)로 표시.
- [ ] **모바일 아코디언 레이아웃**: 375px 환경에서 `TeamList`를 기본 접힘 상태로 처리하여 경매 보드 공간 확보.
- [ ] **UnsoldPanel 리스타일링**: 유찰 선수 목록을 픽셀 티어 배지와 함께 일관성 있게 표시.

### Phase 5: Delight & Polish
- [ ] **SoldOverlay 구현**: 낙찰 시 화면 전체를 덮는 2초간의 축하 효과 및 파티클 시스템.
- [ ] **LotteryAnimation 수동 시작**: 주최자가 추첨 완료 후 명시적으로 경매를 시작할 수 있는 버튼 추가.
- [ ] **전체 텍스트 크기 검수**: 하드코딩된 `text-[Npx]`를 `text-fluid-*` 유틸리티로 일괄 교체.

### Phase 6: 최종 검증 및 배포
- [ ] **접근성(A11y) 심층 검수**: `CenterTimer`, `BidStatus` 등에 ARIA 라이브 리전 적용 확인.
- [ ] **성능 테스트**: 다중 입찰 상황에서의 Firebase 지연시간 및 60fps 애니메이션 유지 확인.

---

## 3. 기술 부채 해결 (Maintenance)

- [ ] **성능**: `useAuctionBoard.ts`의 `[...messages].reverse().find()`를 `messages.findLast()`로 교체 (O(n) → O(1)).
- [ ] **타입**: `AuctionBoard.tsx` L49의 `as any` 타입 캐스트를 제거하고 명시적 타입을 정의.
- [ ] **보안**: Firebase Security Rules에서 쓰기 권한을 `service_role`을 사용하는 서버 사이드로 완전히 제한.

---

## 4. 미결 결정 사항 (Open Decisions)

- [ ] **사운드 효과**: 입찰 및 낙찰 시 효과음 도입 여부 (별도 스프린트로 분리 검토).
- [ ] **다크 모드**: 현재 라이트 모드 전용인 Cyber-Pixel 테마의 다크 모드 확장 필요성.
