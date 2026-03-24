# Implementation Plan: Modern Cyber-Pixel Icon System

**Branch**: `001-update-ui-icons`  
**Feature Spec**: [specs/001-update-ui-icons/spec.md]

## Technical Context

프로젝트의 "Cyber-Pixel" 디자인 테마를 강화하기 위해 기존의 일반 벡터 아이콘(Lucide 기본 스타일)과 이모지를 제거하고, 픽셀 아트 스타일의 아이콘 시스템을 도입합니다.

### Technology Stack
- **Icon Library**: `lucide-react` (커스텀 스타일링)
- **Styling**: Tailwind CSS + Inline SVG Props
- **Animation**: `framer-motion`
- **Component**: React (TypeScript)

### Key Architectural Decisions
- **`PixelIcon` 컴포넌트화**: 스타일과 애니메이션 로직을 래핑하여 재사용성 확보.
- **SVG 커스텀 렌더링**: `shape-rendering: crispEdges`와 `stroke-width={3}` 이상을 사용하여 픽셀 효과 구현.
- **상태 기반 애니메이션**: `framer-motion`의 `AnimatePresence` 및 `variants`를 활용한 동적 피드백.

## Constitution Check

| Principle | Adherence | Rationale |
|-----------|-----------|-----------|
| **Test-First** | Yes | 아이콘 상태 변화에 따른 렌더링 테스트 케이스 작성 예정. |
| **Simplicity** | Yes | 새로운 라이브러리 추가 없이 기존 `lucide`를 최대한 활용. |
| **Accessibility** | Yes | 모든 아이콘에 ARIA 레이블 및 터치 영역 최적화 적용. |
| **Cyber-Pixel Style**| Yes | 테마 핵심 가치인 '직각', '굵은 테두리', '고대비'를 아이콘에 투영. |

## Gates

- [x] 사양서 승인 완료
- [x] 연구 보고서 (`research.md`) 작성 완료
- [x] 데이터 모델 및 인터페이스 정의 완료
- [x] 에이전트 컨텍스트 업데이트 완료

## Implementation Phases

### Phase 0: Research (Complete)
- [x] 프로젝트 내 아이콘 사용 현황 분석
- [x] 픽셀 스타일 구현 기술 검증
- [x] 이모지 교체 매핑 테이블 작성

### Phase 1: Design & Contracts (Complete)
- [x] `PixelIcon` 컴포넌트 인터페이스 설계
- [x] 데이터 모델 정의
- [x] 퀵스타트 가이드 작성

### Phase 2: Implementation (Pending)
- [ ] `src/components/ui/PixelIcon.tsx` 컴포넌트 구현
- [ ] 글로벌 CSS 아이콘 관련 유틸리티 추가
- [ ] 주요 페이지 및 컴포넌트 아이콘 교체
  - [ ] `AuctionWaitingState` (이모지 교체)
  - [ ] `CenterTimer` (애니메이션 추가)
  - [ ] `BiddingControl` (애니메이션 추가)
  - [ ] `RoomHeader` 및 기타 UI
- [ ] 유닛 테스트 및 접근성 검증

## Verification Plan

- **Visual Regression**: 모든 화면에서 아이콘이 픽셀 테마와 조화로운지 확인.
- **Interaction Test**: 입찰 및 타이머 상황에서 애니메이션이 부드럽게(60fps) 동작하는지 확인.
- **A11y Audit**: `aria-label` 누락 여부 및 터치 타겟(44px) 검사.
