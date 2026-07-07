# Socket.IO Hybrid 경매 전환 설계서

## 설계 원칙

1. 경매 진행 중 hot state는 transport별로 단일 소유자를 갖는다.
2. Socket mode에서는 server sequence가 `auction_revision` 역할을 대체한다.
3. Firestore는 persistence와 audit의 정본으로 유지한다.
4. Socket event는 항상 idempotency key와 sequence를 포함한다.
5. reconnect는 이벤트 재생보다 snapshot sync를 우선한다.
6. 현재 목표는 10~16명 단일 서버 운영이며, Redis는 production 기본 후보가 아니라 서버 이중화나 active state 보존 요구가 생길 때의 재검토 항목으로 둔다.

## 제안 디렉터리 구조

```text
auction-server/
  package.json
  src/
    index.ts
    env.ts
    socket.ts
    auth/
      verifySocketAuth.ts
      resolveRoomRole.ts
    engine/
      AuctionEngine.ts
      OpenAscendingEngine.ts
      timers.ts
      idempotency.ts
    state/
      InMemoryAuctionStateStore.ts
      FirestoreAuctionPersistence.ts
    contracts/
      events.ts
      commands.ts
    observability/
      metrics.ts
      logger.ts

src/features/auction/socket/
  socketClient.ts
  socketAuctionAdapter.ts
  socketContracts.ts
  useSocketAuctionRealtime.ts

src/features/auction/realtime/
  transportMode.ts
  firebaseAuctionAdapter.ts
  auctionTransportAdapter.ts
```

새 TypeScript 소스 파일을 만들 때는 첫 줄에 역할을 설명하는 한국어 주석을 둔다.

## Transport 선택

방 문서에 다음 필드를 추가한다.

```ts
type AuctionTransport = 'FIREBASE' | 'SOCKET_SHADOW' | 'SOCKET_CANARY' | 'SOCKET'

type RoomTransportFields = {
  auction_transport?: AuctionTransport
  socket_canary_enabled_at?: Timestamp | null
}
```

클라이언트는 room metadata를 읽은 뒤 adapter를 선택한다.

```text
FIREBASE
  -> 기존 useAuctionRealtime + placeBidDirect

SOCKET_SHADOW
  -> 기존 Firebase 동작 유지
  -> Socket join과 관측만 수행

SOCKET_CANARY / SOCKET
  -> Socket adapter가 hot state 소유
  -> Firestore listener는 metadata와 persistence reconcile만 반영
```

## Socket 인증

클라이언트는 기존 invite 또는 room auth context를 바탕으로 Socket handshake를 수행한다.

```ts
io(SOCKET_URL, {
  auth: {
    roomId,
    role,
    teamId,
    invite,
    authToken,
    firebaseIdToken,
  },
})
```

서버는 다음 순서로 검증한다.

1. `roomId` 형식 검증.
2. Firebase ID token이 있으면 Admin SDK로 검증.
3. 기존 invite 또는 room auth secret과 role/teamId 일치 검증.
4. ORGANIZER, LEADER, VIEWER 권한을 socket data에 저장.
5. `socket.join("auction:" + roomId)` 수행.

비공개 방 read tightening이 도입되기 전까지는 기존 링크 기반 권한 검증을 유지하되, Socket command는 반드시 서버 검증을 통과해야 한다.

## Command 계약

클라이언트가 서버로 보내는 command다.

```ts
type AuctionCommandBase = {
  roomId: string
  requestId: string
  clientSequence?: number
  sentAt: number
}

type BidSubmitCommand = AuctionCommandBase & {
  type: 'bid:submit'
  playerId: string
  teamId: string
  amount: number
}

type OrganizerCommand =
  | (AuctionCommandBase & { type: 'auction:start'; playerId: string })
  | (AuctionCommandBase & { type: 'auction:pause' })
  | (AuctionCommandBase & { type: 'auction:resume' })
  | (AuctionCommandBase & { type: 'player:award'; playerId: string })
  | (AuctionCommandBase & { type: 'player:unsold'; playerId: string })

type SyncCommand = {
  type: 'auction:sync'
  roomId: string
  lastSequence: number
}
```

`requestId`는 버튼 클릭 단위로 생성하고 재시도와 fallback에서 재사용한다.

## Event 계약

서버가 클라이언트로 보내는 event다.

```ts
type SocketAuctionState = {
  roomId: string
  sequence: number
  phase: 'WAITING' | 'LOTTERY' | 'ACTIVE' | 'PAUSED' | 'AWARDED' | 'UNSOLD' | 'ASSIGNMENT' | 'FINISHED'
  currentPlayerId: string | null
  currentBid: {
    eventId: string
    requestId: string
    playerId: string
    teamId: string
    amount: number
    createdAt: string
  } | null
  timerEndsAt: string | null
  teams: Array<{
    id: string
    pointBalance: number
    rosterSlotsUsed: number
    rosterSlotsTotal: number
  }>
  lastEventId: string
  serverTime: number
}

type SocketAuctionEvent =
  | { type: 'auction:state'; state: SocketAuctionState }
  | { type: 'bid:accepted'; requestId: string; eventId: string; state: SocketAuctionState }
  | { type: 'bid:rejected'; requestId: string; reason: string; state?: SocketAuctionState }
  | { type: 'auction:sync'; state: SocketAuctionState; reason: 'JOIN' | 'RECONNECT' | 'GAP' | 'MANUAL' }
  | { type: 'auction:error'; requestId?: string; code: string; message: string }
```

클라이언트 적용 규칙은 단순해야 한다.

```text
if incoming.sequence <= current.sequence:
  ignore
else:
  replace hot state
```

## Auction Engine 책임

`OpenAscendingEngine`은 다음을 담당한다.

- 현재 방 active state load.
- command 권한 검증.
- 입찰 최소 금액 검증.
- 최고 입찰 팀 재입찰 거부.
- 포인트 잔액과 roster slot 검증.
- timer extension 계산.
- sequence 증가.
- idempotency 결과 재사용.
- state broadcast.
- Firestore persistence enqueue.

Firestore rules에 있던 direct bid 최종 방어는 Socket mode에서 서버 코드로 이동한다. 따라서 기존 rules 검증과 같은 테스트 케이스를 engine 테스트로 복제해야 한다.

## State Store

### In-memory store

초기 fixture canary에 사용한다.

```ts
interface AuctionStateStore {
  get(roomId: string): Promise<SocketAuctionState | null>
  set(roomId: string, state: SocketAuctionState): Promise<void>
  appendEvent(roomId: string, event: SocketAuctionEvent): Promise<void>
  getEventsAfter(roomId: string, sequence: number): Promise<SocketAuctionEvent[]>
  rememberRequest(roomId: string, requestId: string, result: SocketAuctionEvent): Promise<void>
  getRequestResult(roomId: string, requestId: string): Promise<SocketAuctionEvent | null>
}
```

### Durable state 재검토

현재 10~16명 단일 서버 운영에서는 Redis store를 선행 구현하지 않는다. Socket accepted bid는 Firestore persistence-before-broadcast와 Firestore hydrate로 우선 보존한다. 아래 구조는 서버 2대 이상 운영이나 재시작 중 active state 보존 요구가 생겼을 때의 후보로만 둔다.

```text
auction:{roomId}:state
auction:{roomId}:events
auction:{roomId}:requests
auction:{roomId}:locks
```

Redis 도입 시에는 Lua script 또는 single writer lock으로 bid command의 atomic update를 보장한다.

## Firestore Persistence

Socket mode에서도 Firestore 저장 계약은 유지한다.

| 시점 | 저장 |
| --- | --- |
| bid accepted | `rooms/{roomId}/bids/{eventId}` append, optional message append |
| timer start or extension | checkpoint 용도로 room hot fields 저장 여부 결정 |
| award | players, teams, room state transaction |
| unsold | players, room state transaction |
| final finish | archive 생성 기존 경로 유지 |

Canary 단계에서는 운영 안정성을 위해 bid accepted, award, unsold, finish 모두 Firestore persistence 또는 transaction 성공 후 broadcast하는 방식을 우선한다. 특히 현재 구현은 Socket accepted bid를 Firestore에 저장한 뒤 ack와 `auction:state` broadcast를 반환한다.

## 클라이언트 Adapter

`auctionTransportAdapter`는 UI가 transport를 직접 알지 않게 한다.

```ts
interface AuctionTransportAdapter {
  connect(): Promise<void>
  disconnect(): void
  bid(args: { playerId: string; teamId: string; amount: number; requestId: string }): Promise<void>
  start(args: { playerId: string; requestId: string }): Promise<void>
  pause(args: { requestId: string }): Promise<void>
  resume(args: { requestId: string }): Promise<void>
  sync(reason: string): void
}
```

기존 `useBiddingControl()`은 `placeBidDirect()`를 직접 호출하지 않고 adapter의 `bid()`를 호출하도록 단계적으로 바꾼다. Firebase mode adapter는 기존 `placeBidDirect()`와 fallback을 그대로 감싼다.

## Timer 설계

서버는 `timerEndsAt`을 ISO string 또는 epoch ms로 관리한다. 클라이언트는 countdown 표시만 한다.

타이머 만료 처리 원칙은 다음과 같다.

- Socket mode에서 만료 판단은 Auction Server가 한다.
- 클라이언트 wake-up은 `auction:sync` 요청 또는 표시 보정용으로만 사용한다.
- 서버 timer가 지연되어도 command 처리 시 `Date.now() >= timerEndsAt`이면 입찰을 거부하고 만료 전이를 먼저 처리한다.

## 장애와 Fallback

| 상황 | 처리 |
| --- | --- |
| Socket 연결 실패 | `SOCKET_SHADOW`는 무시, `SOCKET_CANARY`는 Firebase fallback 또는 경매 pause 중 하나를 방 정책으로 선택 |
| 서버 재시작 | 현재 단일 서버 canary는 Firestore hydrate로 우선 복구, Redis는 이 방식으로 부족한 문제가 확인될 때 검토 |
| Firestore persistence 실패 | retry queue와 reconciliation 상태 표시, terminal transition은 broadcast 전 Firestore 성공 우선 |
| sequence gap | `auction:sync` snapshot 요청 |
| 중복 bid request | request id 캐시 결과 재전송 |

## 테스트 계획

### 단위 테스트

- `OpenAscendingEngine` 입찰 검증.
- idempotency request replay.
- timer extension threshold.
- sequence 증가와 stale command reject.
- point balance와 roster slot 검증.

### 통합 테스트

- Socket auth 성공과 실패.
- room join과 role별 command 제한.
- bid accepted broadcast.
- reconnect 후 sync.
- sequence gap 후 snapshot replace.

### E2E 테스트

- fixture 1 organizer + 8 leaders Socket mode.
- 막판 입찰 timer extension.
- 한 leader reconnect 후 최신 state 회복.
- Socket server 강제 disconnect 후 fallback 또는 pause.
- award 후 Firestore archive와 schedule gate 유지.

## 구현 순서

1. shared contract와 transport mode 타입을 추가한다.
2. Socket server skeleton과 auth handshake를 만든다.
3. shadow mode client 연결과 observability를 추가한다.
4. in-memory `OpenAscendingEngine`과 fixture canary를 만든다.
5. client transport adapter로 `useBiddingControl()` 호출 경계를 분리한다.
6. Socket mode E2E를 추가한다.
7. Firestore persistence와 reconciliation을 붙인다.
8. 운영 canary flag를 추가한다.
9. 10~16명 리허설과 운영 canary evidence를 수집한다.
10. Redis와 RTDB fanout 축소는 실제 장애나 확장 요구가 생길 때 별도 결정한다.

## 문서 갱신 대상

구현 시 다음 문서를 함께 갱신해야 한다.

- `doc/AUCTION_REALTIME_CONTRACT.md`
- `doc/ARCHITECTURE.md`
- `doc/SECURITY.md`
- `doc/TECH_STATE_SNAPSHOT.md`
- `README.md` 또는 운영 실행 문서

## 남은 결정

- Socket 서버 배포 위치.
- 16명 초과 운영 또는 서버 이중화 시 Redis 도입 여부.
- Socket 장애 시 Firebase fallback과 forced pause 중 어느 정책을 쓸지.
- Socket mode에서 bid accepted persistence를 broadcast 전후 어디에 둘지.
- 비공개 입찰을 별도 Socket engine으로 옮길지 여부.
