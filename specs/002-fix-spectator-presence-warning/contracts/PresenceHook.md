# Contract: useFirebasePresence Hook

## Purpose
사용자의 역할(Role)에 따라 실시간 접속 정보를 등록하고, 모든 참여자의 접속 상태를 구독한다.

## Interface

### Input (PresenceOptions)
| Property | Type | Description |
|----------|------|-------------|
| `roomId` | `string` | 접속 중인 방 ID |
| `teamId` | `string \| null` | 팀 ID (팀장인 경우) |
| `role` | `string \| null` | 사용자 역할 (LEADER, ORGANIZER, VIEWER) |
| `teamName` | `string?` | 팀 이름 |

### Behavior (수정 사항)
1. **쓰기 (Write)**:
   - `role === 'LEADER' || role === 'ORGANIZER'` 인 경우에만 `presence/${roomId}` 경로에 데이터를 기록한다.
   - `VIEWER` 인 경우 기록을 건너뛴다.
2. **읽기 (Read/Subscribe)**:
   - **모든 역할**(`VIEWER` 포함)이 `presence/${roomId}` 경로를 구독한다.
   - 데이터 수신 시 `useAuctionStore`의 `presences`와 `isPresenceLoaded`를 업데이트한다.
3. **로컬 연결 감지**:
   - `.info/connected`를 구독하여 `isLocalConnected` 상태를 실시간 동기화한다.

### Output
- 이 훅은 상태를 전역 스토어(`useAuctionStore`)에 직접 반영하므로 별도의 반환값이 없다.
