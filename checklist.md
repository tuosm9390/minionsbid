# Checklist

- [x] Confirm applicable AGENTS.md files for this repository.
- [x] Add project guidance that freezes the realtime auction data contract to the current code shape.
- [x] Add auction-feature guidance that blocks schema/path/ordering changes without an explicit migration plan.
- [x] Search for refactoring and correction candidates using the global AGENTS.md rules.
- [x] Verify documentation-only changes with a diff review.
- [x] Review production console usage without changing active user flows.
- [x] Re-run auction E2E after forcing a fixture-env rebuild.
- [x] Remove test-only `any` from the schedule transaction mock.
- [x] Confirm why lottery/start UI waits for focused window state.
- [x] Decouple lottery completion state from animation-frame completion.
- [x] Add focused test coverage for timer-based lottery completion.
- [x] Run the smallest relevant auction tests.
- [x] Update bid timer contract so every accepted bid resets the timer to 5 seconds.
- [x] Align direct bid, server-action fallback, fixture, and Firestore rules with the reset-to-5 behavior.
- [x] Add focused tests for every-bid timer reset and stale snapshot convergence.
- [x] Run relevant Vitest checks and auction E2E if feasible.
