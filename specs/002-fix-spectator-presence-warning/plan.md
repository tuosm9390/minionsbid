# Implementation Plan: Fix Spectator Presence Warning

**Feature Branch**: `002-fix-spectator-presence-warning`  
**Specification**: [specs/002-fix-spectator-presence-warning/spec.md](spec.md)  
**Status**: Ready for Implementation  
**Created**: 2026-03-24

## Technical Context

- **Language/Framework**: Next.js 15, TypeScript, React 19, Firebase (Firestore & RTDB)
- **State Management**: Zustand (`useAuctionStore`)
- **Real-time Engine**: Firebase Realtime Database (Presence)
- **Key Files**: 
  - `src/features/auction/hooks/usePresence.ts` (핵심 로직 수정)
  - `src/features/auction/store/useAuctionStore.ts` (상태 필드 추가)
  - `src/features/auction/components/AuctionBoard.tsx` (UI 처리 및 경고 조건 수정)
  - `src/app/room/[id]/RoomClient.tsx` (Prop 전달 보완)

## Constitution Check

| Principle | Adherence | Notes |
|-----------|-----------|-------|
| UI Identity | ✅ | Cyber-Pixel 스타일 유지, `pixel-box`, OKLCH 토큰 사용 |
| No `any` Type | ✅ | TypeScript 인터페이스 정의 준수 |
| TDD | ✅ | `usePresence` 및 `AuctionBoard` 단위 테스트/검증 계획 포함 |
| Responsive | ✅ | 모바일/데스크탑 레이아웃 영향 없음 확인 |

## Gates

- [x] **Research Complete**: [research.md](research.md) 작성 완료. Firebase RTDB `.info/connected` 활용 확정.
- [x] **Contracts Defined**: [PresenceHook.md](contracts/PresenceHook.md) 작성 완료.
- [x] **Data Model Defined**: [data-model.md](data-model.md) 작성 완료.

## Phase 2: Implementation Strategy

### Phase 2.1: Data Layer (Store & Hooks)
- `useAuctionStore.ts`에 `isPresenceLoaded`, `isLocalConnected` 필드와 액션 추가.
- `usePresence.ts` 수정:
  - `VIEWER` 권한 시 `set()` 건너뛰기 로직 구현.
  - `onValue(allPresenceRef, ...)` 구독을 권한에 관계없이 실행.
  - `.info/connected` 구독을 통해 `isLocalConnected` 상태 동기화.

### Phase 2.2: UI/UX (AuctionBoard & RoomClient)
- `AuctionBoard.tsx`의 경고 오버레이 조건 수정:
  - `!allConnected && isAuctionStarted && !isAuctionComplete` 조건에 `isPresenceLoaded` 체크 추가.
  - `isLocalConnected === false`일 때 "연결 확인 중..." 전용 오버레이 표시 (FR-006).
- `RoomClient.tsx`에서 `isPresenceLoaded` 등을 `AuctionBoard`에 전달하거나 스토어에서 직접 참조하도록 최적화.

### Phase 2.3: Monitoring & Validation (Organizer)
- `OrganizerControlPanel.tsx` 내 공지사항 입력란 상단에 **인라인 경고 배너** 추가: 접속 인원이 80명 이상일 때 빨간색 배경(`bg-minion-red/10`)과 아이콘을 포함한 경고 문구 표시 (FR-007).
- 매뉴얼 테스트 가이드(`quickstart.md`)에 따라 검증 수행.
