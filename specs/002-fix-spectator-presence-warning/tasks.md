# Tasks: Fix Spectator Presence Warning

**Feature Branch**: `002-fix-spectator-presence-warning`
**Implementation Plan**: [plan.md](plan.md)

## Phase 1: Setup

- [x] T001 Initialize feature branch and verify environment constraints in `CLAUDE.md`

## Phase 2: Foundational

- [x] T002 Add `isPresenceLoaded` and `isLocalConnected` fields to `AuctionState` in `src/features/auction/store/useAuctionStore.ts`
- [x] T003 Add `setPresenceLoaded` and `setLocalConnected` actions to `useAuctionStore` in `src/features/auction/store/useAuctionStore.ts`

## Phase 3: [US1] Fix Spectator Presence & UI

**Goal**: Spectators see real-time captain presence without false warnings, including loading and local disconnection states.
**Independent Test**: Open a spectator link in a private window. Verify no warning if all captains are in. Verify loading state on entry. Verify "연결 확인 중..." when toggling offline mode.

- [x] T004 [P] [US1] Create unit tests for presence subscription and connection logic in `src/features/auction/hooks/usePresence.test.ts`
- [x] T005 [P] [US1] Modify `useFirebasePresence` to skip `set()` for `VIEWER` but enable `onValue()` subscription for all roles in `src/features/auction/hooks/usePresence.ts`
- [x] T006 [P] [US1] Implement real-time local connection monitoring using Firebase `.info/connected` in `src/features/auction/hooks/usePresence.ts`
- [x] T007 [US1] Update `isPresenceLoaded` state in the `onValue()` callback within `src/features/auction/hooks/usePresence.ts`
- [x] T008 [US1] Update `AuctionBoard` to show neutral loading UI when `isPresenceLoaded` is false in `src/features/auction/components/AuctionBoard.tsx`
- [x] T009 [US1] Implement dedicated "연결 확인 중..." overlay for local disconnection (`isLocalConnected === false`) in `src/features/auction/components/AuctionBoard.tsx`
- [x] T010 [US1] Refine `allConnected` logic in `src/app/room/[id]/RoomClient.tsx` to ensure it only triggers warnings when data is fully loaded and connections are actually missing

## Phase 4: Polish & Monitoring

- [x] T011 [US1] Add session count monitoring warning for `ORGANIZER` role in `src/app/room/[id]/components/OrganizerControlPanel.tsx` (FR-007)
- [x] T012 Perform final manual verification of all acceptance scenarios documented in `spec.md`

## Dependencies

1. Phase 2 (Store) MUST be completed before Phase 3 logic.
2. Phase 3 tasks T005-T007 are prerequisites for T008-T010.

## Parallel Execution

- T004, T005, and T006 can be implemented simultaneously as they involve separate test files or independent logic within the hook.

## Implementation Strategy

1. **Store Update**: Enable tracking of presence loading and local connection status.
2. **Test First**: Define expected behaviors for presence subscription and connection monitoring.
3. **Hook Correction**: Allow spectators to read presence data and detect their own connection state.
4. **UI State Mapping**: Update `AuctionBoard` to differentiate between "Loading", "Local Offline", and "Leader Missing".
5. **Validation**: Use private windows to simulate multiple roles and network conditions.
