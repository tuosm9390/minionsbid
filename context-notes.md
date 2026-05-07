# Context Notes

## 2026-05-07

- The user asked to update project-specific instructions so realtime auction data remains fixed to the current code state.
- The relevant project-wide file is `AGENTS.md`; auction-specific instructions also live in `src/features/auction/AGENTS.md`, so both should carry the freeze rule.
- "Fixed to current code state" is interpreted as freezing the existing realtime auction contract: Firestore room hot-state fields, RTDB signal paths, event envelope shape, revision ordering, and convergence semantics should not be changed incidentally.
- This is a documentation/instruction change, not a runtime code change. Verification should be a focused diff review rather than running the full app test suite.
- Refactoring analysis found no evidence that the realtime auction data shape should be changed now. Current tests and rules already anchor `auction_revision`, `last_auction_event`, `AuctionEventEnvelope`, and `signals/{roomId}` paths.
- The main global-AGENTS-driven candidates are production console/error reporting policy, auction E2E timeout stability, and one test `any` in the schedule transaction mock. These can be addressed without changing realtime auction data contracts.
