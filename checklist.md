# Checklist

- [x] Confirm applicable AGENTS.md files for this repository.
- [x] Add project guidance that freezes the realtime auction data contract to the current code shape.
- [x] Add auction-feature guidance that blocks schema/path/ordering changes without an explicit migration plan.
- [x] Search for refactoring and correction candidates using the global AGENTS.md rules.
- [x] Verify documentation-only changes with a diff review.
- [x] Review production console usage without changing active user flows.
- [x] Re-run auction E2E after forcing a fixture-env rebuild.
- [x] Remove test-only `any` from the schedule transaction mock.
