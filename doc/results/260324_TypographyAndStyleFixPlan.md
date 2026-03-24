Date: 2026-03-24 10:05:00
Author: Antigravity

# 260324 타이포그래피 및 스타일 교정 구현 계획서

## 1. 목표
- 모든 하드코딩된 `text-[Npx]` 제거.
- 표준 Tailwind 텍스트 클래스를 `text-fluid-*` 토큰으로 교체.
- 전역 디자인 시스템(`DESIGN.md`)에 부합하는 스타일 정제.

## 2. 작업 상세
### 2.1. Phase 1: 하드코딩 텍스트 제거
- `src/features/auction/components/LotteryAnimation.tsx`:
    - L263: `text-[12px]` → `text-fluid-xs`
    - L266: `text-[12px]` → `text-fluid-xs`

### 2.2. Phase 2: 핵심 컴포넌트 타이포그래피 정제
- `src/features/auction/components/board/BidStatus.tsx`:
    - L42: `text-sm` → `text-fluid-xs` (P 단위 표시)
- `src/features/auction/components/BiddingControl.tsx`:
    - L61, L64: `text-sm` → `text-fluid-sm`
    - L86: `text-xl` → `text-fluid-lg` (+/- 버튼)
    - L131: `text-sm` → `text-fluid-xs` (P 단위 표시)
- `src/features/auction/components/TeamList.tsx`:
    - L86: `text-fluid-xs` → `text-fluid-sm` (팀 이름 가독성 향상)
- `src/app/room/[id]/RoomClient.tsx`:
    - L176: `text-3xl` → `text-fluid-xl`
    - L182: `text-2xl` → `text-fluid-lg`

### 2.3. Phase 3: 스타일 정합성 및 검증
- `src/app/room/[id]/RoomClient.tsx`의 `rounded-full` (L232) 검토 후 직각 디자인으로 수정 여부 결정.
- 모든 수정 사항에 대해 `npm run build` 및 린트 검사 수행.

## 3. 검증 방법
1.  **정적 분석**: `grep`을 사용하여 프로젝트 내 `text-[` 패턴이 더 이상 존재하지 않는지 확인.
2.  **시각적 검수**: 브라우저에서 각 상태(대기, 추첨, 경매, 결과)의 텍스트가 깨지지 않고 적절한 크기로 렌더링되는지 확인.
3.  **빌드 테스트**: `npm run build`를 통해 스타일 정의 및 타입 오류 여부 확인.
