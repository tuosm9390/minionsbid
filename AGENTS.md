# PROJECT KNOWLEDGE BASE - Minions Bid

Generated: 2026-06-01
Commit: ecb97cc
Branch: master

## OVERVIEW

Minions Bid는 리그 오브 레전드 커뮤니티의 선수 경매, 리그 일정, 명예의 전당을 연결하는 Next.js App Router 애플리케이션이다. 핵심은 Firestore 정본 상태, RTDB 저지연 fanout, 역할 링크 기반 권한 모델, Cyber-Pixel UI, Playwright 중심 경매 검증이다.

## STRUCTURE

```text
league-auction/
├── src/app/                  # App Router 페이지, route handlers, room shell
├── src/components/           # 방 생성, 일정, 공용 Cyber-Pixel UI
├── src/features/auction/     # 경매 도메인, 서버 액션, realtime, store
├── src/features/schedules/   # 리그 일정 도메인, 서버 액션, 규칙 유틸
├── src/features/hall-of-fame/# 우승 기록 조회, 등록, 전시
├── src/lib/                  # Firebase client/admin 초기화와 공용 유틸
├── playwright/               # 경매 production validation E2E
├── __tests__/                # Vitest 단위와 컴포넌트 회귀 테스트
├── scripts/                  # 운영 감사, 마이그레이션, E2E runner
└── doc/                      # 아키텍처, 실시간 계약, 보안, DB 문서
```

## WHERE TO LOOK

| 작업 | 위치 | 주의 |
|---|---|---|
| 경매 상태 전이 | `src/features/auction/api/auctionFlowActions.ts` | Firestore room hot state와 `auction_revision` 계약 유지 |
| 경매 화면 수렴 | `src/features/auction/hooks/useAuctionRealtime.ts` | RTDB stale event와 Firestore fallback을 함께 고려 |
| 입찰 hot path | `src/features/auction/api/placeBidClient.ts` | direct bid는 rules가 최종 방어선 |
| 방 화면 shell | `src/app/room/[id]/RoomClient.tsx` | 역할 auth, presence, realtime 훅이 모이는 곳 |
| 일정 저장 | `src/features/schedules/api/scheduleActions.ts` | 날짜, 팀, 결과 검증은 서버 경계에서 수행 |
| 일정 UI | `src/components/LeagueScheduleManager.tsx` | 큰 파일이므로 helper와 테스트 범위를 먼저 확인 |
| 명예의 전당 | `src/features/hall-of-fame/api/hallOfFameActions.ts` | archive 기반 중복 방지 유지 |
| 경매 E2E | `playwright/auction-realtime.spec.ts` | 단위 테스트보다 높은 신뢰도의 production validation |
| Firebase 통합 E2E | `playwright/auction-eight-leaders-emulator.spec.ts` | Java와 firebase-tools 필요 |
| 보안/마이그레이션 | `scripts/` | dry-run과 secret redaction 유지 |

## CODE MAP

| Symbol | Type | Location | Role |
|---|---|---|---|
| `RoomClient` | React component | `src/app/room/[id]/RoomClient.tsx` | 경매방 클라이언트 shell |
| `useFirebaseRealtime` | React hook | `src/features/auction/hooks/useAuctionRealtime.ts` | Firestore/RTDB 구독과 store 수렴 |
| `placeBidDirect` | client API | `src/features/auction/api/placeBidClient.ts` | 공개 입찰 저지연 Firestore transaction |
| `broadcastBidEvent` | server action | `src/features/auction/api/auctionFlowActions.ts` | direct bid 후속 RTDB envelope 발행 |
| `recoverExpiredAuction` | server action | `src/features/auction/api/auctionActions.ts` | 만료 경매 복구와 비공개 라운드 잠금 |
| `useAuctionPresenceGuard` | React hook | `src/features/auction/hooks/useAuctionPresenceGuard.ts` | 주최자와 모든 팀장 접속 조건 적용 |
| `createRoom` | server action | `src/features/auction/api/roomActions.ts` | 방, 팀, 선수, private auth 문서 생성 |
| `saveLeagueScheduleDay` | server action | `src/features/schedules/api/scheduleActions.ts` | 날짜별 경기 저장 transaction |
| `completeLeagueSchedule` | server action | `src/features/schedules/api/scheduleActions.ts` | 일정 종료와 hall of fame 등록 |

## CONVENTIONS

- Next.js App Router, React, TypeScript를 기준으로 작성한다.
- Firestore는 방의 정본 상태, Realtime Database는 저지연 팬아웃 버스로 취급한다.
- 스타일은 Tailwind CSS v4와 `DESIGN.md`의 Cyber-Pixel 원칙을 따른다.
- 테스트는 Vitest와 Playwright를 사용한다.
- 기존 문서와 구현을 먼저 읽고, 추측으로 구조를 만들지 않는다.
- 변경 파일에 가까운 테스트를 먼저 실행하고, 실시간 경매 변경은 Playwright 경매 E2E로 확인한다.

## ANTI-PATTERNS

- `any`, `@ts-ignore`, `@ts-expect-error`, 빈 `catch` 블록을 추가하지 않는다.
- 프로덕션 코드에 `console.log`를 남기지 않는다.
- 보안 우회를 위해 CORS, 인증, Firebase Rules, 검증 로직을 약화하지 않는다.
- Firestore와 RTDB의 역할을 섞지 않는다.
- `auction_revision`을 timestamp처럼 다루지 않는다.
- 입찰, 낙찰, 타이머, 추첨, 시스템 메시지, presence의 필드 이름, 경로, event type, revision 비교 규칙을 부수 변경하지 않는다.
- 보라색 SaaS 그라디언트, 무난한 카드 그리드, 둥근 버블형 UI를 기본값으로 쓰지 않는다.

## UNIQUE STYLES

- Cyber-Pixel 방향성을 유지한다. 두꺼운 테두리, 고대비 색, 픽셀 감성, 기술적인 긴장감이 기본이다.
- 반응형 타이포그래피는 가능한 `text-fluid-*` 토큰과 기존 패턴을 따른다.
- 새 TypeScript/JavaScript/Python/SQL 소스 파일은 첫 줄에 역할을 설명하는 한국어 헤더 주석을 둔다.
- 한국어 문장은 콜론으로 끝내지 않는다.

## COMMANDS

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test:e2e:auction
npm run test:e2e:auction:compat
npm run test:e2e:multi-pc
npm run test:e2e:auction:8leaders
npm run test:e2e:auction:8leaders:emulator
npm run audit:room-auth-secrets
npm run smoke:room-rules
npm run migrate:room-auth-secrets:dry-run
```

## NOTES

- 하위 `AGENTS.md`가 있으면 해당 디렉터리에서는 그 문서가 더 구체적인 규칙이다.
- 경매 계약 변경은 `doc/AUCTION_REALTIME_CONTRACT.md`, `doc/ARCHITECTURE.md`, 관련 테스트, 마이그레이션/호환 계획을 함께 갱신해야 한다.
- `doc/CONVENTIONS.md`는 현재 내용이 비어 있는 수준이라 신뢰 가능한 컨벤션 소스가 아니다.
- `.omo/`는 작업 evidence 성격이 강하며 일반 코드 커밋 대상이 아니다.
