# Research: 관전자 접속 이탈 경고 및 연결 상태 개선

## 기술적 배경
현재 `useFirebasePresence` 훅은 `VIEWER` 권한인 경우 데이터 구독 자체를 건너뛰도록 설계되어 있습니다. 이로 인해 관전자는 `presences` 데이터를 받지 못해 `allConnected` 상태가 항상 `false`(초기값)로 유지되며, 경매 시작 후 "연결 끊김" 경고가 무조건 표시되는 버그가 발생합니다.

## 조사 항목 및 결정

### 1. 실시간 네트워크 상태 감지 (자신의 단절)
- **결정**: Firebase RTDB의 `.info/connected` 경로를 활용한다.
- **근거**: 브라우저의 `navigator.onLine`은 로컬 네트워크 연결만 확인하지만, `.info/connected`는 실제 Firebase 서버와의 실시간 소켓 연결 상태를 반영하므로 가장 정확하다.
- **대안**: `window.addEventListener('online/offline')` - 간단하지만 서버 연결 상태를 보장하지 않음.

### 2. 초기 로딩 상태 처리
- **결정**: `useAuctionStore`에 `isPresenceLoaded` 상태를 추가하거나, `presences` 초기값을 `null`로 설정하여 첫 데이터 수신 전까지 중립 상태를 구분한다.
- **근거**: 명세서 FR-005(데이터 수신 전 중립 상태 제공)를 충족하기 위해 필요하다. `AuctionBoard`에서 `presences === null`인 경우 로딩 UI를 표시한다.

### 3. 관전자 권한에서의 Presence 동작
- **결정**: `useFirebasePresence` 내에서 `set(presenceRef, ...)`(쓰기)는 권한에 따라 분기하되, `onValue(allPresenceRef, ...)`(구독)는 모든 역할이 수행하도록 수정한다.
- **근거**: 관전자는 자신의 정보를 노출하지 않으면서도(FR-004), 팀장들의 접속 상태는 실시간으로 알아야 하기 때문(FR-001).

### 4. 동시 접속자 모니터링 (FR-007)
- **결정**: 현재는 `presences.length`(주최자+팀장 수)만 집계한다. 관전자 수까지 집계하려면 관전자가 익명으로라도 존재를 기록해야 하므로, "자신의 존재를 등록하지 않는다"는 FR-004와 충돌한다. 
- **Rationale**: 시스템 임계치 경고는 우선 등록된 세션(주최자/팀장) 기준으로 구현하고, 향후 필요 시 관전자의 '익명 카운팅' 로직을 별도로 검토한다.

## 참조 코드 패턴
```typescript
// .info/connected 감지 패턴
const connectedRef = ref(getDatabase(), '.info/connected');
onValue(connectedRef, (snap) => {
  if (snap.val() === true) {
    // 연결됨
  } else {
    // 연결 끊김 (로컬 혹은 서버 장애)
  }
});
```
