# Auction Realtime Contract

이 문서는 경매 실시간 동기화의 단일 계약을 정의한다. 목표는 "빠르게 보이는 화면"이 아니라 "모든 클라이언트가 같은 진실을 빠르게 보는 화면"이다.

## Canonical Sources

- Firestore는 정본이다.
  - `rooms/{roomId}`: 현재 선수, 타이머, 방 메타데이터
  - `rooms/{roomId}/bids`: 정식 입찰 기록
  - `rooms/{roomId}/players`: 선수 상태
  - `rooms/{roomId}/teams`: 팀 포인트 및 팀 메타데이터
  - `rooms/{roomId}/messages`: 정식 채팅 및 시스템 메시지
- RTDB는 서버가 발행하는 저지연 fanout 버스다.
  - `signals/{roomId}/auctionEvent`: 경매 상태 이벤트 envelope
  - `signals/{roomId}/latestMessage`: 채팅/시스템 메시지 저지연 fanout

## Non-Negotiable Rules

1. 경매 상태를 RTDB에 쓰는 주체는 서버뿐이다.
2. 클라이언트는 local optimistic UI만 수행한다.
3. Firestore snapshot은 항상 최종 수렴 지점이다.
4. 만료 복구 트리거는 `ORGANIZER` 클라이언트 한 명만 수행한다.
5. 파생 상태(`highestBid`, `topBid`, `minBid`, `leadingTeam`)는 공통 helper로만 계산한다.

## Auction Event Envelope

현재 계약 타입은 [`src/features/auction/utils/auctionRealtime.ts`](D:\development\league-auction\src\features\auction\utils\auctionRealtime.ts:1)에 정의되어 있다.

```ts
type AuctionEventEnvelope = {
  eventId: string
  revision: number
  roomId: string
  type:
    | 'LOTTERY_DRAWN'
    | 'LOTTERY_CLOSED'
    | 'AUCTION_STARTED'
    | 'AUCTION_PAUSED'
    | 'AUCTION_RESUMED'
    | 'BID_PLACED'
    | 'PLAYER_AWARDED'
    | 'PLAYER_UNSOLD'
    | 'DRAFT_ASSIGNED'
    | 'RE_AUCTION_STARTED'
  serverCreatedAt: string
  timerEndsAt?: string | null
  liveBid?: LiveBidState | null
  player?: Partial<Player> & Pick<Player, 'id'>
  lotteryPlayer?: Player | null
  team?: Partial<Team> & Pick<Team, 'id'>
  playerIdsToWaiting?: string[]
  message?: Message | null
}
```

## Ordering Rules

- `revision`은 방 단위 단조 증가 값이다.
- 클라이언트는 현재 `auctionEventRevision` 이하의 이벤트를 적용하지 않는다.
- `eventId`는 end-to-end 추적 키다.
- `serverCreatedAt`은 서버 기준 생성 시각이다.

즉, 클라이언트 적용 조건은 아래와 같다.

```text
if event.revision <= currentRevision:
  ignore
else:
  apply
```

## Client Apply Rules

이벤트 적용 규칙은 [`applyAuctionEventToState()`](D:\development\league-auction\src\features\auction\utils\auctionRealtime.ts:84)에 모아둔다. 훅 안에서 switch를 다시 복제하지 않는다.

- `LOTTERY_DRAWN`: 추첨 중 선수를 `lotteryPlayer`에 반영
- `LOTTERY_CLOSED`: `lotteryPlayer` 제거
- `AUCTION_STARTED` / `AUCTION_PAUSED` / `AUCTION_RESUMED`: `timerEndsAt` 갱신
- `BID_PLACED`: `timerEndsAt`, `liveBid` 갱신
- `PLAYER_AWARDED` / `PLAYER_UNSOLD`: 타이머와 `liveBid`를 비우고 추첨 상태 종료
- `DRAFT_ASSIGNED`: player/team patch 적용
- `RE_AUCTION_STARTED`: 지정된 선수들을 `WAITING`으로 복구

## Bid Flow

```text
leader click bid
  -> client local optimistic UI
  -> server placeBid()
  -> Firestore canonical write
  -> RTDB auctionEvent publish
  -> all clients apply newer revision
  -> Firestore snapshots reconcile
```

핵심 원칙:

- 입찰자는 즉시 반응해도 된다.
- 다른 화면이 같은 상태를 보는 기준은 서버가 발행한 envelope다.
- Firestore snapshot은 나중에 와도 같은 결과로 수렴해야 한다.

## Observability Rules

- 서버 로그와 클라이언트 로그는 가능한 한 동일한 `eventId`와 `revision`을 찍는다.
- 지연 분석은 세 구간으로 본다.
  - client -> server round trip
  - server canonical write + envelope publish
  - envelope receive / Firestore reconcile

## Testing Requirements

- 서버 규칙 테스트
  - `placeBid`, `awardPlayer`, `draftPlayer`
- 훅/유틸 테스트
  - stale revision 무시
  - `BID_PLACED` 타이머/입찰 반영
  - organizer-only recover path
- 멀티클라이언트 E2E
  - 막판 `1초 미만` 입찰 연장
  - 타 클라이언트 `5초` 재시작 동기화
  - 낙찰/유찰 후 화면 일치

## Change Policy

아래 변경은 이 문서를 같이 수정해야 한다.

- auction event 타입 추가/삭제
- `revision` 생성 규칙 변경
- 클라이언트 optimistic 범위 변경
- organizer-only recovery 정책 변경
- 파생 상태 계산 규칙 변경
