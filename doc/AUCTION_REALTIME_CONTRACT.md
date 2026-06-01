# Auction Realtime Contract

이 문서는 경매 실시간 동기화의 단일 계약을 정의한다. 목표는 "빠르게 보이는 화면"이 아니라 "모든 클라이언트가 같은 진실을 빠르게 보는 화면"이다.

## Canonical Sources

- Firestore는 정본이다.
  - `rooms/{roomId}`: 현재 경매 hot state, 타이머, 방 메타데이터
    - `current_player_id`
    - `active_bid`
    - `timer_ends_at`
    - `auction_revision`
    - `last_auction_event`
  - `rooms/{roomId}/bids`: 정식 입찰 history / audit trail
  - `rooms/{roomId}/players`: 선수 상태
  - `rooms/{roomId}/teams`: 팀 포인트 및 팀 메타데이터
  - `rooms/{roomId}/messages`: 정식 채팅 및 시스템 메시지
- RTDB는 서버가 발행하는 저지연 fanout 버스다.
  - `signals/{roomId}/auctionEvent`: 경매 상태 이벤트 envelope
  - `signals/{roomId}/latestMessage`: 채팅/시스템 메시지 저지연 fanout

## Non-Negotiable Rules

1. 경매 상태를 RTDB에 쓰는 주체는 서버뿐이다.
2. 클라이언트는 local optimistic UI를 수행할 수 있다.
3. 입찰 hot path는 예외적으로 Firestore 클라이언트 SDK direct transaction을 1차 경로로 허용한다.
4. direct bid는 custom token claim과 Firestore rules 검증을 통과한 제한된 room field update 및 bid history create만 허용한다.
5. Firestore snapshot은 항상 최종 수렴 지점이다.
6. organizer는 항상 경매에 참여하며, 팀장 연결이 끊기면 organizer presence guard가 즉시 경매를 일시정지한다.
7. 파생 상태(`highestBid`, `topBid`, `minBid`, `leadingTeam`, `canBid`)는 공통 helper로만 계산한다.
8. `auction_revision`은 timestamp가 아니라 방 단위 단조 증가 counter다.

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
    | 'SEALED_BID_STARTED'
    | 'SEALED_BID_LOCKED'
    | 'SEALED_BID_REVEALED'
    | 'SEALED_BID_AWARDED'
    | 'SEALED_BID_REBID_STARTED'
  serverCreatedAt: string
  currentPlayerId?: string | null
  timerEndsAt?: string | null
  liveBid?: LiveBidState | null
  player?: Partial<Player> & Pick<Player, 'id'>
  lotteryPlayer?: Player | null
  team?: Partial<Team> & Pick<Team, 'id'>
  playerIdsToWaiting?: string[]
  message?: Message | null
  sealedBid?: Partial<SealedBidState> | null
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
- `SEALED_BID_STARTED` / `SEALED_BID_REBID_STARTED`: 비공개 입찰 전용 타이머와 라운드 상태 반영
- `SEALED_BID_LOCKED`: 비공개 제출 잠금, 타이머 제거
- `SEALED_BID_REVEALED`: 공개 카드 결과 반영. 이 단계에서는 아직 선수/팀 정본 낙찰을 확정하지 않는다
- `SEALED_BID_AWARDED`: 카드 공개 애니메이션 완료 후 선수/팀 patch 적용

## Sealed Bid Flow

비공개 입찰은 공개 입찰 hot path와 독립된 경로다.

```text
organizer start auction
  -> room.auction_mode == SEALED_BID
  -> server creates sealed bid round
  -> Firestore room canonical state update (sealed_bid_*, timer_ends_at, auction_revision)
  -> RTDB SEALED_BID_STARTED event

leader submit amount
  -> server submitSealedBid()
  -> rooms/{roomId}/sealed_bid_rounds/{roundId}/submissions/{teamId}
  -> no RTDB auction event
  -> no public submission count

timer expires
  -> recoverExpiredAuction()
  -> lockSealedBidRound()
  -> SEALED_BID_LOCKED event

organizer click reveal
  -> revealSealedBidRound()
  -> server computes reveal cards in team list order
  -> SEALED_BID_REVEALED event
  -> clients animate card reveal

organizer animation complete
  -> completeSealedBidReveal()
  -> single highest: player/team canonical award + SEALED_BID_AWARDED
  -> top tie: new SEALED_BID_REBID_STARTED round with only tied teams eligible
```

비공개 입찰 원칙:

- `active_bid`, `BID_PLACED`, `placeBidDirect()`는 사용하지 않는다.
- 타이머 중 다른 팀의 금액, 제출 여부, 작성 상태를 주최자와 팀장 모두에게 노출하지 않는다.
- 미제출과 `0P` 제출은 모두 입찰 포기다.
- 일반 비공개 입찰은 `1P` 단위이며 `0P` 이상 팀 보유 포인트 이하만 허용한다.
- 재입찰은 직전 최고 동점 금액을 최소 금액으로 삼고, 동점 팀만 제출할 수 있다.
- 점수공개 시점에는 공개 결과만 확정하고, 선수 SOLD/UNSOLD 및 팀 포인트 차감은 카드 애니메이션 완료 후 확정한다.

## Bid Flow

```text
leader click bid
  -> client local optimistic UI
  -> client placeBidDirect() Firestore transaction
  -> Firestore room canonical state update (active_bid, timer_ends_at, auction_revision)
  -> bid history append (rooms/{roomId}/bids)
  -> if direct bid fails: fallback to server placeBid() transaction
       -> server publishes RTDB auctionEvent + system message (동기)
  -> if direct bid succeeds:
       -> fire-and-forget broadcastBidEvent() Server Action
            -> last_auction_event 저장
            -> RTDB auctionEvent 발행
            -> system message 생성
       -> Firestore onSnapshot이 즉시 전파 (1차 전파)
       -> broadcastBidEvent의 RTDB 이벤트가 뒤따라 전파 (2차 전파)
       -> RTDB/last_auction_event가 늦거나 실패해도 bid-shaped room snapshot으로 peer 화면 수렴
  -> all clients converge on newer revision
  -> Firestore room snapshot / last_auction_event fallback heal where applicable
  -> Firestore players/teams/messages reconcile
```

핵심 원칙:

- 입찰자는 즉시 반응해도 된다.
- 다른 화면이 같은 상태를 보는 기준은 Firestore room canonical fields와 `auction_revision`이다.
- direct bid 경로에서도 `broadcastBidEvent`를 통해 RTDB envelope를 비동기 발행하여 타이머와 입찰 로그가 모든 클라이언트에 빠르게 전파된다.
- Server Action fallback 경로에서는 서버가 동기적으로 발행한 RTDB envelope가 빠른 fanout 기준이 된다.
- RTDB를 놓친 화면은 `rooms/{roomId}.last_auction_event`와 room canonical fields로 빠르게 회복해야 한다.
- Firestore snapshot은 나중에 와도 같은 결과로 수렴해야 한다.
- direct bid의 room snapshot fallback은 `current_player_id`, `timer_ends_at`, `active_bid`, `auction_revision`이 모두 bid 상태를 표현할 때만 `liveBid`와 `timerEndsAt`을 투영한다.
- event 없는 room snapshot은 같은 revision의 RTDB 낙찰/유찰 이벤트를 막지 않도록 `auctionEventRevision`을 올리지 않는다.

## Direct Bid Rules

`placeBidDirect()`는 Vercel Function 왕복을 줄이기 위한 hot path다.

허용 범위:

- `rooms/{roomId}` update
  - `active_bid`
  - `timer_ends_at`
  - `auction_revision`
- `rooms/{roomId}/bids/{bidId}` create

검증 경계:

- Firebase custom token claim
  - `role == 'LEADER'`
  - `roomId == target room`
  - `teamId == bidding team`
- Firestore rules
  - 현재 경매 선수와 입찰 `player_id` 일치
  - 자기 팀이 현재 최고 입찰자이면 거부
  - 새 금액이 기존 금액보다 큼
  - 팀 포인트 잔액이 입찰액 이상
  - 팀 문서의 `roster_slots_used < roster_slots_total`
  - `auction_revision == before + 1`
  - bid history create는 같은 transaction의 `getAfter(room).active_bid.event_id == bidId`와 일치
- 성공한 입찰은 남은 시간이 8초 이하일 때만 `timer_ends_at`을 request time 기준 8초 근처로 재설정
- 남은 시간이 8초 초과이면 입찰은 `active_bid`와 `auction_revision`만 갱신하고 기존 `timer_ends_at`을 유지
  - 클라이언트와 서버 시계 차이를 흡수하기 위해 request time 기준 5~11초 범위만 허용

클라이언트 사전 검증은 UX용이다. 최종 방어선은 Firestore rules다.

기존 room을 strict rules로 전환하기 전에는 `npm run backfill:team-roster-slots:dry-run`으로 누락 팀을 확인하고, `npm run backfill:team-roster-slots`로 `roster_slots_used` / `roster_slots_total`을 채워야 한다.

## Timer Rules

- 일반 경매 시작 타이머는 `10초`다.
- 재경매에서 실제 경매를 시작할 때의 첫 타이머는 `5초`다.
- 입찰이 들어왔을 때 남은 시간이 `8초 이하`이면 타이머를 입찰 시점 기준 최소 `8초` 이상 남도록 연장한다.
- 남은 시간이 `8초 초과`이면 기존 타이머를 유지한다.
- 이 규칙은 direct bid와 Server Action fallback 경로 모두 동일하게 적용한다.

## Expiry Ownership

```text
leader disconnect
  -> organizer presence guard
  -> pauseAuction(roomId)
  -> RTDB publish + Firestore reconcile

auction timer expires while any client is active
  -> organizer local timer or multi-client wake-up
  -> recoverExpiredAuction(roomId)
  -> awardPlayer transaction
  -> RTDB publish + Firestore reconcile
```

- organizer와 모든 팀장은 함께 연결되어 있어야 경매가 진행된다.
- organizer presence guard는 연결이 하나라도 빠지면 경매를 즉시 일시정지하고, 모든 참가자가 다시 연결될 때만 재개한다.
- 경매 만료 복구는 organizer 전용이 아니다.
- `timerEndsAt + currentPlayerId`를 본 어떤 활성 클라이언트든 만료 시각에 `recoverExpiredAuction(roomId)`를 깨울 수 있다.
- 중복 호출은 클라이언트 `recoveryKey`와 서버 `awardPlayer()` 멱등성으로 흡수한다.
- `/api/auction-watchdog`는 선택적 backup/manual sweep 경로일 뿐, 기본 실시간 경매 contract의 필수 구성요소는 아니다.
- watchdog는 핵심 경매 상태를 자동 진행하지 않으며, 참가자 부재 상태에서는 입찰과 타이머 진행을 대신하지 않는다.

## Observability Rules

- 서버 로그와 클라이언트 로그는 가능한 한 동일한 `eventId`와 `revision`을 찍는다.
- 지연 분석은 세 구간으로 본다.
  - direct bid: client transaction round trip
  - fallback bid: client -> server round trip, server canonical write + envelope publish
  - client receive / Firestore reconcile
- 브라우저 디버그 계측은 `window.__auctionLatencyMarkers__`에 최근 marker를 남긴다.
  - `client-response`: direct bid 또는 Server Action fallback 응답에서 입찰자가 받은 `eventId`
  - `rtdb`: 다른 클라이언트가 RTDB `auctionEvent`로 같은 입찰을 적용한 시점
  - `room-fallback`: RTDB를 놓친 클라이언트가 `last_auction_event`로 같은 입찰을 회복한 시점
- direct bid는 Firestore transaction의 `active_bid.event_id`를 응답 marker와 후속 RTDB `BID_PLACED` envelope에 함께 사용해 같은 입찰을 하나의 marker chain으로 묶는다.
- marker는 운영 기능이 아니라 디버그/Playwright 검증용이다. 하지만 `eventId` 연쇄는 contract의 일부로 본다.

예시:

```text
leader click bid
  -> fallback placeBid response carries eventId=bid_123
  -> bidder page records source=client-response
  -> peer page records source=rtdb
  -> fallback page records source=room-fallback
```

## Testing Requirements

- 서버 규칙 테스트
  - `placeBid`, `awardPlayer`, `draftPlayer`
- direct bid 테스트
  - `placeBidDirect` 우선 호출
  - direct 실패 시 Server Action fallback
  - optimistic timer/liveBid rollback
- direct bid 관측 보강
  - direct commit event id를 응답/marker에 연결할지 결정
  - direct path와 fallback path의 latency marker 의미 분리
- 훅/유틸 테스트
  - stale revision 무시
  - `BID_PLACED` 타이머/입찰 반영
  - time-based expiry wake-up
  - recovery key 중복 방지
- 멀티클라이언트 E2E
  - 막판 `1초 미만` 입찰 연장
  - 일반 경매 `10초` 시작 / 재경매 `5초` 시작 동기화
  - 낙찰/유찰 후 화면 일치
  - representative bid `500ms` 회귀는 DOM 변화와 latency marker를 같이 확인
  - production-path 회귀는 `client-response -> rtdb` 또는 `client-response -> room-fallback`의 동일 `eventId`를 확인

## Change Policy

아래 변경은 이 문서를 같이 수정해야 한다.

- auction event 타입 추가/삭제
- `revision` 생성 규칙 변경
- 클라이언트 optimistic 범위 변경
- multi-client recovery 정책 변경
- organizer presence pause/resume 정책 변경
- 파생 상태 계산 규칙 변경
- direct bid rules 또는 custom token claim 변경
