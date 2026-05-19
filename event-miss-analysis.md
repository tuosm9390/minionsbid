# RTDB 이벤트 유실(Event Miss) 버그 분석 보고서

작성일: 2026-05-18  
분석 범위: `applyAuctionEventToState`, RTDB 구독 구조, 테스트 커버리지

---

## 배경: 이번에 수정한 버그의 구조

Firebase RTDB는 `signals/{roomId}/auctionEvent` **단일 노드**를 매 이벤트마다 덮어쓴다. 새 값이 이전 값을 완전히 교체하므로, 잠시 연결이 끊기거나 Firebase 내부 타이밍 경쟁이 발생하면 클라이언트는 중간 이벤트를 영영 수신하지 못한다.

이번에 수정한 버그는 다음 흐름에서 발생했다.

```
LOTTERY_DRAWN   → (클라이언트가 수신)
LOTTERY_CLOSED  → (유실 — 덮어쓰기로 사라짐)
AUCTION_STARTED → (클라이언트가 수신)
```

클라이언트는 `LOTTERY_CLOSED`를 수신하지 못했기 때문에 `lotteryPlayer`가 null로 초기화되지 않았다.  
`AUCTION_STARTED` 핸들러가 `lotteryPlayer`를 건드리지 않았으므로, 추첨 패널이 영구적으로 고착됐다.

**수정 내용:**  
- `AUCTION_STARTED`/`AUCTION_RESUMED` 케이스에 `nextLotteryPlayer = null` 추가  
- `handleStart`에 낙관적 `setLotteryPlayer(null)` 추가 (이중 복구 경로)

이 패턴은 `applyAuctionEventToState`의 구조적 취약점에서 기인한다.  
**각 이벤트는 자신이 담당하는 필드만 선언하고, 나머지는 이전 상태를 그대로 이어받는다.**  
중간 이벤트 유실 시 stale 필드가 조용히 앞으로 전파된다.

---

## 위험 목록

### 위험 1 — `liveBid` 이전 플레이어 값 유지 (심각도: HIGH)

**유실될 중간 이벤트:** `PLAYER_AWARDED` / `PLAYER_UNSOLD`  
**영향받는 후속 이벤트:** `LOTTERY_DRAWN`, `AUCTION_STARTED`, `AUCTION_RESUMED`, `RE_AUCTION_STARTED`

이들 이벤트는 `liveBid`를 명시적으로 null로 초기화하지 않는다.  
직전 플레이어의 `liveBid`가 다음 플레이어 경매에도 남아 있으면:

- `AuctionBoard`의 최고 입찰가·선두팀 표시가 이전 플레이어 값을 보여줌
- 재경매(`RE_AUCTION_STARTED`)에서 동일 player_id가 재등장하면 stale 입찰 금액이 현재 선두로 오인됨
- 다음 `BID_PLACED`가 도착하면 자연 복구되지만, 무입찰 종료 시까지 UI가 오염됨

**권고 수정:** `LOTTERY_DRAWN`, `AUCTION_STARTED`, `AUCTION_RESUMED`, `RE_AUCTION_STARTED`, `SEALED_BID_STARTED`, `SEALED_BID_REBID_STARTED` 케이스에 `nextLiveBid = null` 추가.

---

### 위험 2 — `timerEndsAt` 이전 라운드 값 유지 (심각도: HIGH)

**유실될 중간 이벤트:** `PLAYER_AWARDED` / `PLAYER_UNSOLD` / `SEALED_BID_LOCKED` / `SEALED_BID_AWARDED`  
**영향받는 후속 이벤트:** `LOTTERY_DRAWN`, `RE_AUCTION_STARTED`

이들 이벤트는 `timerEndsAt`을 건드리지 않는다.  
이전 라운드의 미래 시각이 남아 있으면:

- `isAuctionActive = true`로 계산되어 추첨 화면에서도 입찰 버튼이 활성화됨
- `useAuctionControl`의 자동 낙찰 타이머가 잘못된 시각 기준으로 재시동될 수 있음

**권고 수정:** `LOTTERY_DRAWN`과 `RE_AUCTION_STARTED` 케이스에 `nextTimerEndsAt = null` 추가.

---

### 위험 3 — `sealedBid.phase = 'REVEALING'` 유령 상태 (심각도: HIGH)

**유실될 중간 이벤트:** `SEALED_BID_AWARDED`  
**영향받는 후속 이벤트:** `LOTTERY_DRAWN`, `AUCTION_STARTED` (비밀 입찰이 아닌 일반 경매로 전환 시)

`LOTTERY_DRAWN`은 `sealedBid`를 전혀 건드리지 않는다.  
이전 라운드의 `phase: 'REVEALING'`, `revealResult`, `tiedTeamIds`가 그대로 남으면:

- `SealedBidBoard`가 새 플레이어에게 이전 라운드의 카드 공개 화면을 렌더링함
- `SealedBiddingControl`이 ACTIVE 입찰 중에도 reveal-pending 비활성 상태를 표시함
- 팀장이 입찰 자체를 할 수 없는 완전히 망가진 UI

**권고 수정:** 비밀 입찰 관련이 아닌 이벤트(`LOTTERY_DRAWN`, `LOTTERY_CLOSED`, `AUCTION_STARTED`, `AUCTION_RESUMED`, `BID_PLACED`, `RE_AUCTION_STARTED`)를 처리할 때 `nextSealedBid`를 cleared shape으로 초기화.

```typescript
const CLEARED_SEALED_BID = {
  phase: null,
  roundId: null,
  revealResult: [],
  revealOrder: [],
  tiedTeamIds: [],
  highestAmount: 0,
}
```

---

### 위험 4 — `sealedBid` 서브필드 이전 라운드 데이터 잔류 (심각도: MEDIUM)

**조건:** `SEALED_BID_STARTED` 이벤트 페이로드에서 `revealResult`/`revealOrder`/`tiedTeamIds`를 명시적으로 포함하지 않을 경우

`applyAuctionEventToState`의 `SEALED_BID_STARTED`/`SEALED_BID_REBID_STARTED` 케이스는 `...event.sealedBid`를 spread한다. 서버가 이 필드들을 항상 포함하면 자연 복구되지만, 하나라도 누락되면 이전 라운드 값이 유지된다.

**권고 수정:** spread 전에 방어적 초기화를 먼저 적용.

```typescript
case 'SEALED_BID_STARTED':
case 'SEALED_BID_REBID_STARTED':
  nextSealedBid = {
    ...nextSealedBid,
    revealResult: [],   // 방어적 초기화
    revealOrder: [],
    tiedTeamIds: [],
    highestAmount: 0,
    ...event.sealedBid, // 서버 페이로드로 덮어씀
    phase: 'ACTIVE',
  }
  break
```

---

### 위험 5 — `isReAuctionRound` 비동기 (심각도: MEDIUM)

**유실될 중간 이벤트:** `RE_AUCTION_STARTED`  
**영향:** 재경매 라운드임에도 `isReAuctionRound = false`로 남음

`RoomClient.tsx`의 `handleStart`는 `nextAuctionDurationMs ?? AUCTION_DURATION_MS`를 낙관적 타이머로 사용한다. `nextAuctionDurationMs`는 Firestore room 스냅샷에서 오므로 실제 타이머 서버 연산은 정확하다. 하지만 클라이언트 측 UI 힌트(재경매 배지 등)는 잘못 표시될 수 있다.

**권고:** `isReAuctionRound`를 이벤트 state machine 대신 Firestore `next_auction_duration_ms` 값으로 파생하거나, `RE_AUCTION_STARTED`/`AUCTION_STARTED` 이벤트 페이로드에 명시적 플래그를 포함.

---

### 위험 6 — 시스템적 근본 원인: 히스토리 재전송이 낮은 revision을 복구 못함 (심각도: HIGH)

`useAuctionRealtime.ts:662-672`의 `applyAuctionEventHistory`는 `revision > state.auctionEventRevision`인 이벤트만 적용한다.

```
overwriting node 리스너가 AUCTION_STARTED(revision=5)를 먼저 수신
  → auctionEventRevision = 5로 증가
history 컬렉션 리스너가 LOTTERY_CLOSED(revision=4)를 재전송
  → revision 4 <= 5이므로 필터링으로 제거됨
```

**히스토리 채널은 이 시나리오에서 안전망이 되지 못한다.** 이 때문에 위험 1~4의 방어적 초기화(각 이벤트가 도달 시 관련 필드를 명시적으로 선언)가 필수다.

---

## 테스트 커버리지 분석

### 현재 테스트의 구조적 한계

`__tests__/auctionRealtimeUtils.test.ts`의 `createBaseState()`는 항상 `lotteryPlayer: null`, `liveBid: null`로 초기화한다. 이 때문에 모든 기존 테스트는 "깨끗한 상태에서 이벤트 적용" 시나리오만 검증한다. 이번에 수정한 `nextLotteryPlayer = null` 코드 라인은 기존 테스트에서도 실행되지만, 이미 null이라 관찰 불가능하다 — 즉 회귀 보호가 없다.

### 부재하는 테스트 시나리오

| 시나리오 | 현재 테스트 | 필요 여부 |
|---|---|---|
| `AUCTION_STARTED`를 `lotteryPlayer` 비null 상태에서 적용 | 없음 | 필수 (이번 수정의 회귀 방지) |
| `PLAYER_AWARDED`를 `liveBid` 비null 상태에서 적용 | 없음 | 필수 |
| `PLAYER_UNSOLD`를 `liveBid` 비null 상태에서 적용 | 없음 | 필수 |
| `SEALED_BID_LOCKED`를 `liveBid` 비null 상태에서 적용 | 없음 | 권장 |
| `SEALED_BID_STARTED`를 `liveBid` 비null 상태에서 적용 | 페이로드 억제만 테스트, state 초기화 미검증 | 권장 |
| `RE_AUCTION_STARTED`에 빈 `playerIdsToWaiting` | 없음 | 권장 |
| `LOTTERY_DRAWN` 후 `timerEndsAt` null 초기화 | 없음 | 권장 |
| `SEALED_BID_AWARDED` 유실 후 `LOTTERY_DRAWN` 적용 시 sealedBid 정리 | 없음 | 필수 (위험 3) |

### 추가해야 할 테스트 코드

```typescript
// __tests__/auctionRealtimeUtils.test.ts 에 추가

it('AUCTION_STARTED는 stale lotteryPlayer를 null로 초기화한다 (missed LOTTERY_CLOSED 회귀 방지)', () => {
  const state: AuctionRealtimeStateSlice = {
    ...createBaseState(),
    lotteryPlayer: createBaseState().players[0] as Player,
  }
  const result = applyAuctionEventToState(
    state,
    createEvent({ type: 'AUCTION_STARTED', timerEndsAt: '2026-04-29T00:00:10.000Z', currentPlayerId: 'player-1' }),
  )
  expect(result.applied).toBe(true)
  expect(result.lotteryPlayer).toBeNull()
})

it('AUCTION_RESUMED도 stale lotteryPlayer를 null로 초기화한다', () => {
  const state: AuctionRealtimeStateSlice = {
    ...createBaseState(),
    lotteryPlayer: createBaseState().players[0] as Player,
  }
  const result = applyAuctionEventToState(
    state,
    createEvent({ type: 'AUCTION_RESUMED', timerEndsAt: '2026-04-29T00:00:10.000Z' }),
  )
  expect(result.lotteryPlayer).toBeNull()
})

it('PLAYER_AWARDED는 stale liveBid를 null로 초기화한다 (missed BID_PLACED 시뮬레이션)', () => {
  const state: AuctionRealtimeStateSlice = {
    ...createBaseState(),
    liveBid: { player_id: 'player-1', team_id: 'team-1', amount: 150, created_at: '' },
  }
  const result = applyAuctionEventToState(
    state,
    createEvent({ type: 'PLAYER_AWARDED', currentPlayerId: null, timerEndsAt: null }),
  )
  expect(result.liveBid).toBeNull()
  expect(result.currentPlayerId).toBeNull()
  expect(result.timerEndsAt).toBeNull()
})

it('PLAYER_UNSOLD도 stale liveBid를 null로 초기화한다', () => {
  const state: AuctionRealtimeStateSlice = {
    ...createBaseState(),
    liveBid: { player_id: 'player-1', team_id: 'team-1', amount: 100, created_at: '' },
  }
  const result = applyAuctionEventToState(
    state,
    createEvent({ type: 'PLAYER_UNSOLD', currentPlayerId: null, timerEndsAt: null }),
  )
  expect(result.liveBid).toBeNull()
})
```

---

## 위험 요약표

| # | 필드 | 유실 이벤트 | 영향 | 심각도 | 수정 난이도 |
|---|---|---|---|---|---|
| 1 | `liveBid` | `PLAYER_AWARDED`/`UNSOLD` | 이전 입찰가/선두팀 표시 오염 | HIGH | 낮음 |
| 2 | `timerEndsAt` | 동일 | 추첨 중 입찰 버튼 활성화 | HIGH | 낮음 |
| 3 | `sealedBid.phase` + sub-fields | `SEALED_BID_AWARDED` | 이전 라운드 카드 공개 화면 고착 | HIGH | 중간 |
| 4 | `sealedBid` sub-fields | 이벤트 페이로드 누락 시 | 부분적 stale 데이터 | MEDIUM | 낮음 |
| 5 | `isReAuctionRound` | `RE_AUCTION_STARTED` | 타이머 힌트 오류 (서버는 정확) | MEDIUM | 중간 |
| 6 | 히스토리 재전송 | 구조적 | 낮은 revision 이벤트 영구 소실 | HIGH (systemic) | 높음 |

---

## 권고 우선순위

### ✅ 적용 완료

- [x] 위험 1 — `liveBid` 유실: `LOTTERY_DRAWN`, `AUCTION_STARTED`, `AUCTION_RESUMED`, `RE_AUCTION_STARTED` 케이스에서 `nextLiveBid = null` 추가
- [x] 위험 2 — `timerEndsAt` 유실: `LOTTERY_DRAWN`, `RE_AUCTION_STARTED` 케이스에서 `nextTimerEndsAt = null` 추가
- [x] 위험 3 — `sealedBid.phase` 고착: `LOTTERY_DRAWN`, `AUCTION_STARTED`, `AUCTION_RESUMED`, `RE_AUCTION_STARTED` 케이스에서 `SEALED_BID_CLEARED` shape으로 초기화
- [x] 위험 4 — `sealedBid` 서브필드 잔류: `SEALED_BID_STARTED`/`SEALED_BID_REBID_STARTED` 케이스에서 `event.sealedBid` spread 전 방어적 초기화
- [x] 테스트 4개 추가 — `AUCTION_STARTED`/`AUCTION_RESUMED` stale lotteryPlayer, `PLAYER_AWARDED`/`PLAYER_UNSOLD` stale liveBid 회귀 방지

### ✅ 추가 적용 완료

- [x] 위험 5 — `isReAuctionRound` 비동기: `selectIsReAuctionRound = s.nextAuctionDurationMs !== null` 선택자로 대체, Firestore `onSnapshot` 기반이라 이벤트 유실 무관
- [x] 위험 6 (systemic) — Strategy A 적용:
  - **클라이언트 init gate**: history 컬렉션 재전송 완료 후 overwrite-node 이벤트 처리 (`historyReadyRef` + `pendingAuctionEventRef`)
  - **서버 prune**: `PLAYER_AWARDED`/`SEALED_BID_AWARDED` 발행 후 낮은 revision의 `auctionEvents` 항목 일괄 삭제 (fire-and-forget)
