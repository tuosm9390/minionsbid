Date: 2026-03-24
Author: Antigravity

# Task Plan — Cyber-Pixel Redesign Completion

## 1. Goal
Complete the remaining tasks from the Cyber-Pixel Redesign Plan to ensure a polished, responsive, and consistent user experience.

## 2. Success Criteria
- [ ] BiddingControl: Gold shine animation on leading state, button height >= 48px.
- [ ] ChatPanel: System and User messages visually separated (Game log style).
- [ ] Typography: No `text-[Npx]` hardcoded values in specified files.
- [ ] Mobile: TeamList uses accordion pattern on small screens.
- [ ] Mobile: ChatPanel has fixed maximum height (240px) on small screens.

## 3. Phases

### Phase 1: Research & Discovery
- [x] Analyze current implementation of BiddingControl, ChatPanel, and TeamList.
- [x] Identify remaining typography violations.
- [x] Verify mobile layout current state.

### Phase 2: Core Interaction Enhancements
- [ ] Implement Gold Shine animation in `BiddingControl.tsx`.
- [ ] Ensure button touch targets meet accessibility standards (44px/48px).
- [ ] Update `BidStatus.tsx` if any remaining issues found.

### Phase 3: Chat & Communication UI
- [ ] Redesign `ChatPanel.tsx` MessageItem for SYSTEM and USER roles.
- [ ] Add `▶ [SYSTEM]` badge and tinted background for system messages.
- [ ] Optimize ChatPanel for mobile (max-height).

### Phase 4: Mobile Responsiveness & Layout
- [ ] Implement Accordion pattern for `TeamList` in mobile view.
- [ ] Refactor `RoomClient.tsx` main layout for better mobile priority.

### Phase 5: Typography Cleanup
- [ ] Replace all `text-[Npx]` with `text-fluid-*` in:
  - `BidStatus.tsx`
  - `BiddingControl.tsx`
  - `TeamList.tsx`
  - `RoomClient.tsx`
  - `NoticeBanner.tsx`
  - `ChatPanel.tsx`

### Phase 6: Final Validation & Polish
- [ ] Visual audit of all components.
- [ ] Verify accessibility (ARIA labels, touch targets).
- [ ] Test on mobile breakpoints (375px).

## 4. Progress Tracking
| Phase | Status | Notes |
|-------|--------|-------|
| 1 | complete | Files analyzed, tasks identified. |
| 2 | complete | Gold shine and interaction enhancements implemented. |
| 3 | complete | Chat message visual separation implemented. |
| 4 | complete | Mobile accordion and layout priority optimized. |
| 5 | complete | All typography violations fixed. |
| 6 | complete | Final validation and performance optimizations done. |
