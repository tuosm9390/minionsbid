# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build (runs type-check)
npm run lint     # ESLint
```

No test suite is configured (vitest and playwright are installed but unused).

## Environment

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

`src/lib/supabase.ts` falls back to placeholder strings (with `console.warn`) if env vars are missing — useful for local type-checking without a real Supabase project.

## Architecture

**League of Legends internal match auction system** (League Auction 🍌). Korean UI. Minion-themed.
배포 URL: `https://minionsbid.vercel.app` (프로젝트명: Minions Bid)

### Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (custom colors in `globals.css` via `@theme`)
- Zustand v5 for global state (`src/features/auction/store/useAuctionStore.ts`)
- Supabase for DB, realtime, and presence tracking
- Framer Motion for animations (lottery slot machine, etc.)
- Lucide React for icons
- xlsx@0.18.5 for Excel file import (player registration)

### Directory Structure

```
src/
  app/
    api/room-auth/route.ts   # Auth Route Handler (쿠키 설정)
    room/[id]/
      page.tsx               # Server Component (쿠키 읽기 전용)
      RoomClient.tsx         # Client Component (경매 전체 UI + 실시간 구독)
    layout.tsx               # OG/Twitter 메타데이터, Dynamic Rendering 강제
    page.tsx                 # Home page (hero + how-to-use + modals)
    globals.css              # Tailwind v4 @theme + global styles
    robots.ts                # SEO robots 설정
    sitemap.ts               # SEO 사이트맵
    favicon.ico
  features/auction/
    api/        auctionActions.ts
    components/ AuctionBoard, TeamList, ChatPanel, BiddingControl,
                LinksModal, HowToUseModal, EndRoomModal,
                AuctionResultModal, LotteryAnimation
    hooks/      useAuctionControl.ts, useAuctionRealtime.ts, useRoomAuth.ts
    store/      useAuctionStore.ts
  components/   공통 컴포넌트 (CreateRoomModal, AuctionArchiveSection, ArchiveModalWrapper)
  middleware.ts # 동적 CSP Nonce 생성 + 보안 헤더
  lib/
    supabase.ts
    utils.ts    # cn() utility (clsx + tailwind-merge)
supabase/
  migrations/
    00001_init.sql                      # Initial DB schema
    00002_add_room_creation_fields.sql  # members_per_team, leader info, player description
    00003_realtime_fix.sql              # REPLICA IDENTITY FULL + publication
```

### Auth Model

No Supabase Auth. **HttpOnly 쿠키 기반** 인증:

1. 공유 링크 형식: `/api/room-auth?roomId={id}&role=ORGANIZER&token={token}`
   - LEADER: `&teamId={teamId}` 추가
   - VIEWER: `role=VIEWER`
2. `/api/room-auth` Route Handler가 쿠키 `room_auth_{roomId}` (HttpOnly) 설정 후 `/room/{roomId}`로 리다이렉트
3. `page.tsx` (Server Component): `cookies()`로 쿠키 파싱 → `RoomClient`에 `role`, `teamId`, `token` props 전달
4. `useRoomAuth` 훅 (`src/features/auction/hooks/useRoomAuth.ts`): DB 데이터 로드 후 token을 DB 값과 비교, 불일치 시 `effectiveRole = null`로 강등. `useRef` lock으로 1회 실행 보장.
5. Guard UI: `effectiveRole === null`이면 차단 화면 표시

쿠키 속성: `httpOnly: true`, `secure: true` (production), `sameSite: 'lax'`, `path: '/'`.
Token validation은 클라이언트 사이드 (open anon RLS, 내부 툴 의도).

### Data Flow

```
Supabase DB
  ↕ postgres_changes subscriptions (via useAuctionRealtime)
  ↕ 3-second polling fallback
  ↕ Presence tracking (supabase.channel `presence:{roomId}`)
  ↕ Broadcast channel `lottery-{roomId}` (CLOSE_LOTTERY event sync)
Zustand store (useAuctionStore)
  → React components
```

`useAuctionRealtime(roomId)` (`src/features/auction/hooks/useAuctionRealtime.ts`) manages all subscriptions and is called once in `room/[id]/RoomClient.tsx`. It uses `useCallback` for `fetchAll` stability so it can be safely used in both subscriptions and a `setInterval`.

### Database Schema (6 tables)

All tables have open anon RLS policies. Must have `REPLICA IDENTITY FULL` set and be in the `supabase_realtime` publication for realtime filters to work (migration `00003`).

Migrations must be run manually in Supabase SQL Editor (not via CLI).

- **rooms**: id, name, total_teams, base_point, members_per_team, timer_ends_at, current_player_id, organizer_token, viewer_token
  - Note: `order_public` column was removed (feature deleted in latest commits)
- **teams**: id, room_id, name, point_balance, leader_token, leader_name, leader_position, leader_description, captain_points
- **players**: id, room_id, name, tier, main_position, sub_position, status (`WAITING`/`IN_AUCTION`/`SOLD`/`UNSOLD`), team_id, sold_price, description
- **bids**: id, room_id, player_id, team_id, amount, created_at
- **messages**: id, room_id, sender_name, sender_role (`ORGANIZER`/`LEADER`/`VIEWER`/`SYSTEM`/`NOTICE`), content, created_at
- **auction_archives**: id, room_id, room_name, room_created_at, closed_at, result_snapshot (JSONB). Stores permanent post-auction results.

### Auction Logic (`src/features/auction/api/auctionActions.ts`)

Timer constants: `AUCTION_DURATION_MS = 10_000`, `EXTEND_THRESHOLD_MS = 5_000`, `EXTEND_DURATION_MS = 5_000`.

| Function | Purpose |
|---|---|
| `drawNextPlayer(roomId)` | Picks random `WAITING` player → `IN_AUCTION`, sets `current_player_id` (no timer yet) |
| `startAuction(roomId, durationMs?)` | Sets `timer_ends_at = now + 10s` (or custom), sends system message |
| `pauseAuction(roomId)` | Sets `timer_ends_at = null` (on team leader disconnect), sends warning system message |
| `resumeAuction(roomId)` | Sets `timer_ends_at = now + 5s` (on reconnect), sends resume message |
| `placeBid(roomId, playerId, teamId, amount)` | Validates 10P units, point balance, team capacity, timer active (1s tolerance for network lag), not already top bidder; inserts bid; extends timer to 5s if <5s remaining |
| `awardPlayer(roomId, playerId)` | **Idempotent** — re-checks timer not extended (race condition guard), re-checks `status === 'IN_AUCTION'`. Marks `SOLD` (deducts points) or `UNSOLD` (no bids). Calls `clearRoomAuction()`. |
| `draftPlayer(roomId, playerId, teamId)` | Assigns `UNSOLD` or `WAITING` player to team at 0P (free contract). Validates room membership and team capacity. |
| `restartAuctionWithUnsold(roomId)` | Converts all `UNSOLD` → `WAITING` for re-auction |
| `deleteRoom(roomId)` | Invalidates tokens first, then deletes bids → messages → players → teams → room sequentially |
| `saveAuctionArchive(payload)` | Saves final results snapshot to `auction_archives` table |

**Auto-award on timer expiry**: Organizer's client sets `setTimeout(delay + 1500ms grace)` with a `useRef` lock (`awardLock`) to prevent double execution. `playersRef` avoids stale closures.

**Post-auction UNSOLD handling:**
- 소수 빈자리: ORGANIZER가 팀별로 `draftPlayer` 호출 (자유계약 영입). WAITING 선수도 가능.
- 다수 빈자리: `restartAuctionWithUnsold` → 재경매

### Key Components

- `RoomClient` (`room/[id]/RoomClient.tsx`) — Client Component. 경매 UI 전체 + `useAuctionRealtime` 호출. `page.tsx`에서 분리된 클라이언트 로직.
- `CreateRoomModal` (`src/components/`) — 4-step modal: (0) basic info + previous rooms, (1) captain registration, (2) player registration (with Excel import), (3) links. Saves rooms to `localStorage` key `league_auction_rooms` (max 5). Includes sample data template button.
- `AuctionArchiveSection` (`src/components/`) — Displays past auction results from `auction_archives` table with filtering.
- `AuctionBoard` — Center panel. Shows captain connection grid (Presence-based) when idle, full auction UI when active. Contains `CenterTimer` (large countdown) and `NoticeBanner` (latest `NOTICE` message).
- `ChatPanel` — Realtime chat. `SYSTEM` messages show as gray italic pills; `NOTICE` messages show as amber banners.
- `BiddingControl` — Bid form with amount input and validation, shown to LEADER role.
- `LinksModal` — ORGANIZER only; regenerates all invite links from store data.
- `HowToUseModal` — Usage guide, available in header for all roles.
- `EndRoomModal` — Room deletion confirmation with `saveAuctionArchive` + `deleteRoom` flow.
- `AuctionResultModal` — 경매 완료 후 최종 결과 테이블 모달.
- `LotteryAnimation` — 슬롯머신 추첨 애니메이션 (Framer Motion). `lottery-{roomId}` broadcast 채널로 `CLOSE_LOTTERY` 이벤트 동기화 (방장이 닫으면 전 클라이언트 동시 닫힘).
- `TeamList` — 좌측 사이드바: 팀 로스터 + UNSOLD 선수 목록 + draftPlayer UI 표시.

### Security (CSP / Middleware)

`src/middleware.ts`에서 요청마다 동적 Nonce 생성:

```
crypto.randomUUID() → base64 → nonce
CSP 헤더: script-src 'self' 'nonce-{nonce}' 'strict-dynamic' 'unsafe-inline'
         (dev 모드에서는 'unsafe-eval' 추가)
connect-src: Supabase https/wss endpoints
frame-ancestors: 'none'
object-src: 'none'
base-uri: 'none'
```

Middleware matcher: Excludes `/api/*`, `_next/static`, `_next/image`, `favicon.ico`.

- `layout.tsx`에서 `headers()`를 호출해 Dynamic Rendering 강제 (정적 캐시 방지 → CSP nonce 불일치 에러 방지)
- `next.config.ts`에서 CSP 제거 — 미들웨어가 전담
- `next.config.ts`에 유지되는 헤더: `X-XSS-Protection: 0`, HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
- **xlsx@0.18.5 known vulns**: Prototype Pollution (CVSS 7.8) + ReDoS (CVSS 7.5). No npm fix available. Low risk: client-side only, organizer uploads own files.

### SEO / 메타데이터

- `src/app/layout.tsx`: Open Graph / Twitter Cards 메타데이터, locale `ko_KR`, `themeColor: #FDE047`
- `src/app/robots.ts`: robots.txt 설정
- `src/app/sitemap.ts`: 사이트맵 자동 생성
- `public/thumbnail.png`: OG 이미지 1200×630 (소셜 공유 썸네일)
- `public/favicon.png` / `public/favicon.ico`

### 모바일 반응형

`RoomClient.tsx` Mobile-first 레이아웃:
- 기본(모바일): `flex-col` — 경매보드 → 채팅 → 팀리스트 순서
- `xl` 이상(데스크탑): 3단 그리드 (팀리스트 | 경매보드 | 채팅)

### Custom Tailwind Colors

Defined in `src/app/globals.css` `@theme` block:

- `minion-yellow`: `#FBE042` / hover `#F2D214`
- `minion-blue`: `#2358A4` / hover `#194079`
- `minion-grey`: `#808080`
- `minion-skin`: `#FFC09A`

### Zustand Store (`src/features/auction/store/useAuctionStore.ts`)

**Types**: `Role` (`'ORGANIZER' | 'LEADER' | 'VIEWER' | null`), `PlayerStatus`, `MessageRole`, `PresenceUser`, `Team`, `Player`, `Bid`, `Message`.

**Key actions**:
- `setRoomContext()` — Set roomId, role, teamId
- `setRealtimeData()` — Merge partial DB state
- `updatePlayer()` / `updateTeam()` — Immutable update by id
- `addBid()` / `addMessage()` — Append with dedup check
- `setRoomNotFound()` — Mark room as deleted/inaccessible
- `setReadyAnimationPlayed()` — Track one-shot animation
- `setReAuctionRound()` — Track if re-auction is active

### Realtime Subscription Strategy (`useAuctionRealtime.ts`)

| Event | Strategy |
|---|---|
| `rooms` UPDATE | Immediate store update |
| `players` UPDATE | Immediate store update |
| `players` INSERT/DELETE | `fetchAll()` (full refresh) |
| `teams` UPDATE | Immediate store update |
| `teams` INSERT/DELETE | `fetchAll()` (full refresh) |
| `bids` INSERT | Immediate `addBid()` + `fetchAll()` |
| `messages` INSERT | Immediate `addMessage()` |
| Fallback | 3-second `setInterval` polling (rooms/teams/players only) |

### Key Conventions

- All Supabase mutations are done in `auctionActions.ts`, never inline in components.
- Components are role-gated: check `effectiveRole` from `useRoomAuth` before rendering controls.
- Never call `awardPlayer` more than once per auction cycle — use `awardLock` ref.
- Timer extension logic lives in both `placeBid` (server-side extend) and `useAuctionControl` (client-side setTimeout).
- Path alias `@/*` maps to `src/*`.
