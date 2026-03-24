Date: 2026-03-24
Author: Antigravity

# Findings — Redesign Completion

## 1. Typography Violations
Current hardcoded sizes found:
- `ChatPanel.tsx`: `text-[9px]`, `text-[8px]`, `text-[10px]`
- `BidStatus.tsx`: (Mostly fixed, need double check)
- `BiddingControl.tsx`: `text-xl` (for +/-), need to check if fluid is better.
- `NoticeBanner.tsx`: Need to check.

## 2. BiddingControl Button
- Current height: `h-14` (56px) - OK.
- Shine animation: Uses `animate-[shimmer_2s_infinite]`.
- Goal: Upgrade to "Gold Shine" (`before:` gradient + `animate-shine`).

## 3. ChatPanel System Messages
- Current: `bg-gray-100/50 border-l-4 border-gray-300` + `[SYS]` text.
- Goal: `border-minion-blue bg-minion-blue/10` + `▶ [SYSTEM]` badge.

## 4. Mobile Layout
- `RoomClient.tsx` already has some order logic, but `TeamList` is always visible and fixed height on mobile.
- `ChatPanel` height needs control on mobile to avoid pushing content too far.
