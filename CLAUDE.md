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
배포 URL: `https://minionsbid.vercel.app` (프로젝트명: Minions Bid)

### Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (custom colors in `globals.css` via `@theme`)
- Zustand for global state (`src/features/auction/store/useAuctionStore.ts`)
- Supabase for DB, realtime, and presence tracking

### Directory Structure

```
src/
  app/
    api/room-auth/route.ts   # Auth Route Handler (쿠키 설정)
    room/[id]/
      page.tsx               # Server Component (쿠키 읽기 전용)
      RoomClient.tsx         # Client Component (경매 전체 UI + 실시간 구독)
    layout.tsx               # OG/Twitter 메타데이터, Dynamic Rendering 강제
    robots.ts                # SEO robots 설정
    sitemap.ts               # SEO 사이트맵
  features/auction/
    api/        auctionActions.ts
    components/ AuctionBoard, ChatPanel, TeamList, LinksModal, HowToUseModal, ...
    hooks/      useAuctionControl.ts, useAuctionRealtime.ts, useRoomAuth.ts
    store/      useAuctionStore.ts
  components/   공통 컴포넌트 (CreateRoomModal, AuctionArchiveSection, ...)
  middleware.ts # 동적 CSP Nonce 생성 + 보안 헤더
  lib/
    supabase.ts
    utils.ts
```

### Auth Model

No Supabase Auth. **HttpOnly 쿠키 기반** 인증:

1. 공유 링크 형식: `/api/room-auth?roomId={id}&role=ORGANIZER&token={token}`
   - LEADER: `&teamId={teamId}` 추가
   - VIEWER: role=VIEWER
2. `/api/room-auth` Route Handler가 쿠키 `room_auth_{roomId}` (HttpOnly) 설정 후 `/room/{roomId}`로 리다이렉트
3. `page.tsx` (Server Component): `cookies()`로 쿠키 파싱 → `RoomClient`에 `role`, `teamId`, `token` props 전달
4. `useRoomAuth` 훅 (`src/features/auction/hooks/useRoomAuth.ts`): DB 데이터 로드 후 token을 DB 값과 비교, 불일치 시 `effectiveRole = null`로 강등
5. Guard UI: `effectiveRole === null`이면 차단 화면 표시

쿠키 속성: `httpOnly: true`, `secure: true` (production), `sameSite: 'lax'`, `path: '/'`.
Token validation은 클라이언트 사이드(open anon RLS, 내부 툴 의도).

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

### Database Schema (5 tables)

All tables have open anon RLS policies. Must have `REPLICA IDENTITY FULL` set and be in the `supabase_realtime` publication for realtime filters to work (migration `00003`).

- **rooms**: id, name, total_teams, base_point, members_per_team, order_public, timer_ends_at, current_player_id, organizer_token, viewer_token
- **teams**: id, room_id, name, point_balance, leader_token, leader_name, leader_position, leader_description, captain_points
- **players**: id, room_id, name, tier, main_position, sub_position, status (`WAITING`/`IN_AUCTION`/`SOLD`/`UNSOLD`), team_id, sold_price, description
- **bids**: id, room_id, player_id, team_id, amount, created_at
- **messages**: id, room_id, sender_name, sender_role (`ORGANIZER`/`LEADER`/`VIEWER`/`SYSTEM`/`NOTICE`), content, created_at

Migrations must be run manually in Supabase SQL Editor (not via CLI).

### Auction Logic (`src/features/auction/api/auctionActions.ts`)

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

- `RoomClient` (`room/[id]/RoomClient.tsx`) — Client Component. 경매 UI 전체 + `useAuctionRealtime` 호출. `page.tsx`에서 분리된 클라이언트 로직.
- `CreateRoomModal` — 4-step modal: (0) basic info + previous rooms, (1) captain registration, (2) player registration, (3) links. Saves rooms to `localStorage` key `league_auction_rooms` (max 5).
- `AuctionBoard` — center panel. Shows captain connection grid (Presence-based) when idle, full auction UI when active. Contains `CenterTimer` (large countdown) and `NoticeBanner` (latest `NOTICE` message).
- `ChatPanel` — realtime chat. `SYSTEM` messages show as gray italic pills; `NOTICE` messages show as amber banners.
- `LinksModal` — ORGANIZER only; regenerates all invite links from store data.
- `HowToUseModal` — usage guide, available in header for all roles.
- `AuctionResultModal` — 경매 완료 후 최종 결과 테이블 모달.
- `LotteryAnimation` — 슬롯머신 추첨 애니메이션. `lottery-{roomId}` broadcast 채널로 CLOSE_LOTTERY 이벤트 동기화 (방장이 닫으면 전 클라이언트 동시 닫힘).
- `TeamList` — 좌측 사이드바: 팀 로스터 + UNSOLD 선수 목록 표시.

### Security (CSP / Middleware)

`src/middleware.ts`에서 요청마다 동적 Nonce 생성:

```
crypto.randomUUID() → base64 → nonce
CSP 헤더: script-src 'self' 'nonce-{nonce}' 'strict-dynamic'
x-nonce 요청 헤더로 nonce 전달
```

- `layout.tsx`에서 `headers()`를 호출해 Dynamic Rendering 강제 (정적 캐시 방지)
- `next.config.ts`에서 CSP 제거 — 미들웨어가 전담
- `next.config.ts`에 유지되는 헤더: X-XSS-Protection=0, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **xlsx@0.18.5 known vulns**: Prototype Pollution (CVSS 7.8) + ReDoS (CVSS 7.5). No npm fix available. Low risk: client-side only, organizer uploads own files.

### SEO / 메타데이터

- `src/app/layout.tsx`: Open Graph / Twitter Cards 메타데이터
- `src/app/robots.ts`: robots.txt 설정
- `src/app/sitemap.ts`: 사이트맵 자동 생성
- `public/thumbnail.png`: OG 이미지 (소셜 공유 썸네일)
- `public/favicon.png` / `public/favicon.ico`

### 모바일 반응형

`RoomClient.tsx` Mobile-first 레이아웃:
- 기본(모바일): flex-col — 경매보드 → 채팅 → 팀리스트 순서
- `xl` 이상(데스크탑): 3단 그리드 (팀리스트 | 경매보드 | 채팅)

### Custom Tailwind Colors

Defined in `src/app/globals.css` `@theme` block:

- `minion-yellow`: `#FBE042` / hover `#F2D214`
- `minion-blue`: `#2358A4` / hover `#194079`
- `minion-grey`: `#808080`
- `minion-skin`: `#FFC09A`
