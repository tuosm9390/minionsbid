# Minions Bid

작성일: 2026-06-01

## 프로젝트 개요

Minions Bid는 리그 오브 레전드 커뮤니티 리그를 위한 실시간 선수 경매와 시즌 운영 도구입니다. 경매방 생성, 팀장과 선수 등록, 공개 입찰 또는 비공개 입찰, 리그 일정 편성, 경기 결과 등록, 우승팀 명예의 전당 아카이브를 하나의 운영 흐름으로 연결합니다.

제품의 핵심 가치는 세 가지입니다.

1. 여러 팀장이 동시에 참여하는 경매 상태를 낮은 지연과 높은 정합성으로 동기화합니다.
2. 일반 계정 가입 없이 역할별 링크와 서버 검증으로 주최자, 팀장, 관전자 권한을 분리합니다.
3. 단발 경매 결과를 일정과 명예의 전당으로 이어 붙여 커뮤니티 시즌 운영 비용을 줄입니다.

시각 언어는 `DESIGN.md`의 Cyber-Pixel 시스템을 따릅니다. 두꺼운 검정 테두리, 고대비 노랑/파랑/빨강, 픽셀 폰트, CRT 감성, 3D 아이콘을 사용해 일반 SaaS 대시보드가 아니라 라이브 이벤트 운영 화면처럼 보이게 설계했습니다.

## 핵심 기능

### 실시간 경매

- 방 이름, 팀 수, 팀당 인원, 팀장 포함 방식, 경매 방식, 기본 포인트를 설정해 방을 생성합니다.
- 팀장과 선수 정보는 수동 입력 또는 Excel 업로드로 등록합니다.
- Excel 업로드는 닉네임, 소환사의 협곡 티어, 주/부라인, 무작위 총력전, 전략적 팀 전투, 한마디를 파싱합니다.
- 주최자, 팀장, 관전자 링크를 발급하고 각 역할별 UI와 권한을 제공합니다.
- 선수 추첨, 공개 입찰, 낙찰, 유찰, 재경매, 드래프트 영입을 처리합니다.
- 비공개 입찰 모드에서는 제출, 잠금, 점수공개 카드 애니메이션, 확정, 동점 재입찰을 별도 파이프라인으로 처리합니다.
- organizer와 모든 팀장이 접속 중일 때만 경매가 진행되며, 연결 누락 시 presence guard가 일시정지합니다.

### 리그 일정 관리

- 완료된 경매 아카이브 또는 활성 방 로스터를 바탕으로 리그 일정을 생성합니다.
- 날짜별 경기, 경기 시간, 단계 라벨, 세트 로그, 경기 결과, 메모를 관리합니다.
- 일정 변경과 결과 등록은 관리자 코드 검증을 통과한 서버 액션만 수행합니다.
- 완료 일정은 기본 읽기 전용이고, 관리자 코드 확인 후 편집할 수 있습니다.
- 일정 종료 시 우승팀을 선택해 명예의 전당에 자동 등록합니다.

### 명예의 전당

- 우승 기록을 전시 카드 형태로 조회합니다.
- 경매 아카이브 기반 수동 등록과 일정 종료 기반 자동 등록을 모두 지원합니다.
- 같은 archive 또는 schedule이 중복 등록되지 않도록 deterministic id와 legacy 중복 검사를 함께 사용합니다.
- 관리자 코드로 우승 기록을 등록하거나 삭제합니다.

### 운영 보조

- 홈 화면은 업데이트 피드와 주요 이동 포털을 제공합니다.
- PWA manifest, robots, sitemap, 서비스 워커 등록 흐름을 포함합니다.
- 브라우저에 `window.__auctionLatencyMarkers__`를 남겨 실시간 경매 지연을 디버그할 수 있습니다.
- 운영 스크립트로 방 인증 토큰 감사, Firestore/RTDB rules smoke, legacy token 마이그레이션, 아카이브 seed를 제공합니다.

## 아키텍처

Minions Bid는 Next.js App Router 기반 React 애플리케이션이며 Firebase를 상태 저장소와 인증 보조 계층으로 사용합니다.

```text
Browser
  -> Next.js App Router
  -> React Client Components
  -> Zustand auction store
  -> Server Actions / Route Handlers
  -> Firebase Admin SDK
  -> Firestore canonical state
  -> Realtime Database fanout and presence
```

### 데이터 저장소 역할

Firestore는 정본 상태입니다.

- `rooms/{roomId}`는 현재 경매 hot state를 저장합니다.
- `rooms/{roomId}/teams`는 팀장, 포인트, 로스터 슬롯 정보를 저장합니다.
- `rooms/{roomId}/players`는 선수 상태, 낙찰 팀, 낙찰가, 티어 정보를 저장합니다.
- `rooms/{roomId}/bids`는 공개 입찰 감사 이력입니다.
- `rooms/{roomId}/messages`는 채팅과 시스템 메시지의 영속 기록입니다.
- `rooms/{roomId}/sealed_bid_rounds`는 비공개 입찰 라운드와 제출 문서를 저장합니다.
- `room_auth_secrets/{roomId}`와 `team_tokens/{teamId}`는 역할별 private token 저장소입니다.
- `auction_archives`는 완료된 경매 결과 스냅샷입니다.
- `league_schedules`와 하위 `match_days`는 일정과 날짜별 경기 목록입니다.
- `hall_of_fame`은 우승 기록입니다.

Realtime Database는 저지연 fanout과 presence를 담당합니다.

- `signals/{roomId}/auctionEvent`는 최신 경매 이벤트 envelope를 전달합니다.
- `signals/{roomId}/auctionEvents/{eventId}`는 이벤트 추적과 디버그에 사용됩니다.
- `signals/{roomId}/latestMessage`는 최신 메시지를 빠르게 전파합니다.
- `presence/{roomId}`는 주최자와 팀장 접속 상태를 추적합니다.

이 분리는 의도적입니다. Firestore는 정합성, transaction, 감사 이력, snapshot 복구에 강하고 RTDB는 짧은 이벤트와 접속 상태 fanout에 적합합니다. 화면은 RTDB로 빠르게 반응하되 최종 수렴은 항상 Firestore room canonical state와 `auction_revision`을 기준으로 합니다.

## 핵심 파이프라인

### 1. 방 생성과 역할 링크

`CreateRoomModal`과 `useCreateRoom()`이 입력을 수집하고 `createRoom()` 서버 액션이 Firestore 문서를 생성합니다. 서버는 room, team, player 문서와 private auth 문서를 만들고, 주최자와 팀장 링크를 반환합니다.

링크 자체에는 역할 토큰을 장기 저장하지 않습니다. 신규 방의 public room/team 문서에는 역할 token을 저장하지 않고, `room_auth_secrets` 계층을 정식 저장 위치로 사용합니다. 기존 데이터 호환을 위해 legacy public token fallback은 읽을 수 있지만, 새 구조의 기준은 private auth 문서입니다.

### 2. 역할 인증과 Firebase custom token

이 프로젝트는 일반 로그인 계정 대신 역할 링크를 사용합니다. room auth 흐름은 링크의 room, role, team, token을 검증하고 httpOnly 쿠키를 기록합니다. 쿠키 이름은 room, role, team을 포함해 한 브라우저에서 여러 역할 링크를 열 때 충돌을 줄입니다.

`/api/room-auth/firebase-token`은 검증된 쿠키를 바탕으로 Firebase custom token을 발급합니다. custom claim에는 `roomId`, `role`, `teamId`가 들어가며, direct bid에서 Firestore Security Rules가 요청자의 방과 팀을 검증하는 근거가 됩니다.

### 3. 공개 입찰 hot path

공개 입찰은 지연 시간이 가장 민감한 경로입니다. 그래서 `placeBidDirect()`가 Firestore 클라이언트 SDK transaction을 1차 경로로 사용합니다.

처리 흐름은 다음과 같습니다.

1. 팀장이 입찰 버튼을 누릅니다.
2. 클라이언트가 room 문서와 `bids` 서브컬렉션을 transaction으로 갱신합니다.
3. Firestore rules가 role, roomId, teamId, 금액, 잔액, 현재 선수, timer, `auction_revision` 증가를 검증합니다.
4. 성공하면 Firestore room snapshot이 모든 클라이언트에 1차 전파됩니다.
5. `broadcastBidEvent()` 서버 액션이 RTDB 이벤트, `last_auction_event`, 시스템 메시지를 뒤따라 생성합니다.
6. direct bid가 실패하면 기존 Server Action `placeBid()`로 fallback합니다.

direct bid는 bid id를 `eventId`로 반환하고, 브라우저 latency marker와 후속 RTDB envelope가 같은 id를 공유합니다. 이를 통해 `client-response`, `rtdb`, `room-fallback` 적용 시점을 하나의 marker chain으로 묶어 p95 지연을 추적할 수 있습니다.

공개 입찰 타이머 정책은 `auctionTimings.ts`의 공유 상수로 관리합니다.

- 일반 경매 시작은 10초입니다.
- 입찰 단위와 최초 최소 입찰가는 10P입니다.
- 남은 시간이 5초 이하일 때 성공한 입찰은 타이머를 5초 기준으로 연장합니다.
- `auction_revision`은 timestamp가 아니라 room 단위 단조 증가 counter입니다.

Socket.IO hybrid 경로는 공개 입찰 hot path의 제한적 개선 수단입니다. 기본 transport는 `FIREBASE`이며, `SOCKET_SHADOW`는 Firebase 동작을 유지한 채 Socket engine 결과를 관측합니다. `SOCKET_CANARY`와 `SOCKET`은 단일 서버 10~16명 규모의 공개 입찰 방에서만 primary bid 경로로 사용하는 것을 전제로 합니다. Redis, 다중 Socket 서버, 비공개 입찰 Socket 전환은 현재 기본 범위가 아닙니다.

### 3-1. Firebase 운영 문제와 Socket.IO 보강

초기 설계는 Firebase 단독으로 실시간 경매를 운영하는 것이었습니다. Firestore transaction, Firestore rules, RTDB fanout, presence, `auction_revision`을 조합하면 10명 안팎의 커뮤니티 경매에는 충분하다고 판단했습니다.

하지만 실제 리허설과 운영에서는 공개 입찰 구간에서 문제가 반복됐습니다. 일부 화면은 입찰과 타이머를 즉시 반영하지만 다른 화면은 늦게 따라왔고, 팀장 접속 상태나 custom token 흐름이 경매 진행 판단에 영향을 주는 일이 있었습니다. 입찰 시 Firestore snapshot과 후속 RTDB 이벤트가 모두 도착하면서 타이머가 두 번 갱신되는 것처럼 보이기도 했고, Socket primary 실험 초반에는 화면 상태와 Firestore `active_bid` 정본이 갈라져 타이머 만료 후 낙찰 확정이 진행되지 않는 경로도 확인했습니다.

이 문제의 핵심은 Firebase가 부적합하다는 것이 아니라, 공개 입찰 hot path에서 상태 결정과 화면 전파가 여러 경로에 분산되어 있다는 점이었습니다. 그래서 전체 데이터베이스를 바꾸지 않고, 가장 민감한 공개 입찰 command만 Socket.IO server sequence로 분리했습니다.

현재 해결 구조는 다음과 같습니다.

```text
FIREBASE
  -> 기존 Firestore transaction + RTDB fanout 경로

SOCKET_SHADOW
  -> Firebase 입찰 성공 후 Socket engine에 mirror
  -> UI 정본은 Firebase 유지
  -> latency와 mismatch 관측

SOCKET_CANARY / SOCKET
  -> bid:submit을 Socket.IO로 전송
  -> server engine이 sequence, currentBid, timerEndsAt 결정
  -> Firestore persistence 성공 후에만 auction:state broadcast
```

이 보강으로 공개 입찰에서는 서버가 확정한 하나의 state payload를 모든 클라이언트에 보낼 수 있게 됐습니다. accepted bid는 `persistSocketAcceptedBid()`가 Firestore room hot state와 `bids` history에 먼저 저장하고, 저장 실패 시 engine snapshot을 rollback해 화면 확정 상태와 Firestore 정본이 갈라지지 않게 합니다.

자세한 문제 제기 배경과 해결 기록은 `doc/results/260707_FirebaseOpsIssuesSocketHybridResolution.md`에 정리되어 있습니다.

### 4. 비공개 입찰

비공개 입찰은 `auction_mode === "SEALED_BID"`일 때 활성화됩니다. 공개 입찰의 `active_bid`, `BID_PLACED`, `placeBidDirect()`를 사용하지 않고 서버 액션 중심으로 동작합니다.

처리 단계는 다음과 같습니다.

1. `startSealedBidRound()`가 새 라운드를 만들고 `SEALED_BID_STARTED` 이벤트를 발행합니다.
2. 팀장은 `submitSealedBid()`로 본인 금액만 제출합니다.
3. 제출 문서는 `sealed_bid_rounds/{roundId}/submissions/{teamId}`에 저장됩니다.
4. 타이머 중에는 제출 금액과 제출 여부를 다른 팀장이나 주최자에게 공개하지 않습니다.
5. `lockSealedBidRound()`가 라운드를 잠그고 `SEALED_BID_LOCKED`를 발행합니다.
6. `revealSealedBidRound()`가 공개 카드 결과를 계산하고 `SEALED_BID_REVEALED`를 발행합니다.
7. `SealedBidBoard`가 카드 공개 애니메이션을 진행합니다.
8. `completeSealedBidReveal()`이 낙찰, 유찰, 또는 동점 재입찰을 확정합니다.

재입찰은 별도 화면 상태가 아니라 `eligibleTeamIds`가 있는 새 비공개 입찰 라운드입니다. 최고가 동점 팀만 제출할 수 있고, 직전 최고 금액이 최소 금액이 됩니다.

### 5. 실시간 수렴과 복구

`useFirebaseRealtime()`은 Firestore room snapshot, teams, players, messages, RTDB auction event를 구독하고 Zustand store를 갱신합니다. RTDB 이벤트가 늦거나 누락되면 Firestore room snapshot의 `last_auction_event`와 canonical hot state로 수렴합니다.

`recoverExpiredAuction()`은 만료된 공개 경매를 `awardPlayer()`로 확정하고, 비공개 입찰에서는 라운드를 잠급니다. 여러 클라이언트가 동시에 복구를 깨워도 클라이언트 recovery key와 서버 transaction 멱등성이 중복 처리를 흡수합니다.

주최자와 모든 팀장이 접속되어 있어야 경매가 진행됩니다. 연결이 하나라도 빠지면 organizer presence guard가 경매를 일시정지하고, 모두 다시 연결되면 재개합니다. `/api/auction-watchdog`는 선택적 backup route이며 핵심 경매 상태를 자동 진행하지 않습니다.

### 6. 일정 관리

일정 기능은 `src/features/schedules`에 분리되어 있습니다.

1. `getLeagueScheduleCatalog()`가 일정 목록과 연결 가능한 경매 아카이브를 로드합니다.
2. `createLeagueSchedule()`이 관리자 코드 검증 후 `league_schedules` 문서를 생성합니다.
3. 일정 문서는 `rosterSourceType`과 `rosterSourceId`로 room 또는 archive 로스터를 직접 참조합니다.
4. `getLeagueScheduleTimeline()`이 날짜별 `match_days`, 로스터, 다음 경기 목록을 조합합니다.
5. `saveLeagueScheduleDay()`가 날짜별 경기 목록을 transaction으로 저장하고 revision을 증가시킵니다.
6. `registerLeagueMatchResult()`가 세트 로그와 점수를 검증해 경기 결과를 반영합니다.
7. `completeLeagueSchedule()`이 우승팀을 선택하고 `hall_of_fame/schedule:{scheduleId}` 문서를 만듭니다.

일정 기능은 경매처럼 초저지연이 핵심은 아니지만, 날짜 범위, 로스터 팀, 중복 배정, 경기 결과 불변식이 중요합니다. 클라이언트 payload는 신뢰하지 않고 서버 액션에서 재검증합니다.

### 7. 명예의 전당

명예의 전당은 `src/features/hall-of-fame`에 구현되어 있습니다. `getHallOfFameEntries()`는 전시 데이터를 조회하고, `getAvailableArchives()`는 아직 등록되지 않은 경매 아카이브를 제공합니다. `registerHallOfFameEntry()`는 archive를 서버에서 다시 조회해 `hall_of_fame/archive:{archiveId}` 문서로 저장하며, legacy random id 문서가 같은 archive를 이미 사용했는지도 검사합니다.

이 설계 덕분에 경매 종료 결과와 리그 일정 우승 결과가 같은 전시 계층으로 모입니다.

## 프로젝트 구조

```text
src/
  app/
    api/                         route handlers, auth, fixture APIs
    room/[id]/                   실시간 경매방 page와 client shell
    hall-of-fame/                명예의 전당 페이지
    league-schedule/             일정 페이지
    auction-timer-lab/           타이머 정책 실험 페이지
    layout.tsx                   metadata, font, PWA shell
    page.tsx                     홈 런처와 업데이트 피드
  components/
    create-room/                 방 생성 wizard 단계
    ui/                          Cyber-Pixel icon, overlay, timer helpers
    LeagueScheduleManager.tsx    일정 관리 client shell
    ScheduleMatchDayEditor.tsx   경기 편성 및 결과 입력
  features/
    auction/
      api/                       방, 경매, 채팅, 인증 서버 액션
      components/                경매 보드, 팀 목록, 채팅, 입찰 컨트롤
      hooks/                     realtime, presence, auth, control hooks
      realtime/                  Firebase client/server adapter
      store/                     Zustand state와 selectors
      utils/                     event, auth, roster, display, latency helpers
    schedules/
      api/                       일정 CRUD, 결과 등록, fixture
      utils/                     경기 규칙, 시간, 다음 경기, 전적 계산
    hall-of-fame/
      api/                       우승 기록 조회, 등록, 삭제
      components/                전시 카드와 등록 모달
  lib/
    firebase.ts                  client Firebase 초기화
    firebaseAdmin.ts             Admin SDK 초기화와 named database 지원
  proxy.ts                       Next proxy와 emulator CSP 경계
playwright/                      경매와 일정 E2E
scripts/                         운영 감사, migration, seed, E2E runner
doc/                             아키텍처, 보안, DB, 실시간 계약 문서
```

## 기술 스택

| 영역 | 사용 기술 | 역할 |
|---|---|---|
| Framework | Next.js 16 App Router | 페이지, route handlers, server actions |
| UI | React 19 | 경매방과 일정 관리 client UI |
| Language | TypeScript | 도메인 타입과 서버/클라이언트 계약 |
| Styling | Tailwind CSS 4 | Cyber-Pixel 디자인 토큰과 레이아웃 |
| State | Zustand | 경매방 전역 realtime 상태 |
| Database | Firestore | room canonical state, schedules, archives, hall of fame |
| Realtime | Firebase Realtime Database | auction event fanout, latest message, presence |
| Server SDK | Firebase Admin SDK | 서버 권한 mutation, custom token, migration |
| Animation | Framer Motion, motion | 추첨, 카드 공개, UI transition |
| Excel | xlsx | 팀장/선수 업로드 파싱 |
| Test | Vitest, Testing Library | 단위와 컴포넌트 회귀 테스트 |
| E2E | Playwright | 경매 production validation, OS/browser smoke |

## 검증 전략

경매 핵심 변경은 단위 테스트만으로 완료하지 않습니다. Vitest로 helper와 store/hook 회귀를 잡고, Playwright로 실제 브라우저에서 organizer, leader, viewer 역할 분리와 realtime 수렴을 확인합니다.

### CI 워크플로우

`.github/workflows/quality-ci.yml`은 `master` 브랜치 push, 모든 PR, 수동 실행 시 자동으로 실행되는 품질 게이트입니다. Ubuntu 환경에서 다음 4단계를 순서대로 실행하며, 하나라도 실패하면 PR 병합을 차단합니다.

1. `npm ci` — 의존성 클린 설치
2. `npx tsc --noEmit` — TypeScript 타입 검사
3. `npm run lint` — ESLint 검사
4. `npm test` — Vitest 단위 테스트 (전체 통과 필요)

주요 명령은 다음과 같습니다.

```bash
npm run test
npm run build
npm run test:e2e:auction
npm run test:e2e:auction:compat
npm run test:e2e:multi-pc
npm run test:e2e:auction:8leaders
npm run test:e2e:auction:8leaders:emulator
npm run smoke:room-rules
npm run audit:room-auth-secrets
```

최근 추가된 OS 호환성 검증은 로컬 Chromium smoke와 GitHub Actions의 Ubuntu, Windows, macOS 매트릭스로 대표 공개 입찰 흐름을 확인합니다. 브라우저 엔진 차이는 Ubuntu에서 Chromium, Firefox, WebKit 매트릭스로 분리합니다.

## 주요 구현 특징

- Firestore와 RTDB 역할을 분리해 빠른 반응성과 최종 정합성을 동시에 확보했습니다.
- 공개 입찰 hot path는 Firestore client transaction으로 지연을 줄이되, Firestore rules와 custom token claim으로 최종 방어선을 유지합니다.
- 비공개 입찰은 공개 입찰과 다른 서버 액션 파이프라인으로 구현해 제출 비공개성과 카드 공개 UX를 분리했습니다.
- `auction_revision`을 단조 증가 counter로 사용해 stale RTDB event와 Firestore fallback ordering을 제어합니다.
- role/team-specific cookie와 private auth 문서로 여러 역할 링크를 같은 브라우저에서 열어도 충돌을 줄입니다.
- 일정과 명예의 전당은 경매 결과를 장기 운영 데이터로 전환하는 별도 도메인으로 분리되어 있습니다.
- Cyber-Pixel 디자인 시스템은 단순 장식이 아니라 경매장의 정보 밀도, 긴장감, 공동 관전 경험을 강화하는 제품 언어로 사용됩니다.
