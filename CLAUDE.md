## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

### Key Rules
- `text-[Npx]` 하드코딩 절대 금지 — 반드시 `text-fluid-xs/sm/base/lg/xl` 사용
- `rounded-*` 클래스 금지 — `--radius: 0rem` (전역 직각, 픽셀 아트 아이덴티티)
- 색상 직접 사용 금지 — `--color-minion-yellow/blue/red` OKLCH 토큰 사용
- 타입 `any` 사용 금지 (CLAUDE.md 전역 원칙)
- `console.log` 프로덕션 코드에 남기지 않기

### Typography Violations to Fix
BidStatus.tsx (L33, L42), BiddingControl.tsx (L61, L64, L72), TeamList.tsx (L44), RoomClient.tsx (L232), NoticeBanner.tsx — `text-[Npx]` → `text-fluid-xs` 교체 필요.
