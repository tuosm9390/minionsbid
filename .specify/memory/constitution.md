<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- List of modified principles:
  - Principle I: Cyber-Pixel Identity (Refined to explicitly prohibit hardcoded pixel sizes and emphasize fluid typography).
  - Principle IV: Mobile-First & Touch-Ready (Expanded to include Accessibility and Modal Portal requirements).
  - Principle V: Zero Trust Security & Hygiene (Expanded to include Zod validation and strict RLS/IDOR prevention mandates).
- Added sections: none
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
**Rules**:
- Strictly follow the Cyber-Pixel design system defined in `DESIGN.md`.
- Use OKLCH tokens for all colors; avoid HEX or RGB values.
- Implement fluid typography for all text sizes; hardcoding pixel sizes (e.g., `text-[12px]`) is strictly PROHIBITED.
- Maintain 4px solid black borders and straight edges (`--radius: 0rem`) for all UI elements.
**Rationale**: To maintain a consistent, high-impact 8-bit aesthetic that distinguishes the brand and ensures visual integrity across all devices.

### II. Real-time State Integrity
**Rules**:
- Firebase Realtime Database (RTDB) is the authoritative single source of truth for all auction states.
- Prioritize low-latency updates (<200ms) and guarantee eventual consistency.
- Local state MUST NOT override server-broadcasted state.
**Rationale**: To ensure a fair and synchronous bidding experience for all participants.

### III. Test-First (TDD) Mandatory
**Rules**:
- Every functional change MUST be preceded by a failing test (Red-Green-Refactor).
- Implementation without corresponding tests is considered INCOMPLETE.
- Maintain high test coverage for core auction logic and state transitions.
**Rationale**: To guarantee behavioral correctness and prevent regressions in complex real-time logic.

### IV. Mobile-First & Touch-Ready
**Rules**:
- Follow the Column-Priority strategy for mobile layouts as defined in `DESIGN.md`.
- Minimum touch target size of 44x44px for all interactive elements.
- Verify layouts on small screen widths (375px) before completion.
- **Accessibility**: Modals and overlays MUST use Portals and ensure proper focus management and keyboard accessibility.
**Rationale**: To provide a seamless, inclusive experience for all users, especially on touch-based mobile devices.

### V. Zero Trust Security & Hygiene
**Rules**:
- Validate and sanitize ALL inputs at the API boundary using Zod schemas.
- Enforce strict Firebase Security Rules (RLS) to prevent unauthorized access and IDOR attacks.
- The use of `any` types in TypeScript and `console.log` in production code is strictly PROHIBITED.
- NEVER trust client-supplied or URL-based data without server-side verification.
**Rationale**: To ensure system integrity, protect user data, and maintain high code quality standards.

## Technical Constraints

- **Language**: TypeScript (Strict Mode)
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS 4 (OKLCH-based tokens)
- **Database**: Firebase (Firestore for persistence, RTDB for real-time)
- **Validation**: Zod (Boundary validation)
- **Motion**: Framer Motion (respecting `prefers-reduced-motion`)

## Development Workflow

1. **Research**: Systematically map the codebase and validate assumptions.
2. **Strategy**: Formulate a plan adhering to Cyber-Pixel identity and TDD.
3. **Execution**: Implement incrementally (Red-Green-Refactor).
4. **QA**: Verify visual integrity (`DESIGN.md`) and functional correctness.

## Governance

### Amendments
Amended through documented proposals and explicit approval. Migration plans are mandatory for principle-level changes.

### Versioning Policy
- MAJOR: Backward incompatible governance or principle removals.
- MINOR: New principles or materially expanded guidance.
- PATCH: Clarifications, wording, or non-semantic fixes.

### Compliance
All PRs and reviews MUST verify adherence. Complexity MUST be justified and documented.

**Version**: 1.1.0 | **Ratified**: 2026-03-24 | **Last Amended**: 2026-03-24
