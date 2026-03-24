# Data Model: Connection & Presence

## Entities

### Presence (실시간 접속 정보)
- **경로**: `presence/${roomId}/${sessionId}` (RTDB)
- **필드**:
  - `teamId`: string | null (팀장인 경우 팀 ID, 주최자는 null)
  - `role`: "LEADER" | "ORGANIZER"
  - `teamName`: string (표시용 팀 이름)
  - `connectedAt`: number (서버 타임스탬프)

### Local Connection Status (로컬 연결 상태)
- **데이터 소스**: Firebase `.info/connected` 및 브라우저 온라인 상태
- **상태**:
  - `connected`: 서버와 통신 중
  - `disconnected`: 연결 끊김 (재연결 시도 중)

## Application State (useAuctionStore)

### New Fields
- `isPresenceLoaded`: boolean (첫 Presence 데이터 수신 여부)
- `isLocalConnected`: boolean (Firebase 서버와의 실시간 연결 여부)

### Validation Rules
- `presences` 목록은 항상 `role`이 `LEADER` 또는 `ORGANIZER`인 객체만 포함한다.
- `VIEWER`는 쓰기 권한이 없어야 하며, 규칙상으로도 차단되어야 한다 (Firebase Security Rules).

## State Transitions

1. **초기화**: `isPresenceLoaded = false`, `isLocalConnected = true` (낙관적 시작)
2. **데이터 수신**: `onValue` 콜백 첫 실행 시 `isPresenceLoaded = true`
3. **네트워크 단절**: `.info/connected`가 false가 되면 `isLocalConnected = false`
4. **네트워크 복구**: 다시 true가 되면 `isLocalConnected = true`
