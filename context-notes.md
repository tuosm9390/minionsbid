# Context Notes

## 2026-05-07

- The user asked to update project-specific instructions so realtime auction data remains fixed to the current code state.
- The relevant project-wide file is `AGENTS.md`; auction-specific instructions also live in `src/features/auction/AGENTS.md`, so both should carry the freeze rule.
- "Fixed to current code state" is interpreted as freezing the existing realtime auction contract: Firestore room hot-state fields, RTDB signal paths, event envelope shape, revision ordering, and convergence semantics should not be changed incidentally.
- This is a documentation/instruction change, not a runtime code change. Verification should be a focused diff review rather than running the full app test suite.
- Refactoring analysis found no evidence that the realtime auction data shape should be changed now. Current tests and rules already anchor `auction_revision`, `last_auction_event`, `AuctionEventEnvelope`, and `signals/{roomId}` paths.
- The main global-AGENTS-driven candidates are production console/error reporting policy, auction E2E timeout stability, and one test `any` in the schedule transaction mock. These can be addressed without changing realtime auction data contracts.
- Follow-up constraint from the user: do not touch currently used functionality. Console cleanup is therefore limited to review/no-op unless a log is clearly dead or test-only. Error reporting and debug-gated logs stay intact.
- Production console review found no production `console.log`. Remaining `console.info` calls are debug-gated, and `console.error`/`console.warn` calls are error reporting, so no active user-flow code was changed.
- `npm run test:e2e:auction` failed all 13 tests before reaching fixture room UI. The common server error was `The default Firebase app does not exist`, which points to the E2E runner starting a stale `.next` build instead of rebuilding with fixture env.
- To keep runtime functionality untouched, the fix is limited to `scripts/run_auction_e2e.js`: always run `next build` with fixture env before `next start`.
- After forcing rebuild, `next build` failed because the runner also forced `NODE_ENV=development`. The script no longer overrides `NODE_ENV`; Next can set the correct production build environment while fixture flags remain enabled.
- After direct fixture bid routing, auction E2E improved to 11/13 passing. The remaining failures are fixture-only issues: concurrent fixture bid requests are not serialized, and chat message revision bumps can mask the latest auction event latency marker. The fix stays inside `e2eAuctionFixture.ts`.
- Final `npm run test:e2e:auction` passed all 13 Playwright auction realtime tests after the fixture-only fixes.
- New issue: the user reports player draw / auction start UI appears to progress only while the auction window is focused.
- Initial code evidence points to `LotteryAnimation`: it calls `onFinished` only after Framer Motion `controls.start()` resolves. Browsers can throttle or pause animation frames for background tabs/windows, so the logical "draw finished" state can wait until focus returns.
- Keep the fix surgical: do not change Firestore/RTDB contracts or auction actions. Make the UI completion callback advance by elapsed wall-clock time, while preserving the existing animation when the window is focused.
- Implemented the fix in `LotteryAnimation` only. A guarded wall-clock fallback now marks the draw complete after the same configured duration even if Framer Motion's animation promise is delayed by focus/background throttling.
- Added `__tests__/LotteryAnimation.test.tsx`, mocking a never-resolving animation promise to verify the completion callback still fires once.
- Verification command passed: `npx vitest run __tests__/LotteryAnimation.test.tsx __tests__/useAuctionBoard.test.tsx src/features/auction/hooks/useAuctionControl.test.ts`.
- New issue: the user reports that bids from some leaders briefly show a 5-second timer reset and then rebound to the pre-bid timer value. This points to disagreement between optimistic/RTDB state and Firestore canonical snapshot.
- Existing contract says bids only extend when remaining time is below 5 seconds. The user is explicitly asking to change the behavior so every accepted leader bid resets the auction timer to 5 seconds.
- Because this changes timer behavior, update code, Firestore rules, fixture, tests, and `doc/AUCTION_REALTIME_CONTRACT.md` together without changing the event envelope shape or Firestore/RTDB paths.
- Implemented reset-to-5 for every successful bid in `placeBidDirect`, Server Action `placeBid`, and E2E fixture `placeFixtureBid`.
- Updated Firestore rules so direct leader bids must write `timer_ends_at` near request time + 5s, instead of allowing unchanged timers.
- Updated `useAuctionRealtime` convergence so a newer Firestore revision can shorten the local timer. This is required because a valid bid reset can move a 10s start timer down to 5s.
- Verification passed: `npx vitest run __tests__/auctionActions.test.ts __tests__/useBiddingControl.test.tsx __tests__/useAuctionRealtime.test.tsx`, `npm run test:e2e:auction`, and `git diff --check`.
- E2E passed all 13 auction tests. Fixture mode still logs fire-and-forget `broadcastBidEvent` Firebase Admin warnings after completion, but the tested flows pass and converge.
- Follow-up correction: the desired bid timer policy is not every-bid reset. A successful bid should reset the timer to 5 seconds only when the remaining canonical timer is under 5 seconds. If at least 5 seconds remain, the canonical `timer_ends_at` should stay unchanged while `active_bid` and revision still advance.
- Keep the previous convergence fix that lets newer Firestore snapshots apply shorter timers, because threshold extension can still produce shorter values in stale local states.
- Verification passed after the correction: `npm run test -- __tests__/auctionActions.test.ts __tests__/useBiddingControl.test.tsx __tests__/useAuctionRealtime.test.tsx`. `git diff --check` reported only existing line-ending normalization warnings.
