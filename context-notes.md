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
