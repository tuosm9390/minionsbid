# AGENTS.md - App Router

## OVERVIEW

`src/app`은 페이지 shell, route handlers, E2E fixture API, room route를 담당한다.

## STRUCTURE

```text
src/app/
├── api/                 # route handlers와 e2e fixture API
├── room/[id]/           # 경매방 server page와 client shell
├── hall-of-fame/        # 명예의 전당 페이지
├── league-schedule/     # 일정 페이지
├── auction-timer-lab/   # 타이머 실험 페이지
├── layout.tsx           # metadata, font, PWA shell
└── page.tsx             # 홈 런처와 업데이트 피드
```

## WHERE TO LOOK

| 작업 | 위치 | 주의 |
|---|---|---|
| 경매방 진입 | `room/[id]/page.tsx` | server page에서 role/token 파라미터 흐름 확인 |
| 경매방 client shell | `room/[id]/RoomClient.tsx` | auth, realtime, presence, organizer controls가 모임 |
| 방 Firebase token | `api/room-auth/firebase-token/route.ts` | custom claim은 rules와 연결됨 |
| E2E 경매 fixture | `api/e2e/auction-fixture/**/route.ts` | 운영 계약과 다른 성공 경로를 만들지 말 것 |
| Firebase emulator fixture | `api/e2e/firebase-auction/**/route.ts` | emulator 플래그 없이 활성화하지 말 것 |
| 단축 링크 | `api/short-links/route.ts` | 외부 API 실패 시 사용자 메시지와 내부 오류 구분 |

## CONVENTIONS

- route handler는 입력 검증, 권한 확인, 일반화된 사용자 오류 메시지를 유지한다.
- E2E route는 fixture 플래그가 켜진 경우에만 동작해야 한다.
- `RoomClient` 변경은 `src/features/auction` 규칙과 `doc/AUCTION_REALTIME_CONTRACT.md`를 함께 따른다.
- metadata, manifest, robots, sitemap 변경은 운영 URL과 PWA 동작을 확인한다.

## ANTI-PATTERNS

- route handler에서 Firebase Admin credential이나 token을 로그로 출력하지 않는다.
- fixture 편의를 위해 운영 auth, CSP, rules 전제를 약화하지 않는다.
- `RoomClient`에 새 파생 상태를 중복 구현하기 전에 auction selector/helper를 먼저 찾는다.
