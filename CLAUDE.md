# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build (runs type-check)
npm run lint     # ESLint
```

No test suite configured.

## Environment

Create `.env.local` with:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Architecture

**League of Legends internal match auction system** (League Auction 🍌). Korean UI. Minion-themed.

### Stack
- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (custom colors in `globals.css` via `@theme`)
- Zustand for global state (`src/store/useAuctionStore.ts`)
- Supabase for DB, realtime, and presence tracking

### Auth Model
No Supabase Auth. Token-based via URL query params:
- `?role=ORGANIZER&token={organizerToken}` — room creator
- `?role=LEADER&teamId={teamId}&token={leaderToken}` — team captain
- `?role=VIEWER&token={viewerToken}` — spectator

Token validation is enforced at the application level only (no DB-level RLS enforcement beyond open anon policies).

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

`useAuctionRealtime(roomId)` (`src/hooks/useAuctionRealtime.ts`) manages all subscriptions and is called once in `room/[id]/page.tsx`. It uses `useCallback` for `fetchAll` stability so it can be safely used in both subscriptions and a `setInterval`.

### Database Schema (5 tables)

All tables have open anon RLS policies. Must have `REPLICA IDENTITY FULL` set and be in the `supabase_realtime` publication for realtime filters to work (migration `00003`).

- **rooms**: id, name, total_teams, base_point, members_per_team, order_public, timer_ends_at, current_player_id, organizer_token, viewer_token
- **teams**: id, room_id, name, point_balance, leader_token, leader_name, leader_position, leader_description, captain_points
- **players**: id, room_id, name, tier, main_position, sub_position, status (`WAITING`/`IN_AUCTION`/`SOLD`/`UNSOLD`), team_id, sold_price, description
- **bids**: id, room_id, player_id, team_id, amount, created_at
- **messages**: id, room_id, sender_name, sender_role (`ORGANIZER`/`LEADER`/`VIEWER`/`SYSTEM`/`NOTICE`), content, created_at

Migrations must be run manually in Supabase SQL Editor (not via CLI).

### Auction Logic (`src/lib/auctionActions.ts`)

- `drawNextPlayer(roomId)`: picks random `WAITING` player → `IN_AUCTION`, sets `current_player_id` (no timer yet)
- `startAuction(roomId)`: sets `timer_ends_at = now + 16s`, sends system message
- `placeBid(roomId, playerId, teamId, amount)`: validates team's `point_balance` (10P units, min bid, team capacity, auction active), inserts bid, extends timer to 6s if <6s remaining
- `awardPlayer(roomId, playerId)`: **idempotent** — re-checks `player.status === 'IN_AUCTION'` before acting. Marks `SOLD`, deducts team points. If no bids, marks `UNSOLD` (not returned to WAITING).
- `draftPlayer(roomId, playerId, teamId)`: UNSOLD 선수 0P로 팀에 직접 영입 (자유계약). `sold_price: 0`.
- `restartAuctionWithUnsold(roomId)`: 모든 UNSOLD 선수를 WAITING으로 되돌려 재경매 준비.

Auto-award on timer expiry: organizer's client sets `setTimeout(delay + 800ms grace)` with a `useRef` lock (`awardLock`) to prevent double execution. `playersRef` avoids stale closures.

**Post-auction UNSOLD handling:**
- 소수 빈자리: ORGANIZER가 팀별로 `draftPlayer` 호출 (자유계약 영입)
- 다수 빈자리: `restartAuctionWithUnsold` → 재경매

### Key Components

- `CreateRoomModal` — 4-step modal: (0) basic info + previous rooms, (1) captain registration, (2) player registration, (3) links. Saves rooms to `localStorage` key `league_auction_rooms` (max 5).
- `AuctionBoard` — center panel. Shows captain connection grid (Presence-based) when idle, full auction UI when active. Contains `CenterTimer` (large countdown) and `NoticeBanner` (latest `NOTICE` message).
- `ChatPanel` — realtime chat. `SYSTEM` messages show as gray italic pills; `NOTICE` messages show as amber banners.
- `LinksModal` — ORGANIZER only; regenerates all invite links from store data.
- `HowToUseModal` — usage guide, available in header for all roles.
- `AuctionResultModal` — 경매 완료 후 최종 결과 테이블 모달.
- `LotteryOverlay` — 슬롯머신 추첨 애니메이션. `lottery-{roomId}` broadcast 채널로 CLOSE_LOTTERY 이벤트 동기화 (방장이 닫으면 전 클라이언트 동시 닫힘).
- `TeamList` — 좌측 사이드바: 팀 로스터 + UNSOLD 선수 목록 표시.
- **레거시 (미사용):** `CreateRoomButton.tsx`, `AuctionTimer.tsx`

### Custom Tailwind Colors

Defined in `src/app/globals.css` `@theme` block:
- `minion-yellow`: `#FBE042` / hover `#F2D214`
- `minion-blue`: `#2358A4` / hover `#194079`
- `minion-grey`: `#808080`
- `minion-skin`: `#FFC09A`
