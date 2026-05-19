# Minions Bid

작성일: 2026-05-19

## 프로젝트 개요

Minions Bid는 리그 오브 레전드 커뮤니티 리그를 운영하기 위한 실시간 선수 경매 및 시즌 관리 도구입니다. 단발성 드래프트 페이지가 아니라, 경매방 생성, 선수 추첨, 공개 또는 비공개 입찰, 리그 일정 편성, 경기 결과 등록, 우승팀 명예의 전당 아카이브까지 하나의 운영 흐름으로 연결합니다.

핵심 목표는 세 가지입니다.

1. 여러 팀장이 동시에 참여하는 경매 상태를 빠르고 일관되게 동기화합니다.
2. 일반 계정 시스템 없이 역할별 링크와 서버 검증으로 운영 진입 장벽을 낮춥니다.
3. 경매 결과를 일정과 기록 관리로 이어 붙여 커뮤니티 시즌 운영 비용을 줄입니다.

시각 언어는 `DESIGN.md`의 Cyber-Pixel 방향을 따릅니다. 두꺼운 픽셀 테두리, 고대비 노랑/파랑/검정 조합, CRT 감성 오버레이, 3D 포인트 아이콘, 모달 중심 상호작용을 사용해 일반 SaaS 대시보드와 구분되는 이벤트 운영 도구의 정체성을 만듭니다.

## 제품 범위

### 실시간 경매

- 팀 수, 팀당 인원, 총 포인트, 팀장 포함 여부, 경매 방식을 선택해 방을 생성합니다.
- 팀장과 선수 정보는 수동 입력 또는 Excel 업로드로 등록합니다.
- Excel 업로드는 닉네임, 소환사의 협곡 티어, 주/부라인, 무작위 총력전, 전략적 팀 전투, 한마디 정보를 읽어 선수 및 팀장 데이터로 변환합니다.
- 주최자, 팀장, 관전자 링크를 생성하고 각 역할에 맞는 화면과 권한을 제공합니다.
- 방 링크는 Buly 단축 URL API를 통해 짧은 형태로 변환되어 공유됩니다. 링크에는 인증 토큰을 포함하지 않으며, 입장 시 서버에서 별도 인증합니다.
- 선수 추첨, 경매 시작, 타이머, 입찰, 낙찰, 유찰, 재경매, 드래프트 영입을 처리합니다.
- 공개 입찰과 비공개 입찰을 모두 지원합니다.

### 리그 일정 관리

- 완료된 경매 아카이브 또는 활성 방의 로스터를 바탕으로 리그 일정을 생성합니다.
- 날짜별 경기, 경기 시간, 단계 라벨, 세트 로그, 경기 결과, 메모를 관리합니다.
- 일정 변경과 결과 등록은 관리자 코드 검증을 통과한 서버 액션만 수행합니다.
- 완료 일정은 기본적으로 읽기 전용이며, 관리자 코드 확인 후 편집을 해제할 수 있습니다.
- 일정 종료 시 우승팀을 선택하고 명예의 전당에 자동 등록합니다.

### 명예의 전당

- 우승 기록을 전시 벽 형태로 조회합니다.
- 경매 아카이브 기반 수동 등록과 일정 종료 기반 자동 등록을 모두 지원합니다.
- 관리자 코드로 우승 기록을 등록하거나 삭제합니다.
- 시즌명, 우승팀, 팀장, 선수 명단, 낙찰가를 장기 기록으로 보존합니다.

### 홈과 운영 보조 기능

- 홈 화면에는 최신 업데이트 피드와 주요 이동 포털을 제공합니다.
- PWA manifest와 서비스 워커를 포함해 모바일 홈 화면 진입과 기본 정적 캐시를 지원합니다.
- 실시간 경매 지연 분석을 위해 브라우저 디버그 marker를 남길 수 있습니다.
- 운영 스크립트로 방 인증 토큰 감사, Firestore rules 스모크, legacy token 마이그레이션을 제공합니다.

## 아키텍처 요약

Minions Bid는 Next.js App Router 애플리케이션이며, Firebase를 실시간 상태 저장소와 운영 백엔드로 사용합니다.

```text
사용자 브라우저
  -> Next.js App Router 페이지
  -> React 클라이언트 컴포넌트와 Zustand store
  -> Server Actions / Route Handlers
  -> Firebase Admin SDK
  -> Firestore canonical state
  -> Realtime Database fanout / presence
```

### 데이터 저장소 역할

Firestore는 정본 상태입니다.

- `rooms/{roomId}`는 현재 경매 hot state를 가집니다.
- `rooms/{roomId}/teams`는 팀장, 포인트, 팀 메타데이터를 저장합니다.
- `rooms/{roomId}/players`는 선수 상태, 낙찰 팀, 낙찰가, 티어 정보를 저장합니다.
- `rooms/{roomId}/bids`는 공개 입찰 감사 이력입니다.
- `rooms/{roomId}/messages`는 채팅과 시스템 메시지의 영속 기록입니다.
- `room_auth_secrets/{roomId}`와 하위 `team_tokens/{teamId}`는 역할별 private token 저장소입니다.
- `auction_archives`는 완료된 경매 결과 스냅샷입니다.
- `league_schedules`와 하위 `match_days`는 일정과 날짜별 경기 목록입니다.
- `hall_of_fame`은 우승 기록입니다.

Realtime Database는 저지연 fanout과 presence 전용입니다.

- `signals/{roomId}/auctionEvent`는 최신 경매 이벤트 envelope를 전달합니다.
- `signals/{roomId}/auctionEvents/{eventId}`는 이벤트 추적과 디버그에 사용됩니다.
- `signals/{roomId}/latestMessage`는 최신 메시지 표시를 빠르게 퍼뜨립니다.
- `presence/{roomId}`는 주최자와 팀장 접속 상태를 추적합니다.

이 분리는 의도적입니다. Firestore는 정합성, 감사 이력, snapshot 복구에 강하고, RTDB는 짧은 이벤트와 접속 상태 fanout에 적합합니다. 따라서 화면은 빠르게 반응하되, 최종 수렴 기준은 항상 Firestore room canonical state와 `auction_revision`입니다.

## 핵심 파이프라인

### 1. 방 생성과 역할 링크 발급

방 생성은 `CreateRoomModal`과 `useCreateRoom()`에서 사용자 입력을 수집하고, `createRoom()` 서버 액션이 Firestore에 실제 데이터를 생성합니다.

주요 입력은 다음과 같습니다.

- 방 이름
- 팀 수와 팀당 인원
- 팀장 포함 방식
- 공개 입찰 또는 비공개 입찰 방식
- 팀별 기본 포인트
- 팀장 목록과 팀장 포인트
- 선수 목록
- 연결 일정 또는 리그명

서버는 다음 문서를 생성합니다.

- `rooms/{roomId}`에 방 메타데이터와 경매 hot state 초기값
- `rooms/{roomId}/teams/{teamId}`에 팀 정보
- `rooms/{roomId}/players/{playerId}`에 `WAITING` 상태 선수
- `room_auth_secrets/{roomId}`에 organizer/viewer token

반환된 링크는 Buly 단축 URL API(`/api/short-links`)를 통해 짧은 형태로 변환됩니다. 링크 자체에 인증 토큰을 포함하지 않으므로 URL이 유출되어도 바로 권한을 얻지 못합니다.
- `room_auth_secrets/{roomId}/team_tokens/{teamId}`에 팀장 token

반환된 token은 링크 생성에만 사용됩니다. 신규 방의 public room/team 문서에는 역할 token을 저장하지 않습니다. 기존 데이터 호환을 위해 인증 유틸은 legacy public token fallback을 읽을 수 있지만, 현재 구조의 정식 저장 위치는 private auth 문서입니다.

### 2. 역할 인증과 Firebase custom token

이 프로젝트는 일반 로그인 계정 대신 역할 기반 링크를 사용합니다.

`/api/room-auth`는 링크의 `roomId`, `role`, `teamId`, `token`을 검증하고 성공하면 `httpOnly` 쿠키를 기록합니다. 쿠키 이름은 방, 역할, 팀장 ID를 포함하므로 같은 사용자가 여러 역할 링크를 열어도 충돌을 줄입니다.

`/api/room-auth/firebase-token`은 검증된 쿠키를 바탕으로 Firebase custom token을 발급합니다. custom claim에는 다음 값이 들어갑니다.

- `roomId`
- `role`
- `teamId`

이 token은 공개 입찰 hot path에서 Firestore Security Rules가 요청자의 방, 역할, 팀을 검증하는 근거가 됩니다.

### 3. 공개 입찰 hot path

공개 입찰은 지연 시간이 가장 민감한 경로입니다. 그래서 `placeBidDirect()`가 Firestore 클라이언트 SDK transaction을 1차 경로로 사용합니다.

처리 흐름은 다음과 같습니다.

1. 팀장이 입찰 버튼을 누릅니다.
2. 클라이언트가 현재 room 문서와 `bids` 서브컬렉션을 transaction으로 갱신합니다.
3. Firestore rules가 role, roomId, teamId, 금액, 잔액, 현재 선수, timer, `auction_revision` 증가를 검증합니다.
4. 성공하면 Firestore room snapshot이 모든 클라이언트에 1차 전파됩니다.
5. `broadcastBidEvent()` 서버 액션이 fire-and-forget으로 RTDB 이벤트, `last_auction_event`, 시스템 메시지를 뒤따라 생성합니다.
6. RTDB `auctionEvents` 히스토리는 `PLAYER_AWARDED` 또는 `SEALED_BID_AWARDED` 발행 시 서버가 정리합니다. 이 prune 로직은 이전 선수의 이벤트가 새 경매에 간섭하는 것을 방지합니다.
6. direct bid가 실패하면 기존 Server Action `placeBid()`로 fallback합니다.

공개 입찰 타이머 정책은 공유 상수 `auctionTimings.ts`에 모여 있습니다.

- 일반 경매 시작은 10초입니다.
- 재경매 여부는 `nextAuctionDurationMs` 값으로 판별합니다. `nextAuctionDurationMs`가 재경매 지속 시간과 같으면 재경매 라운드입니다.
- 입찰 단위와 최초 최소 입찰가는 10P입니다.
- 남은 시간이 8초 이하일 때 성공한 입찰은 타이머를 8초 기준으로 연장합니다.
- 남은 시간이 8초 초과이면 기존 종료 시각을 유지합니다.

이 구조는 Vercel Server Action 왕복을 줄여 입찰 반응 속도를 높이면서도, 최종 방어선을 Firestore rules에 둡니다.

### 4. 비공개 입찰 파이프라인

비공개 입찰은 공개 입찰과 별도 경로입니다. `auction_mode`가 `SEALED_BID`일 때 활성화되며, `active_bid`, `BID_PLACED`, `placeBidDirect()`를 사용하지 않습니다.

처리 단계는 다음과 같습니다.

1. 주최자가 경매를 시작하면 `startSealedBidRound()`가 새 라운드를 만들고 `SEALED_BID_STARTED` 이벤트를 발행합니다.
2. 팀장은 `submitSealedBid()`로 본인 금액만 제출합니다.
3. 제출 문서는 `rooms/{roomId}/sealed_bid_rounds/{roundId}/submissions/{teamId}`에 저장됩니다.
4. 타이머 중에는 제출 금액과 제출 여부를 다른 팀장이나 주최자에게 공개하지 않습니다.
5. 타이머가 만료되면 `lockSealedBidRound()`가 라운드를 잠그고 `SEALED_BID_LOCKED`를 발행합니다.
6. 주최자가 점수 공개를 누르면 `revealSealedBidRound()`가 카드 결과를 계산하고 `SEALED_BID_REVEALED`를 발행합니다.
7. 클라이언트는 `SealedBidBoard`에서 카드 공개 애니메이션을 진행합니다.
8. 애니메이션이 끝난 뒤 `completeSealedBidReveal()`이 낙찰, 유찰, 또는 동점 재입찰을 확정합니다.

재입찰은 새 화면 상태가 아니라 `eligibleTeamIds`가 있는 새 비공개 입찰 라운드입니다. 최고가 동점 팀만 제출할 수 있고, 직전 최고 금액이 최소 금액이 됩니다.

### 5. 경매 종료와 복구

경매 만료 복구는 `recoverExpiredAuction()`이 담당합니다. 일반 공개 입찰에서는 만료된 경매를 `awardPlayer()`로 확정하고, 비공개 입찰에서는 라운드를 잠급니다.

중복 호출은 허용됩니다. 클라이언트는 recovery key로 반복 호출을 줄이고, 서버 transaction은 이미 처리된 선수나 맞지 않는 revision을 다시 처리하지 않습니다. 이 설계는 여러 브라우저가 동시에 만료 복구를 깨우는 환경을 전제로 합니다.

주최자 presence guard는 팀장 연결 끊김을 감지해 경매를 일시정지하고, 팀장이 돌아오면 재개할 수 있게 합니다. `/api/auction-watchdog`는 이 흐름의 핵심이 아니라 선택적 backup sweep입니다.

### 6. 일정 관리 파이프라인

일정 관리 도메인은 `features/schedules`에 분리되어 있습니다.

핵심 흐름은 다음과 같습니다.

1. `getLeagueScheduleCatalog()`가 일정 목록과 연결 가능한 경매 아카이브 목록을 로드합니다.
2. `createLeagueSchedule()`이 관리자 코드 검증 후 `league_schedules` 문서를 생성합니다.
3. 일정 문서는 `rosterSourceType`과 `rosterSourceId`를 저장해 room 또는 archive 로스터를 직접 조회합니다.
4. `getLeagueScheduleTimeline()`이 날짜별 `match_days`, 로스터, 다음 경기 목록을 조합합니다.
5. `saveLeagueScheduleDay()`가 날짜별 경기 목록을 transaction으로 저장하고 revision을 증가시킵니다.
6. `registerLeagueMatchResult()`가 세트 로그와 점수를 검증한 뒤 transaction으로 경기 결과를 반영합니다.
7. `completeLeagueSchedule()`이 우승팀을 선택하고 `hall_of_fame`에 `schedule:{scheduleId}` 문서로 기록합니다.

일정 도메인의 중요한 특징은 로스터 복원입니다. 활성 room, 완료 archive, legacy 연결 값을 순서대로 조회해 일정에 필요한 팀 목록을 재구성합니다. 경매방이 종료된 뒤에도 일정과 명예의 전당이 독립적으로 유지될 수 있게 하기 위한 설계입니다.

### 7. 명예의 전당 파이프라인

명예의 전당은 `features/hall-of-fame`에 구현되어 있습니다.

- `getHallOfFameEntries()`는 등록된 우승 기록을 조회합니다.
- `getAvailableArchives()`는 아직 등록되지 않은 경매 아카이브를 제공합니다.
- `registerHallOfFameEntry()`는 관리자 코드 검증 후 archive 기반 우승 기록을 추가합니다.
- `deleteHallOfFameEntry()`는 관리자 코드 검증 후 우승 기록을 삭제합니다.
- 일정 종료 경로는 `completeLeagueSchedule()`에서 직접 `hall_of_fame` 문서를 생성합니다.

이렇게 경매 결과와 리그 일정 결과가 같은 전시 계층으로 모이기 때문에, 제품은 단순한 실시간 이벤트 도구를 넘어 시즌 기록 저장소로 확장됩니다.

## 프로젝트 구조

```text
src/
  app/
    api/
      auction-watchdog/              선택적 경매 만료 backup route
      e2e/                           Playwright fixture API
      room-auth/                     역할 링크 인증과 Firebase custom token 발급
      room-links/                    주최자 쿠키 기반 방 링크 조회
      short-links/                   Buly 단축 URL 프록시 API
    auction-timer-lab/               타이머 정책 검증용 실험 페이지
    hall-of-fame/                    명예의 전당 App Router 페이지
    league-schedule/                 리그 일정 App Router 페이지
    room/[id]/                       실시간 경매방 페이지와 room shell
    layout.tsx                       전역 metadata, PWA, 구조화 데이터
    page.tsx                         홈 런처와 업데이트 피드
  components/
    create-room/                     방 생성 단계별 UI
    ui/                              PixelIcon, 3D icon, overlay dismiss 등 공용 UI
    LeagueScheduleManager.tsx        일정 관리 클라이언트 shell
    ScheduleCalendar.tsx             날짜 선택과 day preview
    ScheduleMatchDayEditor.tsx       경기 편성 및 결과 입력
    ScheduleRosterPanel.tsx          일정 로스터 표시
    LeagueRecordSummaryPanel.tsx     순위와 경기 요약
    UpdateTicker.tsx                 홈 업데이트 공지 ticker
  content/
    updateFeed.ts                    홈 업데이트 피드 데이터
  features/
    auction/
      api/                           방, 경매, 채팅, 인증 서버 액션
      components/                    경매 보드, 팀 목록, 채팅, 입찰 컨트롤
      constants/                     타이밍, 방 기본값, 아이콘, 도움말
      hooks/                         실시간 구독, presence, 방 생성, 경매 제어
      realtime/                      Firebase client/server adapter
      store/                         Zustand room state와 selector
      utils/                         realtime event, auth, roster, display helper
    hall-of-fame/
      api/                           우승 기록 조회, 등록, 삭제
      components/                    전시 카드와 등록 모달
      types.ts                       명예의 전당 타입
    schedules/
      api/                           일정 CRUD, 결과 등록, fixture
      utils/                         경기 규칙, 시간, 다음 경기, 전적 계산
      types.ts                       일정 도메인 타입
    timer-lab/
      actions.ts                     타이머 실험용 서버 액션
  lib/
    firebase.ts                      클라이언트 Firebase 초기화
    firebaseAdmin.ts                 Admin SDK 초기화와 named database 지원
    utils.ts                         공용 className helper
  proxy.ts                           Next proxy entry
public/
  sw.js                              서비스 워커
  icons, rank images, favicon        UI 자산
scripts/
  audit_room_auth_secrets.js         private auth 구조 감사
  migrate_room_auth_secrets.js       legacy public token 마이그레이션
  smoke_room_rules.js                Firestore rules 스모크 검증
  run_auction_e2e.js                 경매 E2E 실행 wrapper
```

## 주요 모듈 설명

| 영역 | 대표 파일 | 책임 |
| --- | --- | --- |
| 방 생성 | `src/features/auction/hooks/useCreateRoom.ts` | 다단계 입력, Excel 파싱, 링크 생성, 활성 방 확인 |
| 방 저장 | `src/features/auction/api/roomActions.ts` | room/team/player 생성, private auth token 저장, archive 저장, 방 삭제 |
| 인증 | `src/features/auction/utils/roomAuth.ts` | role 검증, cookie 이름, token 문서 fallback 검증 |
| 주최자 권한 | `src/features/auction/api/organizerAuth.ts` | 서버 액션에서 organizer cookie와 저장 token 검증 |
| 공개 입찰 | `src/features/auction/api/placeBidClient.ts` | Firestore client transaction direct bid |
| 경매 흐름 | `src/features/auction/api/auctionFlowActions.ts` | 추첨, 시작, 일시정지, 낙찰, 유찰, 비공개 입찰 흐름 |
| 실시간 계약 | `src/features/auction/utils/auctionRealtime.ts` | event envelope, revision ordering, 클라이언트 apply rules |
| 상태 저장 | `src/features/auction/store/useAuctionStore.ts` | room state, sealed bid state, messages, presence |
| 경매 UI | `src/app/room/[id]/RoomClient.tsx` | 역할별 방 화면 조립 |
| 비공개 입찰 UI | `src/features/auction/components/board/SealedBidBoard.tsx` | 입찰 대상 정보, 잠금 카드, 공개 애니메이션 |
| 일정 서버 | `src/features/schedules/api/scheduleActions.ts` | 일정 생성, 저장, 결과 등록, 종료, 로스터 복원 |
| 일정 계산 | `src/features/schedules/utils/*.ts` | 경기 규칙, 세트 스코어, 다음 경기, 전적 집계 |
| 명예의 전당 | `src/features/hall-of-fame/api/hallOfFameActions.ts` | 우승 기록 조회와 관리자 변경 |

## 기술 스택

### 프론트엔드

- Next.js 16.1.6
- React 19.2.3
- TypeScript 5
- Tailwind CSS 4
- Framer Motion과 Motion
- Zustand
- Lucide React
- `xlsx`

### 백엔드와 데이터

- Firebase Firestore
- Firebase Realtime Database
- Firebase Admin SDK
- Next.js Server Actions
- Next.js Route Handlers
- Firebase custom token과 Security Rules

### 테스트와 품질

- Vitest
- Testing Library
- Playwright
- ESLint 9
- E2E fixture routes
- Firestore rules smoke script
- Room auth audit script

## 보안 모델

보안 경계는 세 층으로 나뉩니다.

### 1. 링크 인증과 쿠키

사용자는 역할 링크로 입장하지만, 링크는 단순 routing 값이 아닙니다. `/api/room-auth`가 token을 private auth 문서와 비교한 뒤에만 `httpOnly` 쿠키를 기록합니다.

### 2. Server Action 가드

추첨, 시작, 일시정지, 낙찰, 유찰, 드래프트 영입, 비공개 입찰 공개와 확정, 결과 저장, 방 삭제는 서버 액션에서 주최자 권한을 확인합니다. 일정 생성, 일정 저장, 결과 등록, 일정 종료, 명예의 전당 변경은 관리자 코드를 확인합니다.

### 3. Firestore rules direct bid 검증

공개 입찰 direct path는 클라이언트가 Firestore에 직접 쓰는 예외 경로입니다. 그래서 custom token claim과 Firestore rules가 최종 방어선입니다.

검증하는 핵심 조건은 다음과 같습니다.

- 요청자가 해당 방의 팀장입니다.
- 요청 팀과 custom token의 teamId가 일치합니다.
- 현재 경매 선수와 입찰 playerId가 일치합니다.
- 자기 팀이 이미 최고 입찰자이면 거부합니다.
- 새 입찰 금액이 기존 금액보다 큽니다.
- 팀 포인트 잔액이 충분합니다.
- `auction_revision`이 정확히 1 증가합니다.
- 타이머 연장 범위가 8초 정책과 맞습니다.

## 테스트 전략

단위 테스트는 도메인 로직과 React hook을 중심으로 구성되어 있습니다.

- `auctionRealtimeUtils` 계열은 event revision과 state apply rules를 검증합니다.
- `useAuctionRealtime` 테스트는 RTDB event와 Firestore fallback 수렴을 검증합니다.
- `useBiddingControl` 테스트는 direct bid 우선 호출과 fallback 흐름을 검증합니다.
- 일정 테스트는 관리자 가드, transaction 저장, 결과 등록, 전적 계산을 검증합니다.
- 명예의 전당 테스트는 archive 기반 등록과 삭제 흐름을 검증합니다.

E2E는 Playwright fixture 모드를 제공합니다.

- `NEXT_PUBLIC_E2E_AUCTION_FIXTURE=1`과 fixture API로 경매 시나리오를 결정적으로 재현합니다.
- 일정 E2E는 Firebase 없이 fixture 상태를 초기화해 생성, 저장, 결과 등록, 종료 흐름을 검증합니다.

운영 검증 스크립트도 별도로 있습니다.

```bash
npm run audit:room-auth-secrets
npm run smoke:room-rules
npm run migrate:room-auth-secrets:dry-run
```

## 주요 구현 특징

### Firestore 정본과 RTDB fanout 분리

실시간 시스템에서 빠른 이벤트만으로 UI를 구성하면 누락, 순서 뒤집힘, 늦은 입장 복구 문제가 생깁니다. 이 프로젝트는 Firestore room 문서를 정본으로 두고, RTDB는 빠른 이벤트 전달만 담당하게 해 이 문제를 줄입니다.

### `auction_revision` 기반 수렴

경매 이벤트는 `revision`을 포함합니다. 클라이언트는 현재 revision 이하의 이벤트를 무시합니다. RTDB event, Firestore snapshot, `last_auction_event` fallback이 섞여 들어와도 더 오래된 상태가 최신 상태를 덮어쓰지 못합니다.

### RTDB 이벤트 히스토리 정리

낙찰(`PLAYER_AWARDED`, `SEALED_BID_AWARDED`) 발행 시 서버가 이전 경매의 RTDB `auctionEvents` 히스토리를 정리합니다. 이 prune 전략은 긴 경매 세션에서 이벤트가 누적되어 새 라운드에 간섭하는 문제를 방지합니다.

### 누락 RTDB 이벤트 방어

`applyAuctionEventToState`는 이전 이벤트가 누락된 채 후속 이벤트만 도착하는 상황에 대비해 방어적 null 초기화를 수행합니다. 예를 들어 `AUCTION_STARTED` 또는 `AUCTION_RESUMED` 이벤트 수신 시 `lotteryPlayer`를 강제로 초기화하여 추첨 패널이 잔류하는 버그를 방지합니다.

### 공개 입찰과 비공개 입찰의 경계 분리

공개 입찰은 속도가 중요하므로 direct Firestore transaction을 사용합니다. 비공개 입찰은 금액 비공개와 공개 시점 통제가 중요하므로 서버 액션 경계에서만 처리합니다. 두 방식이 같은 room UI 안에서 작동하지만, 데이터 경로와 이벤트 타입은 명확히 분리되어 있습니다.

### 인증 토큰 없는 단축 링크

방 링크에서 인증 토큰을 제거하고, Buly 단축 URL API를 통해 짧은 형태로 변환합니다. 입장 시 `/api/room-auth`가 서버에서 토큰을 검증하므로, URL 유출 시 바로 권한을 얻지 못합니다. 이 변경은 토큰 비공개 저장 구조와 함께 보안 경계를 강화합니다.

### 토큰 비공개 저장 구조

초기 링크 기반 운영의 편의성을 유지하면서도, 신규 방의 역할 token은 public room/team 문서가 아니라 `room_auth_secrets` 하위로 분리했습니다. 이 구조는 Firestore rules와 감사 스크립트로 계속 확인할 수 있습니다.

### 일정과 기록까지 이어지는 운영 흐름

경매 완료 결과는 `auction_archives`로 저장되고, 일정은 room 또는 archive 로스터를 참조합니다. 일정 종료는 명예의 전당으로 연결됩니다. 실시간 경매라는 순간성 이벤트를 시즌 운영과 장기 기록으로 확장한 점이 이 프로젝트의 핵심 제품 구조입니다.

### UI와 도메인 상태의 분리

경매 화면은 복잡하지만, 파생 상태 계산과 event apply rules는 `auctionRealtime.ts`, selector, store에 모여 있습니다. `RoomClient`는 역할별 레이아웃과 액션 연결에 집중하고, 세부 보드는 공개 입찰, 비공개 입찰, 추첨, 채팅, 팀 목록 컴포넌트로 나뉩니다.

## 실행과 운영 명령

```bash
npm install
npm run dev
npm run build
npm run test
npm run test:e2e:auction
npm run audit:room-auth-secrets
npm run smoke:room-rules
```

필수 환경 변수는 README에 정리되어 있습니다. 이 프로젝트는 named Firestore database `minionsbid`를 사용하므로, Firebase Admin SDK와 클라이언트 SDK 양쪽에서 `FIRESTORE_DATABASE_ID` 또는 `NEXT_PUBLIC_FIRESTORE_DATABASE_ID` 설정이 중요합니다.

## 참고 진입점

- `README.md`
- `DESIGN.md`
- `doc/ARCHITECTURE.md`
- `doc/AUCTION_REALTIME_CONTRACT.md`
- `doc/SECURITY.md`
- `src/app/page.tsx`
- `src/app/room/[id]/RoomClient.tsx`
- `src/features/auction/api/auctionFlowActions.ts`
- `src/features/auction/api/roomActions.ts`
- `src/features/auction/api/placeBidClient.ts`
- `src/features/auction/utils/auctionRealtime.ts`
- `src/features/auction/utils/roomAuth.ts`
- `src/features/schedules/api/scheduleActions.ts`
- `src/features/hall-of-fame/api/hallOfFameActions.ts`
