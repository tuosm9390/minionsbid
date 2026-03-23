# TODOS — Minions Bid

이 문서는 즉시 착수 가능한 작업 항목과 해결해야 할 기술 부채를 추적합니다.

---

## 🛠️ 긴급 작업 (High Priority)

### [ ] BiddingControl 인터랙션 강화
- **What**: 입찰 버튼 크기 확대 (`min-h-[48px]`), 선두 시 골드 광택 애니메이션 추가.
- **Why**: 사용자에게 즉각적인 시각적 피드백을 제공하고 터치 오인식을 방지.
- **Context**: 리디자인 Phase 3 핵심 과제.

### [ ] ChatPanel 메시지 시각 분리
- **What**: 시스템 메시지와 유저 채팅의 배경색 및 배지 분리.
- **Why**: 경매 이벤트 로그와 일반 대화를 명확하게 구분하여 정보 가독성 향상.
- **Context**: 리디자인 Phase 3 핵심 과제.

---

## 🏗️ 기술 부채 및 최적화 (Maintenance)

### [ ] `latestNotice` 성능 최적화
- **What**: `useAuctionBoard.ts` L65-67의 `[...messages].reverse().find()`를 `messages.findLast()`로 교체.
- **Why**: 매 렌더마다 배열을 복사하는 O(n) 연산을 피하기 위함.
- **Status**: ES2023 `findLast` 지원 환경 확인 완료.

### [ ] `AuctionBoard.tsx` 타입 캐스트 제거
- **What**: L49 부근의 `as any`를 명시적 타입 정의로 교체.
- **Why**: 타입 안전성 확보 및 코드 품질 향상 (CLAUDE.md 원칙 준수).

### [ ] 하드코딩 텍스트 크기 일괄 교체
- **What**: `BidStatus`, `BiddingControl`, `TeamList`, `RoomClient`, `NoticeBanner` 등에 있는 `text-[Npx]` 클래스를 `text-fluid-xs` 등으로 교체.
- **Why**: 전역 픽셀 테마 가독성 및 반응형 유연성 확보.

---

## 🌟 향후 개선 사항 (Future)

- [ ] **SoldOverlay**: 낙찰 시 전체화면 축하 효과 및 픽셀 파티클 시스템.
- [ ] **TeamList 포인트 게이지**: 팀별 포인트 잔액을 시각적인 픽셀 바(`Gauge Bar`)로 전환.
- [ ] **모바일 아코디언**: 375px 미만 환경에서의 레이아웃 최적화.
- [ ] **Accessibility**: 경매 긴박 상황(≤5s)에서의 스크린 리더 음성 지원 강화.
