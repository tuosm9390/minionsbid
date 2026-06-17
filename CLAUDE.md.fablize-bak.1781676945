# CLAUDE.md - Minions Bid

## Project Status
A high-stakes League of Legends player auction system built with **Next.js**, **Firebase Realtime Database**, and **Tailwind CSS**. Currently in the final polishing phase (Phase 6) of a major redesign.

## Project Vision: Cyber-Pixel
- **Visuals**: Lo-fi pixel art aesthetic mixed with high-tech "Cyber" elements.
- **Aesthetics**: Heavy borders (`border-4`), high-contrast colors (OKLCH), fluid responsive typography.
- **Experience**: Zero-latency bidding, meaningful interactive feedback (shimmer, shake, pulse).

## Core Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: Firebase Realtime Database (Realtime Sync)
- **Auth**: Team-based authentication (Organizer/Leader/Viewer)
- **Styling**: Tailwind CSS v4, Framer Motion
- **Testing**: Vitest, Playwright

## Recent Changes (2026-03-24)
- **Interactive UI**: Implemented `animate-shine` gold effect for leading bidders.
- **Visualization**: Added 3-tier point gauge bars to `TeamList`.
- **Optimization**: Optimized `latestNotice` retrieval using `findLast()` (O(1)).
- **Responsiveness**: Implemented mobile accordion for `TeamList` and fluid typography.
- **Type Safety**: Removed legacy `as any` type casts in `AuctionBoard.tsx`.

## Key Commands
- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm test`: Run unit tests (Vitest)
- `npx playwright test`: Run E2E tests
- `E2E_AUCTION_FIXTURE=1 npx playwright test playwright/auction-realtime.spec.ts`: E2E with in-memory fixture (no real Firebase required)

## Coding Principles
- **No `any`**: Strictly use TypeScript interfaces for all data models.
- **Framer Motion**: Use `AnimatePresence` for all scene transitions.
- **Fluid Design**: Prefer `text-fluid-*` tokens over fixed pixel sizes.
- **Server Actions**: All DB mutations must go through `src/features/auction/api/`.

## Realtime Auction Timing Constraints
- `AWARD_GRACE_MS` in `useAuctionControl.ts`: must stay ≤1500ms — the `active-auction-expiring` E2E fixture uses a 4s timer with a 5000ms assertion timeout
- `CenterTimer`: always clamp `initialDuration ≥ 1` and `progress` to 0–100% to handle RTDB timer rebound (delayed BID_PLACED arriving after client timer hits 0)
- Production validation = Playwright E2E (`playwright/auction-realtime.spec.ts`), not local unit tests

## Re-Auction Timer Architecture
- `next_auction_duration_ms` (Firestore room field): set to `RE_AUCTION_DURATION_MS=5000` by `restartAuctionWithUnsold`, persists for entire re-auction round — do NOT clear it in `startAuction` transaction
- Client reads `next_auction_duration_ms` → `nextAuctionDurationMs` in Zustand (via `useAuctionRealtime.ts` room snapshot)
- `handleStart` in `RoomClient.tsx` uses `nextAuctionDurationMs ?? AUCTION_DURATION_MS` for optimistic timer — do NOT use `isReAuctionRound` flag for duration (it resets after each PLAYER_AWARDED/UNSOLD event)
- `getNextReAuctionRoundState`: `AUCTION_STARTED` does NOT reset `isReAuctionRound` (only `PLAYER_AWARDED/UNSOLD` resets it)
