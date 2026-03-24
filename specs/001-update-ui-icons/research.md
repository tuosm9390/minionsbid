# Research: Modern Cyber-Pixel Icon System

## Decision: Lucide-React with Pixel Styling + Custom SVG Icons

현재 설치된 `lucide-react`를 유지하면서 픽셀 아트 스타일을 입히는 방식을 기본으로 채택합니다. 단, `lucide`에 없는 특수 픽셀 아이콘(예: 8-bit 하트, 동전 등)은 `PixelArt Icons` 오픈소스에서 SVG 소스를 가져와 커스텀 컴포넌트로 관리합니다.

### Rationale
- **Lucide의 범용성**: 거의 모든 필요한 아이콘을 이미 포함하고 있으며, `stroke-width`와 `size` 조절이 매우 유연함.
- **CSS 트릭 활용**: `shape-rendering: crispEdges` 속성을 적용하면 벡터 아이콘도 픽셀 느낌의 날카로운 경계선을 가질 수 있음.
- **Framer Motion 통합**: 이미 프로젝트에 설치된 `framer-motion`과 완벽하게 호환되어 애니메이션 구현이 용이함.

### Alternatives Considered
- **Font-based Icons (Galmuri, FontAwesome)**: 폰트 아이콘은 크기 조절 시 픽셀 깨짐 현상이 발생할 수 있고, 애니메이션 제어가 SVG보다 어려움.
- **Pure Pixel Images (PNG)**: 고해상도 디스플레이(Retina)에서 대응하기 위해 여러 벌의 이미지가 필요하며, 색상 변경이 불가능함.

## Technical Implementation Details

### 1. Pixel Styling Strategy
- **Stroke Width**: `3px` 또는 `4px` 권장 (프로젝트의 `pixel-box` 테두리 두께와 일치).
- **Shape Rendering**: `crispEdges`를 적용하여 안티앨리어싱을 제거하고 픽셀 느낌을 강화.
- **Size**: `16px`, `24px`, `32px` 등 8의 배수로 관리하여 픽셀 그리드 정렬 유지.

### 2. Animation Patterns
- **Shake (긴급)**: 타이머 5초 이하 시 `framer-motion`의 `x` 좌표 진동.
- **Shine (선두)**: 입찰 버튼 획득 시 CSS `linear-gradient`와 `animate-shine` 유틸리티 활용.
- **Pulse (대기)**: 온라인 상태 표시 시 `opacity` 페이딩.

### 3. Emoji Mapping Table
기존 이모지를 다음과 같이 매핑하여 교체합니다:

| Emoji | Replacement Icon | Context |
|-------|------------------|---------|
| ✅ | `CheckSquare` (Pixel Style) | 연결됨 / 완료 |
| 💤 | `Moon` (Pixel Style) | 대기 중 / 미접속 |
| ⏳ | `Hourglass` (Pixel Style) | 처리 중 / 대기 |
| 👑 | `Crown` (Pixel Style) | 최고 입찰자 |
| 💬 | `MessageSquare` (Pixel Style) | 채팅 |

## Resolved NEEDS CLARIFICATION
- **아이콘 라이브러리 변경 여부**: `lucide-react`를 커스텀 스타일링하여 사용하는 것으로 확정.
- **애니메이션 방식**: `framer-motion` 및 `globals.css`의 기존 Keyframes 활용.
