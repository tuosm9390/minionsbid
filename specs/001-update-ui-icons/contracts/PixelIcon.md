# Interface Contract: PixelIcon Component

## Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| icon | LucideIcon | (required) | `lucide-react`에서 가져온 아이콘 컴포넌트 |
| size | number | 24 | 아이콘의 크기 (px) |
| color | string | "currentColor" | 아이콘의 색상 (Tailwind 클래스 또는 HEX) |
| strokeWidth | number | 3 | 아이콘의 테두리 두께 |
| animation | "idle" \| "urgent" \| "success" \| "active" | "idle" | 적용할 애니메이션 상태 |
| className | string | "" | 추가 스타일링 클래스 |
| label | string | undefined | 스크린 리더용 레이블 (ARIA) |

## UI Behavior

### 1. Rendering
- 모든 아이콘은 `shape-rendering: crispEdges` 스타일이 적용된 SVG로 렌더링되어야 함.
- 아이콘은 기본적으로 `inline-block`이며 수직 정렬(`align-middle`)이 적용됨.

### 2. Animation (Framer Motion)
- **urgent (shake)**: 0.4초 주기로 좌우 2px씩 진동.
- **success (scale)**: 아이콘이 1.2배로 커졌다가 1배로 복귀하는 팝업 효과.
- **active (pulse)**: 투명도가 0.5에서 1 사이를 반복적으로 페이딩.

### 3. Accessibility
- `label`이 제공된 경우 `role="img"`와 `aria-label`을 적용.
- `label`이 없는 경우 장식용으로 간주하여 `aria-hidden="true"`를 적용.
