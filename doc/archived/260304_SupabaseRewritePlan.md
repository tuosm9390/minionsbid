# 경매 시스템 전면 재작성 — 구현 계획서

> 작성일: 2026-03-04
> 상태: **대기 중 (내일 작업 예정)**

---

## Context

### 현재 문제
- Supabase postgres_changes CDC 기반 실시간 통신이 2~3초 지연 (REPLICA IDENTITY FULL 미적용, 마이그레이션 미실행 등 설정 문제 중첩)
- 기존 코드에 보안 패치, 폴링 fallback, 에러 처리 등이 누적되어 복잡도가 과도하게 증가
- 사용자 요청: **경매 링크 생성 이후의 모든 로직을 삭제하고, DB 포함 전부 새로 작성**

#### 분석으로 확인된 3대 설계 결함 (2026-03-04 Realtime 분석 보고서)

| # | 결함 | 현황 | 영향 |
|---|------|------|------|
| 1 | **채널 다중화 실패** | 사용자 1명당 3개 채널 (room-data + presence + lottery) | 참여자 N명 → `3×N`개 WebSocket 채널. Supabase 채널 상한 근접 위험 |
| 2 | **fetchAll 과적합** | INSERT/DELETE 이벤트마다 5개 테이블 전체 재조회 | payload에 변경 레코드가 이미 포함되어 있음에도 불필요한 전체 재fetch |
| 3 | **3초 폴링 상시 가동** | WebSocket 정상 여부 무관하게 항상 실행 | 참여자 10명 기준 분당 200회 불필요한 DB 쿼리 |

### 목표
- **실시간 통신을 Broadcast 기반으로 전환** — CDC 지연(300ms~2s) 대신 Broadcast(<100ms)로 즉시 반영
- DB 스키마를 처음부터 REPLICA IDENTITY FULL + publication 포함하여 깨끗하게 재생성
- 코드 복잡도 최소화 (지인용 내부 툴 — 엄격한 보안 불필요)

### 핵심 설계 원칙
- **Broadcast-primary**: Server Action이 DB 쓰기 완료 후 즉시 Broadcast REST API로 전체 클라이언트에 이벤트 전파
- **DB는 영속성 전용**: 초기 로드 + 재접속 시 상태 복원용. 실시간 업데이트는 Broadcast가 담당
- **postgres_changes 제거**: CDC 구독 완전 제거. Broadcast + 초기 fetch로 단순화
- **보안 최소화**: 토큰 검증 없음, RLS는 anon SELECT 전면 허용, 쓰기는 service_role 전용

---

## 실시간 통신 아키텍처 (핵심 변경)

### 메커니즘별 특성 비교

| 메커니즘 | 지연 | 영속성 | 적합한 용도 |
|---------|------|--------|-----------|
| **postgres_changes (CDC)** | 300ms ~ 2,000ms | DB 커밋 완료 보장 | 감사 로그, 외부 연동 |
| **Broadcast** | < 100ms | 최선형 전달 (비영속) | 실시간 상태 동기화, 게임 이벤트 |
| **Presence** | heartbeat 30~60s | 채널 내 상태 공유 | 접속자 현황 |

**결론**: 경매 시스템의 핵심 요구사항("입찰/낙찰/타이머를 모든 탭에서 즉시 동기화")은 Broadcast 영역이 최적. CDC는 DB 영속성은 보장하지만 경매 UX에 필요한 속도를 제공하지 못함.

### 기존 (postgres_changes CDC)
```
Server Action → DB write → WAL → Supabase CDC Engine → WebSocket → Client
                                  (300ms ~ 2000ms 지연)
```

### 신규 (Broadcast-primary)
```
Server Action → DB write
             → Broadcast REST API → Supabase Realtime → WebSocket → All Clients
                                    (<100ms 지연)
```

### Server-side Broadcast 구현 방식

`src/lib/supabase-server.ts`에 `broadcastEvent` 헬퍼 추가:

```typescript
export async function broadcastEvent(roomId: string, event: string, payload: object) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ topic: `realtime:auction-${roomId}`, event, payload }]
    })
  })
}
```

### Client-side 구독

`useAuctionRealtime.ts`에서 단일 Broadcast 채널 구독:

```typescript
const channel = supabase.channel(`auction-${roomId}`)
  .on('broadcast', { event: 'STATE_UPDATE' }, ({ payload }) => {
    // payload에 변경된 상태를 merge
    setRealtimeData(payload)
  })
  .subscribe()
```

### Broadcast 이벤트 목록

단일 `STATE_UPDATE` 이벤트로 통일. Server Action이 DB 쓰기 후 전체 room 상태를 payload에 담아 broadcast.
클라이언트는 `setRealtimeData(payload)`로 Zustand store에 merge.

### fetchRoomState 내부 헬퍼 패턴

```typescript
// 각 Server Action 끝에:
const fullState = await fetchRoomState(db, roomId)
await broadcastEvent(roomId, 'STATE_UPDATE', fullState)
return { ...result }
```

```typescript
async function fetchRoomState(db, roomId) {
  const [room, teams, players, bids, messages] = await Promise.all([...])
  return { timerEndsAt, teams, players, bids, messages, ... }
}
```

---

## Phase 0: DB 스키마 재설계

### 마이그레이션 파일: `supabase/migrations/00001_full_schema.sql`

기존 마이그레이션 7개를 **단일 파일**로 통합. Supabase SQL Editor에서 기존 테이블 DROP 후 실행.

```sql
-- ── 테이블 생성 ──
CREATE TABLE rooms ( ... );       -- 기존과 동일한 컬럼 구조
CREATE TABLE teams ( ... );       -- 기존과 동일
CREATE TABLE players ( ... );     -- 기존과 동일
CREATE TABLE bids ( ... );        -- 기존과 동일
CREATE TABLE messages ( ... );    -- 기존과 동일
CREATE TABLE auction_archives ( ... );  -- 기존과 동일

-- ── REPLICA IDENTITY FULL (처음부터 설정) ──
ALTER TABLE rooms    REPLICA IDENTITY FULL;
ALTER TABLE teams    REPLICA IDENTITY FULL;
ALTER TABLE players  REPLICA IDENTITY FULL;
ALTER TABLE bids     REPLICA IDENTITY FULL;
ALTER TABLE messages REPLICA IDENTITY FULL;

-- ── supabase_realtime publication ──
ALTER PUBLICATION supabase_realtime ADD TABLE rooms, teams, players, bids, messages;

-- ── RLS: anon SELECT 전면 허용, 쓰기는 service_role 전용 ──
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
-- (6개 테이블 모두 동일 패턴)
CREATE POLICY "anon_select" ON rooms FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE 정책 없음 → anon 차단, service_role 우회
```

### 마이그레이션 파일: `supabase/migrations/00002_award_player_atomic.sql`

기존 `00011_award_player_atomic.sql`과 동일한 RPC 함수. 변경 없음.

---

## Phase 1: 삭제 범위

### 유지할 파일 (수정 없음 또는 import 경로만 조정)

| 파일 | 비고 |
|------|------|
| `src/app/page.tsx` | 홈 페이지 (경매 로직 무관) |
| `src/app/layout.tsx` | 메타데이터, CSP |
| `src/app/globals.css` | Tailwind 테마 |
| `src/components/ArchiveModalWrapper.tsx` | 단순 래퍼 |
| `src/lib/supabase.ts` | anon 클라이언트 (변경 없음) |
| `src/lib/utils.ts` | cn() 유틸리티 |
| `src/middleware.ts` | CSP nonce |

### 유지하되 import 경로 조정 필요

| 파일 | 변경 사항 |
|------|----------|
| `src/components/CreateRoomModal.tsx` | `createRoomAction` import 경로 확인 |
| `src/components/AuctionArchiveSection.tsx` | `ArchiveTeam` 타입 import 경로 확인 |

### 삭제 후 재작성할 파일

| 파일 | 재작성 대상 |
|------|-----------|
| `src/features/auction/api/auctionActions.ts` | Server Actions 전체 재작성 (+ broadcastEvent 호출 추가) |
| `src/features/auction/store/useAuctionStore.ts` | Zustand store 재작성 |
| `src/features/auction/hooks/useAuctionRealtime.ts` | Broadcast 구독 기반으로 재작성 |
| `src/features/auction/hooks/useAuctionControl.ts` | 타이머 만료 자동 낙찰 로직 재작성 |
| `src/features/auction/hooks/useRoomAuth.ts` | 단순화 (기존과 유사) |
| `src/features/auction/components/AuctionBoard.tsx` | 경매 보드 UI 재작성 |
| `src/features/auction/components/BiddingControl.tsx` | 입찰 UI 재작성 |
| `src/features/auction/components/ChatPanel.tsx` | 채팅 재작성 |
| `src/features/auction/components/TeamList.tsx` | 팀 현황 재작성 |
| `src/features/auction/components/LinksModal.tsx` | 링크 모달 재작성 |
| `src/features/auction/components/EndRoomModal.tsx` | 종료 모달 재작성 |
| `src/features/auction/components/AuctionResultModal.tsx` | 결과 모달 재작성 |
| `src/features/auction/components/LotteryAnimation.tsx` | 추첨 애니메이션 재작성 |
| `src/features/auction/components/HowToUseModal.tsx` | 사용법 모달 재작성 |
| `src/app/room/[id]/page.tsx` | Server Component 재작성 |
| `src/app/room/[id]/RoomClient.tsx` | 메인 Client Component 재작성 |
| `src/app/api/room-auth/route.ts` | Auth Route Handler 재작성 |
| `src/lib/supabase-server.ts` | `broadcastEvent` 헬퍼 추가 |
| `supabase/migrations/*` | 기존 11개 삭제 → 2개 신규 |

---

## Phase 2: 핵심 인프라 재작성

### Step 2-1: `supabase-server.ts` — broadcastEvent 추가

기존 `getServerClient()` 유지 + `broadcastEvent(roomId, event, payload)` 함수 추가.

### Step 2-2: `useAuctionStore.ts` — Zustand store 재작성

기존과 동일한 타입/상태 구조 유지. 변경점:
- 불필요한 상태 제거 (`hasPlayedReadyAnimation` 등은 로컬 컴포넌트 상태로 이동)
- `setRealtimeData`는 기존 merge 패턴 유지: `set(state => ({ ...state, ...data, isRoomLoaded: true }))`

### Step 2-3: `auctionActions.ts` — Server Actions 재작성

각 Server Action의 패턴:
```typescript
export async function someAction(roomId: string, ...args) {
  const db = getServerClient()
  // 1. DB 쓰기 (검증 포함)
  // 2. fetchRoomState로 전체 상태 조회
  // 3. broadcastEvent(roomId, 'STATE_UPDATE', fullState)
  // 4. 반환
}
```

**함수 목록**:

| 함수 | 기능 | Broadcast payload |
|------|------|------------------|
| `createRoom(payload)` | 방+팀+선수 생성 | 없음 (방 생성 시점에 구독자 없음) |
| `drawNextPlayer(roomId)` | 랜덤 WAITING → IN_AUCTION | 전체 상태 |
| `startAuction(roomId, durationMs?)` | timer_ends_at 설정 | 전체 상태 |
| `placeBid(roomId, playerId, teamId, amount)` | 입찰 + 타이머 연장 | 전체 상태 |
| `awardPlayer(roomId, playerId)` | 낙찰/유찰 (RPC) | 전체 상태 |
| `pauseAuction(roomId)` | 타이머 null | 전체 상태 |
| `resumeAuction(roomId)` | 타이머 재설정 | 전체 상태 |
| `draftPlayer(roomId, playerId, teamId)` | 자유계약 배정 | 전체 상태 |
| `restartAuctionWithUnsold(roomId)` | UNSOLD → WAITING 재경매 | 전체 상태 |
| `sendChatMessage(roomId, ...)` | 채팅 | 전체 상태 |
| `sendNotice(roomId, content)` | 공지 | 전체 상태 |
| `deleteRoom(roomId)` | 방 삭제 | `{ roomDeleted: true }` |
| `saveAuctionArchive(payload)` | 결과 저장 | 없음 |

### Step 2-4: `useAuctionRealtime.ts` — Broadcast 구독

#### 단일 채널 다중화 패턴

기존 3개 채널(room-data + presence + lottery) → **`auction-${roomId}` 단일 채널**로 통합:

```typescript
export function useAuctionRealtime(roomId: string | null) {
  useEffect(() => {
    if (!roomId) return

    // 1. 초기 로드: DB에서 전체 상태 1회 읽기
    fetchAll()

    // 2. 단일 채널에 Broadcast + Presence 모두 수용 (채널 다중화)
    const channel = supabase
      .channel(`auction-${roomId}`)
      // Broadcast: 실시간 상태 동기화
      .on('broadcast', { event: 'STATE_UPDATE' }, ({ payload }) => {
        setRealtimeData(payload)
      })
      // Presence: 팀장 접속 현황 (기존과 동일)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setPresenceUsers(Object.values(state).flat() as unknown as PresenceUser[])
      })
      .subscribe((status) => {
        // 3. 재연결 시 fetchAll 1회 — 비연결 구간 동안 놓친 상태 복원
        if (status === 'SUBSCRIBED') fetchAll()
      })

    // 4. postgres_changes 제거 — Broadcast로 완전 대체
    // 5. 3초 폴링 제거 — Broadcast(<100ms)가 충분히 빠르므로 불필요
    //    (폴링 제거 근거: WebSocket 정상 시 분당 200회 불필요한 DB 쿼리 제거)

    return () => { supabase.removeChannel(channel) }
  }, [roomId])
}
```

#### payload merge 패턴 (INSERT/DELETE 처리)

Broadcast `STATE_UPDATE` payload에는 항상 **전체 room 상태**가 포함되므로, INSERT/DELETE 이벤트를 별도로 처리할 필요가 없다. `setRealtimeData(payload)`로 Zustand store를 통째로 merge:

```typescript
// ✅ 올바른 패턴: Broadcast payload로 전체 상태 교체
.on('broadcast', { event: 'STATE_UPDATE' }, ({ payload }) => {
  // payload = { timerEndsAt, teams, players, bids, messages, ... }
  setRealtimeData(payload)  // 전체 merge → INSERT/DELETE/UPDATE 모두 처리
})

// ❌ 제거: postgres_changes INSERT/DELETE마다 fetchAll() 전체 재조회
// 기존: players: INSERT/DELETE → fetchAll() (5개 테이블 전체 재fetch)
// 신규: Broadcast가 변경 후 즉시 전체 상태를 push하므로 별도 처리 불필요
```

#### 네트워크 단절 복구 방안

3초 폴링 제거 후 WebSocket 재연결 시 상태 복원:

```typescript
// subscribe 콜백에서 SUBSCRIBED 상태 감지 → fetchAll 1회
.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    // 재연결 완료 시점에 DB 상태를 1회 full fetch하여 gap 복원
    // Broadcast는 비영속이므로 비연결 구간 동안의 이벤트는 DB로만 복원 가능
    fetchAll()
  }
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    // 에러 상태 → Supabase 클라이언트가 자동 재연결 시도 (별도 처리 불필요)
    console.warn('[realtime] channel error, waiting for reconnect...')
  }
})
```

### Step 2-5: `useAuctionControl.ts` — 타이머 만료 자동 낙찰

기존과 동일한 로직:
- ORGANIZER 클라이언트만 `setTimeout(delay + 1500ms)` 후 `awardPlayer` 호출
- `awardLock` ref로 중복 방지
- **변경점**: `awardPlayer` 실패 시 `alert()` + 로깅 (기존 무음 처리 수정)

### Step 2-6: `useRoomAuth.ts` — 인증 훅

기존과 동일 (단순화된 상태):
- `setRoomContext(roomId, role, teamId)` 호출만 수행
- `effectiveRole = role`, `isTokenChecked = true` 즉시 반환

---

## Phase 3: UI 컴포넌트 재작성

### 재작성 원칙
- **기존 UI 디자인/레이아웃을 최대한 유지** (사용자가 익숙한 UI)
- 내부 로직만 Broadcast 기반으로 교체
- 불필요한 복잡도 제거 (showReadyAnim, isAutoDraftMode 등 단순화)

### 컴포넌트별 변경 요약

| 컴포넌트 | 핵심 변경 |
|----------|----------|
| `RoomClient.tsx` | 기존 구조 유지. `useAuctionRealtime` + `useAuctionControl` 호출. 역할별 UI 분기 동일. |
| `AuctionBoard.tsx` | 기존 UI 유지. Zustand store에서 상태 읽기 동일. |
| `BiddingControl.tsx` | 기존 UI 유지. `placeBid` Server Action 호출. |
| `ChatPanel.tsx` | `sendChatMessage` Server Action 호출. Broadcast로 메시지 수신. |
| `TeamList.tsx` | Zustand store에서 teams/players 읽기. 변경 없음에 가까움. |
| `LinksModal.tsx` | 기존과 동일 (store에서 token 읽기). |
| `EndRoomModal.tsx` | `saveAuctionArchive` + `deleteRoom` 호출. 기존 동일. |
| `AuctionResultModal.tsx` | 기존과 동일 (store에서 결과 읽기). |
| `LotteryAnimation.tsx` | Framer Motion 슬롯머신. 기존과 동일. |
| `HowToUseModal.tsx` | 정적 컨텐츠. 기존과 동일. |

### Auth / Route Handler

`/api/room-auth/route.ts`:
- 역할 쿠키 발급만 수행 (토큰 검증 없음 — 지인용 내부 툴)
- role 화이트리스트 검증만 유지
- 쿠키 패턴: `room_auth_{roomId}_{ROLE}` / `room_auth_{roomId}_LEADER_{teamId}`

`/room/[id]/page.tsx`:
- Server Component. URL params에서 role/teamId 읽어 쿠키 특정 → `RoomClient`로 전달

---

## Phase 4: 경매 흐름 검증 (요구사항 매핑)

| 요구사항 | 구현 방식 |
|---------|----------|
| 모든 팀장 참여 후 시작 | Presence 채널로 접속 현황 확인. `allConnected` 체크 |
| 모든 팀장 접속 시 주최자 시작 가능 | `allConnected && effectiveRole === 'ORGANIZER'` 일 때 추첨 버튼 활성화 |
| 선수 추첨 → 팀장 입찰 | `drawNextPlayer` → `startAuction` → `placeBid` 순서 |
| 10초 타이머 | `startAuction(roomId, 10000)` → `timer_ends_at = now + 10s` |
| 5초 이하 입찰 시 5초 리셋 | `placeBid`에서 remaining <= 5000ms이면 `timer_ends_at = now + 5s` |
| 낙찰 자동 배정 | `awardPlayer` RPC → SOLD + team_id + point 차감. Broadcast로 전파 |
| 실시간 동일 화면 | Broadcast `STATE_UPDATE` → 모든 클라이언트 동시 store 업데이트 |
| 드래프트/자유배정 | `AuctionBoard.tsx`의 phase 판단 로직 (RE_AUCTION vs DRAFT) |
| 최종 결과 확인 | `AuctionResultModal` + `saveAuctionArchive` |
| **네트워크 단절 복구** | 3초 폴링 제거 → WebSocket 재연결 시(`SUBSCRIBED` 이벤트) `fetchAll()` 1회 호출로 비연결 구간 state gap 복원. Broadcast 비영속 특성 보완. |
| **채널 오류 처리** | `CHANNEL_ERROR` / `TIMED_OUT` 상태 → Supabase 클라이언트 자동 재연결. 앱 레이어 별도 처리 불필요. 재연결 완료 후 `SUBSCRIBED` → `fetchAll()` 자동 실행. |

---

## 작업 순서 체크리스트

```
[x] Phase 0: DB 마이그레이션 SQL 2개 작성 (2026-03-04)
    [x] 00100_full_schema.sql — 기존 7개 통합 (REPLICA IDENTITY + RLS SELECT-only 포함)
    [x] 00101_award_player_atomic.sql — 낙찰 원자 RPC
    [x] Supabase SQL Editor에서 기존 테이블 DROP 후 실행 ✅ 완료 (2026-03-04)

[x] Phase 2-1: supabase-server.ts — broadcastEvent 헬퍼 추가 (2026-03-04)
[x] Phase 2-2: useAuctionStore.ts 재작성 (lotteryPlayer 추가, addBid/addMessage/updatePlayer/updateTeam/hasPlayedReadyAnimation 제거)
[x] Phase 2-3: auctionActions.ts 재작성 (fetchRoomState + broadcastState 호출, closeLotteryAction 신규)
[x] Phase 2-4: useAuctionRealtime.ts 재작성 (단일 채널, 폴링 제거, STATE_UPDATE + CLOSE_LOTTERY + Presence)
[x] Phase 2-5: useAuctionControl.ts 재작성 (lottery 채널 제거, store lotteryPlayer 사용)
[x] Phase 2-6: useRoomAuth.ts — 변경 없음 (이미 단순화 완료)

[x] Phase 3: UI 컴포넌트 업데이트 (2026-03-04)
    [x] RoomClient.tsx — lotteryPlayer를 store에서 읽음, setLotteryPlayer 제거
    [x] AuctionBoard.tsx — hasPlayedReadyAnimation을 로컬 useState로 전환
    [~] 나머지 컴포넌트 — 기존 코드 그대로 사용 가능 (import 경로 변경 없음)

[x] 빌드 검증: npm run build — TypeScript 에러 없음 (2026-03-04)
[x] Supabase SQL Editor 수동 실행 (00100 + 00101) ✅ 완료 (2026-03-04)
[ ] E2E 수동 테스트
[ ] 커밋
```

---

## 검증 방법

1. **빌드 검증**: `npm run build` — TypeScript 에러 없음
2. **Supabase 설정**: SQL Editor에서 `00001_full_schema.sql` + `00002_award_player_atomic.sql` 실행
3. **E2E 수동 테스트**:
   - 방 생성 → 링크 발급 → 주최자/팀장 접속
   - 모든 팀장 접속 시 "모든 준비 완료" 표시
   - 추첨 → 경매 시작 → 입찰 → **다른 탭에서 즉시 반영 확인** (2~3초 지연 없어야 함)
   - 5초 이하 입찰 시 타이머 5초 리셋 확인
   - 타이머 만료 → 자동 낙찰 → 팀 배정 확인
   - 유찰 → 재경매/드래프트 흐름
   - 경매 완료 → 결과 확인 → 방 종료
