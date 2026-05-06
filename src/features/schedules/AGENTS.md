# AGENTS.md - Schedules Feature

## 범위

`src/features/schedules` 아래의 일정 서버 액션, 일정 데이터 모델, 일정 UI 연동 코드에 적용된다.

## 핵심 역할

일정 기능은 리그 운영 데이터의 정합성을 다룬다. 경매처럼 초저지연 팬아웃이 중심은 아니지만, 입력 검증과 권한 경계가 중요하다.

## 구현 규칙

- 일정 생성, 수정, 삭제는 기존 서버 액션 경계를 우선한다.
- 클라이언트에서 전달된 team id, match id, room id, 날짜 값을 신뢰하지 말고 서버 경계에서 검증한다.
- match day, round, team assignment, result 상태의 불변식을 먼저 찾고 유지한다.
- 큰 컴포넌트와 액션 파일을 수정할 때는 관련 helper 추출 가능성을 검토하되, 요청 범위를 넘어선 대규모 리팩터링은 하지 않는다.
- 경매 기능의 실시간 계약을 일정 기능에 임의로 복제하지 않는다.

## UI 규칙

- 일정 UI도 Cyber-Pixel 방향성을 따른다.
- 표, 라운드 편집, match day 편집 화면은 모바일에서 정보 손실 없이 동작해야 한다.
- 접근 가능한 label, button text, keyboard 흐름을 유지한다.

## 테스트

- 일정 서버 액션 변경은 관련 Vitest를 우선 실행한다.
- UI 변경은 컴포넌트와 사용 흐름을 Playwright 또는 브라우저 표면에서 확인한다.
- 날짜/라운드 정렬, 중복 경기, 누락 팀, 빈 일정 상태를 회귀 케이스로 본다.

## 참고 파일

- `src/features/schedules/api/scheduleActions.ts`
- `src/components/LeagueScheduleManager.tsx`
- `src/components/ScheduleMatchDayEditor.tsx`
- `doc/ARCHITECTURE.md`
- `doc/DATABASE.md`
