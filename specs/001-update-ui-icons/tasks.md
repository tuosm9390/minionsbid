---
description: "Task list for Cyber-Pixel Icon System implementation"
---

# Tasks: Modern Cyber-Pixel Icon System

**Input**: Design documents from `/specs/001-update-ui-icons/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/PixelIcon.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 [P] Verify `lucide-react` and `framer-motion` installation in `package.json`
- [x] T002 Create directory `src/components/ui/` for shared components

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core `PixelIcon` component and styling that MUST be complete before ANY user story implementation

- [x] T003 Create `PixelIcon` component structure in `src/components/ui/PixelIcon.tsx`
- [x] T004 Define `IconAnimation` types and `framer-motion` variants in `src/components/ui/PixelIcon.tsx`
- [x] T005 Implement `PixelIcon` rendering logic with `shape-rendering: crispEdges`, `strokeWidth`, and **fallback text logic** in `src/components/ui/PixelIcon.tsx`
- [x] T006 [P] Add `animate-shine` keyframes and `shine` utility classes to `src/app/globals.css`

**Checkpoint**: Foundation ready - `PixelIcon` can now be used across the project

---

## Phase 3: User Story 1 - Unified Icon System (Priority: P1) 🎯 MVP

**Goal**: Replace all inconsistent emojis and default vector icons with the new Pixel Icon system

**Independent Test**: Verify that `AuctionWaitingState` no longer displays standard emojis and uses themed pixel icons instead.

### Tests for User Story 1 (TDD) ⚠️
- [x] T007 [P] [US1] Create unit tests for `PixelIcon` component rendering and emoji mapping in `src/components/ui/PixelIcon.test.tsx` (Ensure they FAIL)

### Implementation for User Story 1
- [x] T008 [P] [US1] Create central icon mapping for emojis in `src/features/auction/constants/icons.ts`
- [x] T009 [US1] Replace hardcoded emojis (✅, 💤, ⏳) with `PixelIcon` in `src/features/auction/components/board/AuctionWaitingState.tsx`
- [x] T010 [P] [US1] Replace existing Lucide icons with `PixelIcon` wrapper in `src/app/room/[id]/components/RoomHeader.tsx`
- [x] T011 [P] [US1] Replace chat and system icons in `src/features/auction/components/ChatPanel.tsx`

**Checkpoint**: User Story 1 complete - Visual consistency achieved.

---

## Phase 4: User Story 2 - Dynamic Visual Feedback (Priority: P2)

**Goal**: Add interactive animations to icons to enhance the auction experience

### Tests for User Story 2 (TDD) ⚠️
- [x] T012 [P] [US2] Create animation state transition tests for `PixelIcon` in `src/components/ui/PixelIcon.test.tsx` (Ensure they FAIL)

### Implementation for User Story 2
- [x] T013 [US2] Implement `urgent` (shake) animation logic for the timer icon in `src/features/auction/components/board/CenterTimer.tsx`
- [x] T014 [US2] Implement `success` (shine/scale) animation for the crown icon in `src/features/auction/components/BiddingControl.tsx`
- [x] T015 [US2] Add `active` (pulse) animation for real-time status updates in `src/features/auction/components/board/BidStatus.tsx`

**Checkpoint**: User Story 2 complete - Crucial auction states now have dynamic visual feedback.

---

## Phase 5: User Story 3 - Responsive & Accessible Icons (Priority: P3)

**Goal**: Ensure the new icon system works for all users across all devices

### Tests for User Story 3 (TDD) ⚠️
- [x] T016 [P] [US3] Create accessibility tests (ARIA, Role) for `PixelIcon` in `src/components/ui/PixelIcon.test.tsx` (Ensure they FAIL)

### Implementation for User Story 3
- [x] T017 [US3] Implement minimum 44px touch target wrapper for all interactive icon buttons in `src/components/ui/PixelIcon.tsx`
- [x] T018 [P] [US3] Add `aria-label` and correct `role="img"` to all `PixelIcon` instances in `src/features/auction/components/`
- [x] T019 [P] [US3] Apply `aria-hidden="true"` to decorative icons across the feature components

**Checkpoint**: User Story 3 complete - The icon system is now fully accessible and mobile-friendly.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final quality pass and cleanup

- [x] T020 Final visual regression check across all screen sizes (including < 320px ultra-low res) and browsers
- [x] T021 **Run Lighthouse accessibility audit** and verify SC-003 (Score > 95)
- [x] T022 [P] Cleanup unused emoji strings and legacy icon imports in `src/features/auction/`
- [x] T023 Update `doc/COMPONENTS.md` with the new `PixelIcon` component documentation
- [x] T024 [P] Run `quickstart.md` examples to ensure documentation is accurate
- [x] T025 **Verify SC-004**: Conduct a qualitative design review or user survey to ensure 90%+ positive feedback on "Cyber-Pixel" theme integration

---

## Dependencies & Execution Order

### Phase Dependencies

1. **Setup & Foundational (Phases 1-2)**: MUST be completed first.
2. **User Story 1 (P1)**: High priority, defines the base look.
3. **User Story 2 & 3 (P2-P3)**: Can proceed once US1 is stable.

### Implementation Strategy

- **TDD Enforcement**: Every phase starts with test writing. Implementation is not complete until tests pass.
- Deliver US1 to establish the new visual baseline.
- Add US2 to bring "life" to the auction interactions.
- Finalize with US3 for production-ready accessibility.
