<!--
Sync Impact Report
- Version change: none → 1.0.0
- List of modified principles:
  - Principle 1: [PRINCIPLE_1_NAME] → Cyber-Pixel Identity
  - Principle 2: [PRINCIPLE_2_NAME] → Real-time State Integrity
  - Principle 3: [PRINCIPLE_3_NAME] → Test-First (TDD) Mandatory
  - Principle 4: [PRINCIPLE_4_NAME] → Mobile-First & Touch-Ready
  - Principle 5: [PRINCIPLE_5_NAME] → Zero Trust Security & Hygiene
- Added sections: Technical Constraints, Development Workflow
- Removed sections: none
- Templates requiring updates:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
- Follow-up TODOs: none
-->

# Minions Bid Constitution

## Core Principles

### I. Cyber-Pixel Identity
The project MUST strictly adhere to the Cyber-Pixel design system defined in `DESIGN.md`. This includes using OKLCH tokens for all colors, fluid typography for all text sizes, and maintaining 4px solid black borders. Hardcoding pixel sizes (e.g., `text-[10px]`) is strictly PROHIBITED; use fluid tokens (e.g., `text-fluid-xs`). All UI elements MUST have straight edges (`--radius: 0rem`) to preserve the 8-bit aesthetic.

### II. Real-time State Integrity
Firebase Realtime Database (RTDB) is the authoritative single source of truth for all auction-related states. Implementation MUST prioritize low-latency updates (<200ms) and guarantee eventual consistency across all connected clients. No local state should override the server-broadcasted state.

### III. Test-First (TDD) Mandatory
Test-Driven Development is a non-negotiable requirement. Every functional change MUST be preceded by a failing test that defines the expected behavior. The Red-Green-Refactor cycle MUST be followed for every task. Implementation without corresponding tests is considered INCOMPLETE.

### IV. Mobile-First & Touch-Ready
The application MUST follow the Column-Priority strategy for mobile layouts as defined in `DESIGN.md`. All interactive elements (buttons, inputs, toggles) MUST have a minimum touch target size of 44x44px. Layouts MUST be verified on small screen widths (375px) before being considered complete.

### V. Zero Trust Security & Hygiene
Security MUST be enforced at the database level via strict Firebase Security Rules. No client-supplied data should be trusted without server-side validation. The use of `any` types in TypeScript and `console.log` in production code is strictly PROHIBITED. All code MUST pass static analysis and type checks before submission.

## Technical Constraints

- **Language**: TypeScript (Strict Mode)
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS 4 (OKLCH-based tokens)
- **Database**: Firebase (Firestore for persistent data, RTDB for real-time state)
- **Motion**: Framer Motion (respecting `prefers-reduced-motion`)

## Development Workflow

1. **Research**: Systematically map the codebase and validate assumptions against existing patterns.
2. **Strategy**: Formulate a plan that adheres to the Cyber-Pixel identity and TDD principles.
3. **Execution**: Implement changes incrementally, starting with tests, then code, then validation.
4. **QA**: Verify visual integrity against `DESIGN.md` and functional correctness against acceptance scenarios.

## Governance

### Amendments
This constitution can only be amended through documented proposals and explicit approval. Every amendment MUST include a migration plan for existing code and documentation.

### Versioning Policy
We follow Semantic Versioning (MAJOR.MINOR.PATCH):
- MAJOR: Backward incompatible governance or principle redefinitions.
- MINOR: New principles or materially expanded guidance.
- PATCH: Clarifications, wording refinements, or non-semantic fixes.

### Compliance
All Pull Requests and code reviews MUST verify adherence to these core principles. Complexity MUST be justified and simpler alternatives documented if rejected.

**Version**: 1.0.0 | **Ratified**: 2026-03-24 | **Last Amended**: 2026-03-24
