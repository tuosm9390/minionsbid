# Feature Specification: Update Project Icons to Modern Cyber-Pixel Style

**Feature Branch**: `001-update-ui-icons`  
**Created**: 2026-03-24  
**Status**: Draft  
**Input**: User description: "프로젝트 전체적으로 사용되는 기본 아이콘을 수정하고 싶어. 최신 트렌드에 맞는 스타일의 아이콘으로 수정해줘."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unified Icon System (Priority: P1)

유저는 경매 서비스의 모든 화면에서 일관된 스타일의 픽셀 아이콘을 보게 됩니다. 기존의 이모지나 일반적인 벡터 아이콘이 제거되고, 프로젝트의 'Cyber-Pixel' 테마에 최적화된 아이콘 시스템이 적용됩니다.

**Why this priority**: 브랜드 아이덴티티의 핵심인 시각적 일관성을 확보하기 위해 가장 높은 우선순위를 가집니다.

**Independent Test**: 방 입장부터 경매 종료까지 모든 단계에서 이질적인 아이콘(이모지 등)이 노출되지 않는지 확인합니다.

**Acceptance Scenarios**:

1. **Given** 메인 페이지 또는 경매방 접속 시, **When** 화면을 탐색하면, **Then** 모든 아이콘이 동일한 픽셀 아트 스타일(직각 모서리, 굵은 테두리)로 표시되어야 함.
2. **Given** 기존에 이모지가 사용되던 부분(예: 대기 상태의 ✅, 💤), **When** 상태가 변화하면, **Then** 새롭게 정의된 픽셀 아이콘 배지로 대체되어야 함.

---

### User Story 2 - Dynamic Visual Feedback (Priority: P2)

유저는 입찰 경쟁이나 타이머 긴박 상황 등 중요한 순간에 애니메이션이 적용된 아이콘을 통해 직관적인 피드백을 받습니다.

**Why this priority**: 실시간 경매의 긴장감과 생동감을 높여 사용자 경험을 극대화합니다.

**Independent Test**: 경매 타이머가 5초 이하일 때 또는 입찰 성공 시 아이콘의 움직임을 확인합니다.

**Acceptance Scenarios**:

1. **Given** 경매 타이머가 5초 이하일 때, **When** 아이콘이 노출되면, **Then** 타이머 옆의 시계 아이콘이 진동(Shake)하거나 색상이 변하는 애니메이션이 적용되어야 함.
2. **Given** 입찰 성공(선두) 시, **When** 입찰 버튼 옆에 왕관 아이콘이 나타나면, **Then** 골드 광택(Shine) 효과가 적용되어야 함.

---

### User Story 3 - Responsive & Accessible Icons (Priority: P3)

모바일 유저는 터치하기 충분한 크기의 아이콘 버튼을 사용하며, 스크린 리더 사용자도 아이콘의 의미를 정확히 파악할 수 있습니다.

**Why this priority**: 다양한 환경의 유저가 차별 없이 서비스를 이용할 수 있도록 합니다.

**Independent Test**: 모바일 화면에서 아이콘 버튼의 터치 영역을 측정하고, ARIA 레이블을 확인합니다.

**Acceptance Scenarios**:

1. **Given** 모바일 환경(375px)에서, **When** 아이콘 버튼을 클릭하려 하면, **Then** 최소 44px 이상의 터치 영역이 확보되어야 함.
2. **Given** 모든 아이콘 요소에 대해, **When** 스크린 리더가 포커스하면, **Then** `aria-label` 또는 `aria-hidden`이 적절히 설정되어 의미를 전달하거나 무시되어야 함.

---

### Edge Cases

- **아이콘 로딩 실패**: 아이콘 라이브러리 로딩 실패 시 텍스트 기반의 폴백(Fallback) 레이블이 노출되는가?
- **초저해상도 환경**: 픽셀 아이콘이 너무 작아져서 형체를 알아볼 수 없는 경우, 텍스트와 병기하여 가독성을 보장하는가?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 `Lucide-react` 아이콘을 픽셀 스타일(Stroke Width 상향, crispEdges 적용)로 커스터마이징하여 사용하며, Lucide에 없는 특수 아이콘은 `research.md`에 정의된 Custom SVG를 통해 보완해야 함.
- **FR-002**: 현재 `AuctionWaitingState` 등에서 사용 중인 이모지(✅, 💤, ⏳)를 모두 SVG 기반의 픽셀 아이콘 배지로 대체해야 함.
- **FR-003**: `CenterTimer`의 시계 아이콘, `BiddingControl`의 왕관 아이콘 등 핵심 인터랙션 지점에 `framer-motion` 기반의 마이크로 애니메이션을 추가해야 함.
- **FR-004**: 모든 아이콘의 색상은 `DESIGN.md`에 정의된 `minion-yellow`, `minion-blue`, `minion-red` 및 틴티드 중립 컬러를 사용해야 함.
- **FR-005**: 아이콘 단독 버튼의 경우 반드시 `aria-label`을 제공하여 접근성을 준수해야 함.

### Key Entities *(include if feature involves data)*

- **Icon Set**: 프로젝트 전반에 사용되는 아이콘의 정의(이름, 경로, 스타일 가이드).
- **Icon Component**: 픽셀 스타일과 애니메이션 로직이 래핑된 공용 아이콘 컴포넌트.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 프로젝트 내 모든 이모지 사용률을 0%로 줄이고 픽셀 아이콘으로 100% 대체.
- **SC-002**: 모바일 환경에서 아이콘 버튼의 터치 타겟 미달 사례(44px 미만) 0건 달성.
- **SC-003**: 라이트하우스(Lighthouse) 접근성 점수 95점 이상 유지.
- **SC-004**: 사용자 테스트 시 "아이콘이 게임 테마와 잘 어우러진다"는 긍정적 응답 90% 이상 확보.

## Assumptions

- **Ass-001**: 아이콘 교체는 기존 레이아웃을 크게 해치지 않는 범위 내에서 수행됨.
- **Ass-002**: 픽셀 아이콘 셋은 오픈소스 라이브러리를 우선 사용하되, 필요한 경우 직접 제작하거나 폰트 아이콘을 활용함.
- **Ass-003**: 애니메이션 효과는 성능 저하를 방지하기 위해 `framer-motion` 또는 CSS 하드웨어 가속을 활용함.
