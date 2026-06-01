# AGENTS.md - Components

## OVERVIEW

`src/components`는 방 생성, 일정 관리, 홈 보조 UI, 공용 Cyber-Pixel 컴포넌트를 담당한다.

## STRUCTURE

```text
src/components/
├── create-room/              # 방 생성 wizard 단계
├── ui/                       # PixelIcon, ThreeDIcon, overlay helpers
├── LeagueScheduleManager.tsx # 일정 관리 client shell
├── ScheduleMatchDayEditor.tsx# 경기 편성 및 결과 입력
├── ScheduleCalendar.tsx      # 날짜 선택
└── ScheduleRosterPanel.tsx   # 일정 로스터 표시
```

## WHERE TO LOOK

| 작업 | 위치 | 주의 |
|---|---|---|
| 방 생성 UI | `CreateRoomModal.tsx`, `create-room/*` | `useCreateRoom`과 Excel parsing 흐름 확인 |
| 일정 shell | `LeagueScheduleManager.tsx` | server action 호출과 selected date reset 회귀 확인 |
| 경기 편집 | `ScheduleMatchDayEditor.tsx` | max games, set logs, result submit 불변식 유지 |
| 공용 아이콘 | `ui/PixelIcon.tsx`, `ui/CyberIcons.tsx` | Cyber-Pixel 시각 언어 유지 |
| 모달 dismiss | `ui/useOverlayDismiss.ts` | mousedown/mouseup 외부 판정 회귀 주의 |

## CONVENTIONS

- `DESIGN.md`의 Cyber-Pixel 규칙을 우선한다.
- 텍스트 크기는 가능한 `text-fluid-*` 토큰을 사용한다.
- 일정 UI는 모바일에서 정보 손실 없이 동작해야 한다.
- 접근 가능한 label, button text, keyboard 흐름을 유지한다.
- 큰 컴포넌트는 요청 범위 안에서만 helper 추출을 검토한다.

## ANTI-PATTERNS

- rounded bubble, 보라색 SaaS gradient, 일반적인 카드 그리드를 기본값으로 쓰지 않는다.
- 화면별로 roster, match result, schedule 파생 계산을 중복 구현하지 않는다.
- 테스트 통과만을 위해 사용자 관찰 가능 문구를 의미 없이 바꾸지 않는다.
