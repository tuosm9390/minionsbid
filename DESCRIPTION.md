# Minions Bid

## Overview

Minions Bid is a League of Legends community operations tool that combines three workflows in one product:

1. Real-time player auction room creation and live bidding
2. League schedule creation and match-day result management
3. Hall of fame archiving for completed seasons and winning teams

The project is built as a Next.js App Router application and uses Firebase as its backend platform. The auction experience is optimized for low-latency synchronization between organizer, team leaders, and spectators, while the schedule and archive features extend the product from a one-off draft tool into a season management system.

The UI intentionally avoids generic dashboard styling. The product uses a retro arcade-inspired "Cyber-Pixel" visual system with thick borders, CRT overlays, pixel iconography, and animated modal-heavy interactions.

## Product Scope

### 1. Auction workflow

- Create a room with team count, members per team, and total points
- Register captains and players manually or via Excel upload
- Generate organizer, leader, and viewer access links
- Run a live auction with draw, timer, bidding, awarding, and re-auction support
- Persist completed room outcomes as `auction_archives`

### 2. League schedule workflow

- Create named schedules linked to a prior auction or league name
- Build match-day timelines by date
- Assign team-vs-team fixtures and kickoff times
- Record winners and notes for each match
- Complete the schedule by selecting a champion team

### 3. Hall of fame workflow

- View previously registered championship entries
- Register winners from archived auctions
- Auto-register winners when a linked league schedule is completed

## Architecture

### Application shell

- Framework: Next.js 16 App Router
- Rendering model: server-rendered route entry points with client-heavy feature shells
- State model: Zustand for client-side auction state, Firebase subscriptions for backend-driven updates

### Backend model

The codebase follows a server-authoritative model for all critical writes.

- Read and sync:
  - Firestore `onSnapshot` subscriptions stream room, team, player, bid, and message state into the client store
  - Firebase Realtime Database is used for presence and lightweight broadcast signals
- Mutate:
  - Next.js Server Actions call Firebase Admin SDK code
  - Validation and authority checks happen on the server before state changes are committed

This is not a "fat client" auction app. The client renders live state, but business-critical transitions such as room creation, bid placement, player awarding, match result registration, and archive persistence are controlled on the server.

## Core Data Flow

### Room creation

The room creation flow is driven by [`src/components/CreateRoomModal.tsx`](D:/development/league-auction/src/components/CreateRoomModal.tsx) and [`src/features/auction/hooks/useCreateRoom.ts`](D:/development/league-auction/src/features/auction/hooks/useCreateRoom.ts).

Key behavior:

- Multi-step modal collects base settings, captain data, and player pool data
- Excel upload is parsed in-browser using `xlsx`
- Existing active rooms are checked from local storage plus Firestore
- Schedule options are loaded so a room can be linked to a league timeline
- Final room creation is delegated to the server action in [`src/features/auction/api/roomActions.ts`](D:/development/league-auction/src/features/auction/api/roomActions.ts)

On creation, the server writes:

- a `rooms/{roomId}` document
- a `teams` subcollection with per-leader tokens
- a `players` subcollection initialized with `WAITING` status
- organizer/viewer tokens for later link-based authentication

### Link-based role authentication

The product does not expose a generic user account system. Instead, room access is granted with role-specific tokens.

[`src/app/api/room-auth/route.ts`](D:/development/league-auction/src/app/api/room-auth/route.ts):

- accepts `roomId`, `role`, `token`, and optional `teamId`
- validates organizer/viewer tokens against the room document
- validates leader tokens against the selected team document
- writes an `httpOnly` cookie scoped to `/room/{roomId}`
- redirects into the room page with normalized role context

This keeps room access simple for community operations while still enforcing server-side entry checks.

### Auction synchronization

The real-time auction screen is centered in [`src/app/room/[id]/RoomClient.tsx`](D:/development/league-auction/src/app/room/[id]/RoomClient.tsx).

Its live state comes from:

- [`src/features/auction/hooks/useAuctionRealtime.ts`](D:/development/league-auction/src/features/auction/hooks/useAuctionRealtime.ts)
- [`src/features/auction/hooks/usePresence.ts`](D:/development/league-auction/src/features/auction/hooks/usePresence.ts)
- [`src/features/auction/store/useAuctionStore.ts`](D:/development/league-auction/src/features/auction/store/useAuctionStore.ts)

The design pattern is:

- Firestore snapshots hydrate and continuously update the Zustand store
- RTDB presence tracks which leaders and organizers are currently connected
- RTDB signal paths are used for low-friction one-off events like closing the lottery animation
- UI derives actionable state such as:
  - all leaders connected
  - current player in auction
  - current highest bid
  - timer expiry
  - whether a team is already full

### Auction mutation pipeline

Critical auction logic lives in [`src/features/auction/api/auctionFlowActions.ts`](D:/development/league-auction/src/features/auction/api/auctionFlowActions.ts).

Important operations:

- `drawNextPlayer`: randomly promotes one `WAITING` player to `IN_AUCTION`
- `startAuction`: starts the timer with a server timestamp
- `pauseAuction` / `resumeAuction`: handles interruption from disconnected leaders
- `placeBid`: validates integer bids, 10-point increments, max cap, team balance, duplicate leadership, team capacity, and anti-sniping timer extensions
- `awardPlayer`: finalizes winner assignment inside a Firestore transaction
- `draftPlayer`: manually signs an unsold or waiting player at zero cost
- `restartAuctionWithUnsold`: converts all `UNSOLD` players back to `WAITING`

The important engineering choice here is consistency over optimistic illusion. Bid state is not trusted from the client alone; it is accepted, validated, persisted, and then reflected back to every participant through Firebase subscriptions.

### Archive persistence

When an auction is completed, [`saveAuctionArchive`](D:/development/league-auction/src/features/auction/api/roomActions.ts) writes a normalized snapshot into `auction_archives`.

The archive stores:

- room metadata
- linked schedule metadata
- final team snapshots
- per-player sold prices and positions

This archive then becomes an input source for league scheduling and hall-of-fame registration.

## League Schedule System

The league scheduling feature is implemented as a standalone domain rather than a thin add-on page.

Primary files:

- [`src/components/LeagueScheduleManager.tsx`](D:/development/league-auction/src/components/LeagueScheduleManager.tsx)
- [`src/features/schedules/api/scheduleActions.ts`](D:/development/league-auction/src/features/schedules/api/scheduleActions.ts)
- [`src/components/ScheduleCalendar.tsx`](D:/development/league-auction/src/components/ScheduleCalendar.tsx)
- [`src/components/ScheduleMatchDayEditor.tsx`](D:/development/league-auction/src/components/ScheduleMatchDayEditor.tsx)
- [`src/components/ScheduleRosterPanel.tsx`](D:/development/league-auction/src/components/ScheduleRosterPanel.tsx)

Core responsibilities:

- create schedule records in `league_schedules`
- manage `match_days` subcollections keyed by date
- transform archived room or auction roster data into reusable schedule roster teams
- compute "next matches" from incomplete fixtures
- validate and save match results
- complete a schedule and promote the champion into the hall of fame

One of the stronger pieces of this feature is roster recovery. The schedule layer can reconstruct teams from:

- currently stored `rooms`
- historical `auction_archives`
- existing hall-of-fame exclusions to prevent duplicate usage

That lets the scheduling workflow remain useful even after the original live auction room is gone.

## Hall of Fame System

The hall-of-fame feature is implemented in [`src/features/hall-of-fame/api/hallOfFameActions.ts`](D:/development/league-auction/src/features/hall-of-fame/api/hallOfFameActions.ts) and exposed through the App Router page at [`src/app/hall-of-fame/page.tsx`](D:/development/league-auction/src/app/hall-of-fame/page.tsx).

It supports:

- listing hall-of-fame entries
- listing available archives that are not already registered
- protected registration and deletion using an admin code
- automatic insertion when a league schedule is completed

This ties together the auction and schedule domains into a durable community record instead of leaving the application as an ephemeral live-event tool.

## Project Structure

```text
src/
  app/
    api/room-auth/            Token validation and cookie bootstrap
    hall-of-fame/             Hall of fame pages and client shell
    league-schedule/          League schedule route
    room/[id]/                Live auction room route
    page.tsx                  Home / launcher experience
  components/
    create-room/              Multi-step room creation flow
    ui/                       Shared presentational primitives
    LeagueScheduleManager.tsx Schedule management shell
  content/
    updateFeed.ts             Home ticker / update feed content
  features/
    auction/
      api/                    Server actions for room, chat, and auction flow
      components/             Auction-specific UI
      hooks/                  Firebase sync and room control hooks
      store/                  Zustand auction state
      utils/                  Room generation and display helpers
    hall-of-fame/
      api/                    Archive and winner registration logic
      components/             Hall of fame cards and modal UI
    schedules/
      api/                    Schedule CRUD and timeline logic
      types.ts                Shared schedule domain types
  lib/
    firebase.ts               Client Firebase bootstrap
    firebaseAdmin.ts          Admin SDK bootstrap and lazy Firestore proxy
```

## Tech Stack

### Frontend

- Next.js 16.1.6
- React 19.2.3
- TypeScript 5
- Tailwind CSS 4
- Framer Motion
- Lucide React
- Zustand

### Backend and data

- Firebase Firestore
- Firebase Realtime Database
- Firebase Admin SDK

### Tooling and testing

- ESLint 9
- Vitest
- Testing Library
- Playwright
- `xlsx` for spreadsheet import

## Key Implementation Decisions

### 1. Server actions over direct client writes

Critical mutations are intentionally centralized in server actions. This reduces trust in the browser, keeps domain rules in one place, and makes race-sensitive auction transitions safer.

### 2. Firestore plus RTDB instead of one database for everything

The project uses each Firebase product for a different job:

- Firestore for durable, queryable, structured domain state
- RTDB for connection presence and lightweight signal broadcasts

That split is pragmatic and visible in the code.

### 3. Tokenized room access instead of full user accounts

For a temporary event-driven product like a community draft room, link-based role entry is simpler than building full authentication flows. The implementation still preserves server validation and httpOnly cookies.

### 4. Archive-first extension of the product lifecycle

The system does not stop at "auction done." By normalizing completed room data into archives, the codebase enables downstream scheduling and season history features without requiring the original live room to stay active.

### 5. Feature-oriented organization

The repository is largely organized by domain:

- `auction`
- `schedules`
- `hall-of-fame`

That keeps server actions, hooks, components, and types close to the business workflow they belong to.

## Why This Project Is Technically Interesting

- It solves a genuinely stateful multi-user interaction problem rather than a static CRUD dashboard
- It uses role-based deep links and scoped cookies to simplify event access without losing server-side control
- It balances real-time UX with transactional safety in bidding and awarding logic
- It extends the live event into scheduling and long-term archival workflows
- It maintains a distinct visual identity instead of defaulting to commodity SaaS UI conventions

## Reference Files

For deeper technical context, these files are the most useful entry points:

- [`package.json`](D:/development/league-auction/package.json)
- [`README.md`](D:/development/league-auction/README.md)
- [`src/app/page.tsx`](D:/development/league-auction/src/app/page.tsx)
- [`src/app/room/[id]/RoomClient.tsx`](D:/development/league-auction/src/app/room/[id]/RoomClient.tsx)
- [`src/features/auction/api/auctionFlowActions.ts`](D:/development/league-auction/src/features/auction/api/auctionFlowActions.ts)
- [`src/features/auction/api/roomActions.ts`](D:/development/league-auction/src/features/auction/api/roomActions.ts)
- [`src/features/auction/hooks/useAuctionRealtime.ts`](D:/development/league-auction/src/features/auction/hooks/useAuctionRealtime.ts)
- [`src/features/auction/hooks/usePresence.ts`](D:/development/league-auction/src/features/auction/hooks/usePresence.ts)
- [`src/features/schedules/api/scheduleActions.ts`](D:/development/league-auction/src/features/schedules/api/scheduleActions.ts)
- [`src/features/hall-of-fame/api/hallOfFameActions.ts`](D:/development/league-auction/src/features/hall-of-fame/api/hallOfFameActions.ts)
