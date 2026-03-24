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

## Coding Principles
- **No `any`**: Strictly use TypeScript interfaces for all data models.
- **Framer Motion**: Use `AnimatePresence` for all scene transitions.
- **Fluid Design**: Prefer `text-fluid-*` tokens over fixed pixel sizes.
- **Server Actions**: All DB mutations must go through `src/features/auction/api/`.
