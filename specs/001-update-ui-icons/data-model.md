# Data Model: Icon System Configuration

## Entities

### IconTheme
아이콘의 전역 스타일 설정을 정의하는 엔티티입니다.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| strokeWidth | number | 아이콘의 테두리 두께 (px) | min: 2, max: 4 |
| shapeRendering | string | SVG 렌더링 방식 | enum: ["auto", "crispEdges"] |
| defaultSize | number | 기본 아이콘 크기 (px) | default: 24 |
| primaryColor | string | 기본 아이콘 색상 (CSS Variable) | var(--color-minion-blue) |

### IconAnimation
아이콘에 적용될 애니메이션 상태를 정의합니다.

| State | Animation Type | Trigger Condition |
|-------|----------------|-------------------|
| idle | none | 기본 상태 |
| urgent | shake | 타이머 5초 이하, 오류 발생 |
| success | shine / scale | 입찰 성공, 작업 완료 |
| active | pulse | 실시간 데이터 스트리밍 중 |

## State Transitions
- **Bidding**: Idle -> Active (입찰 중) -> Success (선두 획득) or Idle (추월당함)
- **Timer**: Idle -> Urgent (남은 시간 <= 5s)
