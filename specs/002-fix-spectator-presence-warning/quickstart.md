# Quickstart: Spectator Presence Fix

## Setup
1. `002-fix-spectator-presence-warning` 브랜치로 체크아웃한다.
2. `npm install`을 실행하여 의존성을 확인한다.

## Test Scenario (Manual)
1. **주최자/팀장 접속**: 브라우저 A에서 방을 생성하고 팀장 링크로 접속한다.
2. **관전자 접속**: 브라우저 B(비밀 모드)에서 관전자 링크로 접속한다.
3. **결과 확인**: 
   - 관전자 화면에 "연결 끊김" 경고가 나타나지 않아야 함.
   - 팀장이 이탈하면 관전자 화면에 즉시 경고가 나타나야 함.
4. **로컬 네트워크 테스트**: 
   - 개발자 도구의 Network 탭에서 `Offline`을 선택한다.
   - 관전자 화면에 "연결 확인 중..." 전용 UI가 나타나야 함.

## Development Checklist
- [ ] `useAuctionStore.ts`: `isPresenceLoaded`, `isLocalConnected` 필드 추가.
- [ ] `usePresence.ts`: `VIEWER` 권한 구독 허용 및 로컬 연결 감지 추가.
- [ ] `AuctionBoard.tsx`: `allConnected` 판단 시 로딩 상태 고려 및 전용 오버레이 추가.
