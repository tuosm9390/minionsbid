Date: 2026-03-24 10:35:00
Author: Antigravity

# 260324 리디자인 Phase 3-6 통합 구현 계획서

## 1. Phase 3: 인터랙티브 컨트롤 (BiddingControl & Chat)
### 1.1. BiddingControl 고도화
- 입찰 버튼 높이를 `h-14` (56px)로 고정하여 터치 편의성 극대화.
- `isLeading` 상태 시 `animate-shine` 애니메이션이 적용된 골드 그라디언트 오버레이 추가.
- 입찰 에러 메시지 스타일을 빨간 픽셀 박스로 변경.

### 1.2. ChatPanel 인게임 로그 스타일 적용
- 시스템 메시지: `border-l-4 border-minion-blue`, 배경 `minion-blue/10`.
- 유저 메시지: `pixel-box` 스타일의 말풍선 레이아웃.
- 모바일에서 `max-h-[240px]` 고정 및 `custom-scrollbar` 적용 확인.

## 2. Phase 4: 정보 시각화 (TeamList & Modals)
### 2.1. TeamList 포인트 게이지 완성
- `pointRatio`에 따른 색상 분기: Blue(60%↑), Yellow(30~59%), Red Pulse(30%↓).
- 픽셀 스타일의 게이지 바 테두리와 배경 패턴 적용.

### 2.2. CreateRoomModal 미니언 진행률 표시기
- 모달 상단에 단계별 배지를 잇는 트랙 구현.
- 현재 단계 위에 Galmuri 폰트 미니언 캐릭터(`(•‿•)`) 배치 및 이동 애니메이션.

## 3. Phase 5: 레이아웃 및 반응형 최적화
- `RoomClient.tsx`의 메인 그리드를 `order` 클래스로 조정.
- 모바일 전용 "팀 현황 보기" 아코디언 토글 로직 및 스타일링.

## 4. Phase 6: 최종 폴리싱 (Delight)
- `SoldOverlay` 컴포넌트 구현 및 낙찰 시 노출 로직 연결.
- 전역 픽셀 노이즈 및 CRT 오버레이 투명도 최적화.

## 5. 검증 계획
- **반응형 테스트**: 375px, 768px, 1024px+ 환경에서의 레이아웃 및 터치 타겟 검증.
- **애니메이션 성능**: 저사양 기기에서도 60fps 유지를 위한 GPU 가속 확인.
- **디자인 일관성**: 모든 신규 요소가 `DESIGN.md`의 토큰을 준수하는지 최종 전수 조사.
