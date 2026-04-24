작성일: 2026-03-05 15:52:00
작성자: Antigravity

# Components & State

이 문서는 Minions Bid 프로젝트의 핵심 React 컴포넌트와 Zustand 전역 상태, 그리고 실시간 구독(Realtime) 전략에 대해 설명합니다.

## UI Components

- `PixelIcon` (`src/components/ui/PixelIcon.tsx`) — 프로젝트의 **Cyber-Pixel** 테마를 위한 공용 아이콘 컴포넌트. `lucide-react` 아이콘을 픽셀 아트 스타일(`crispEdges`, `strokeWidth: 3`)로 렌더링하며, `framer-motion` 기반의 상태별 애니메이션(idle, urgent, success, active)을 지원합니다. 접근성을 위해 `label` 속성을 통한 ARIA 지원 및 `isInteractive` 속성을 통한 터치 영역(44px) 확보 기능을 포함합니다.

## Key Components

- `RoomClient` (`room/[id]/RoomClient.tsx`) — Client Component. 경매 UI 전체 + `useAuctionRealtime` 호출.
- `CreateRoomModal` (`src/components/`) — 4-step modal: (0) basic info + previous rooms, (1) captain registration, (2) player registration (with Excel import), (3) links. Saves rooms to `localStorage` key `league_auction_rooms` (max 5). Includes sample data template button.
- `AuctionArchiveSection` (`src/components/`) — Displays past auction results from `auction_archives` table with filtering.
- `AuctionBoard` — Center panel. Shows captain connection grid (Presence-based) when idle, full auction UI when active. Contains `CenterTimer` (large countdown) and `NoticeBanner` (latest `NOTICE` message).
- `ChatPanel` — Realtime chat. `SYSTEM` messages show as gray italic pills; `NOTICE` messages show as amber banners.
- `BiddingControl` — Bid form with amount input and validation, shown to LEADER role. `teamIdParam` (raw cookie value) 직접 사용. ⚠️ 알려진 P2 버그: 검증된 teamId 대신 쿠키 원본값 전달.
- `LinksModal` — ORGANIZER only; regenerates all invite links from store data.
- `HowToUseModal` — Usage guide, available in header for all roles.
- `EndRoomModal` — Room deletion confirmation with `saveAuctionArchive` + `deleteRoom` flow.
- `AuctionResultModal` — 경매 완료 후 최종 결과 테이블 모달.
- `LotteryAnimation` — 슬롯머신 추첨 애니메이션 (Framer Motion). `lottery-{roomId}` broadcast 채널로 `CLOSE_LOTTERY` 이벤트 동기화.
- `TeamList` — 좌측 사이드바: 팀 로스터. `UnsoldPanel`도 named export.

## Zustand Store

파일: `src/features/auction/store/useAuctionStore.ts`

**Types**: `Role` (`'ORGANIZER' | 'LEADER' | 'VIEWER' | null`), `PlayerStatus`, `MessageRole`, `PresenceUser`, `Team`, `Player`, `Bid`, `Message`.

**Key actions**:

- `setRoomContext()` — Set roomId, role, teamId. `isRoomLoaded`는 리셋하지 않음 — 로딩 화면 깜빡임 없음.
- `setRealtimeData()` — Merge partial DB state → `isRoomLoaded: true`로 설정
- `updatePlayer()` / `updateTeam()` — Immutable update by id
- `addBid()` / `addMessage()` — Append with dedup check
- `setRoomNotFound()` — Mark room as deleted/inaccessible
- `setReadyAnimationPlayed()` — Track one-shot animation
- `setReAuctionRound()` — Track if re-auction is active

## Realtime Subscription Strategy

파일: `src/features/auction/hooks/useAuctionRealtime.ts`

| Event                   | Strategy                                                  |
| ----------------------- | --------------------------------------------------------- |
| `rooms` UPDATE          | Immediate store update                                    |
| `players` UPDATE        | Immediate store update                                    |
| `players` INSERT/DELETE | `fetchAll()` (full refresh)                               |
| `teams` UPDATE          | Immediate store update                                    |
| `teams` INSERT/DELETE   | `fetchAll()` (full refresh)                               |
| `bids` INSERT           | Immediate `addBid()` + `fetchAll()`                       |
| `messages` INSERT       | Immediate `addMessage()`                                  |
| Fallback                | 3-second `setInterval` polling (rooms/teams/players only) |

`fetchingRef` deduplication으로 동시 `fetchAll` 호출 방지. `fetchAll`은 5개 테이블 전체 fetch; polling은 rooms/teams/players만 처리합니다.
