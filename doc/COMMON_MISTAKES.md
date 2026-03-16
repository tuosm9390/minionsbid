# 🚨 COMMON_MISTAKES.md — 반복하지 말아야 할 실수 & 교훈

> 이 문서는 실제 버그 해결 과정에서 발견된 구조적 실수와 교훈을 기록한다.
> 새로운 기능을 구현하거나 코드를 수정하기 전에 반드시 읽어라.

---

## CASE 1 — 쿠키 이름 충돌: 동일 브라우저 다중 역할 덮어쓰기

### 🔴 이슈 요약 (The Problem)

같은 브라우저에서 여러 팀장이 각자의 초대 링크를 열면, 새 탭이 열릴 때마다 이전 탭의 쿠키가 덮어씌워졌다. 팀A 팀장이 먼저 입장하고 팀B 팀장이 입장하면, 팀A 탭이 갑자기 팀B로 인식되는 현상 발생.

**영향 파일**: `src/app/api/room-auth/route.ts`, `src/app/room/[id]/page.tsx`

### ❌ 실패한 접근법 (What didn't work)

쿠키 이름을 `room_auth_{roomId}` 하나로 고정한 설계. 방(roomId)별로는 분리되지만, **같은 방 안에서 모든 역할(ORGANIZER/LEADER/VIEWER)이 동일한 이름을 공유**했다.

```
room_auth_abc123 = { role: "LEADER", teamId: "team-A" }
// 팀B 팀장이 입장 시 →
room_auth_abc123 = { role: "LEADER", teamId: "team-B" }  // 팀A 데이터 소멸
```

브라우저는 같은 도메인+path+이름의 쿠키를 하나만 유지한다. 쿠키의 `path: '/'`라는 광역 설정이 덮어쓰기를 더욱 쉽게 만들었다.

**Root Cause**: 쿠키 격리 단위가 "방(roomId)" 수준에서 끝났고, "방 안의 역할+팀" 수준으로 내려가지 않았다.

### ✅ 최종 해결책 (What worked)

역할+팀ID별 고유 쿠키 이름 + 리다이렉트 URL에 role/teamId 포함.

```typescript
// route.ts — 쿠키 이름을 역할+팀ID로 고유화
const cookieSuffix =
  role === "LEADER" && teamId ? `LEADER_${teamId}` : role.toUpperCase();
const cookieName = `room_auth_${roomId}_${cookieSuffix}`;
// 예) room_auth_abc123_LEADER_team-A, room_auth_abc123_LEADER_team-B

// 리다이렉트 URL에 role/teamId 포함 → page.tsx가 어떤 쿠키를 읽을지 특정 가능
const redirectUrl = new URL(`/room/${roomId}`, request.url);
redirectUrl.searchParams.set("role", role);
if (role === "LEADER" && teamId) redirectUrl.searchParams.set("teamId", teamId);
```

```typescript
// page.tsx — URL searchParams로 쿠키 이름 결정
const cookieSuffix =
  roleParam === "LEADER" && teamIdParam
    ? `LEADER_${teamIdParam}`
    : roleParam.toUpperCase();
const cookieName = `room_auth_${roomId}_${cookieSuffix}`;
const authCookie = cookieStore.get(cookieName);
```

### 📌 AI 행동 지침 (Lessons Learned & New Rules)

> **쿠키, localStorage, sessionStorage 등 브라우저 저장소의 Key(이름)를 설계할 때는 "같은 브라우저에서 동시에 존재할 수 있는 모든 경우의 수"를 기준으로 고유성을 보장해야 한다. 역할·사용자·팀 등 구체적인 식별자가 다르다면 Key도 달라야 한다.**

---

## CASE 2 — Server Action "Fire and Forget": 실시간 UI 지연 버그

### 🔴 이슈 요약 (The Problem)

1. ORGANIZER가 "▶ 경매 시작" 버튼을 누른 후 타이머 UI가 나타나기까지 300~600ms의 공백이 존재했다. 그 사이 DB에서는 이미 타이머가 카운트다운 중이었지만 UI는 여전히 "경매 준비중..." 상태.
2. 팀장이 입찰 후 타이머가 5초로 연장될 때도 같은 지연이 발생. 입찰 버튼을 눌렀는데 UI 반응이 느림.

**영향 파일**: `src/features/auction/api/auctionActions.ts`, `src/app/room/[id]/RoomClient.tsx`, `src/features/auction/components/BiddingControl.tsx`

### ❌ 실패한 접근법 (What didn't work)

모든 Server Action이 `{ error?: string }`만 반환하고, 클라이언트는 DB 변경을 Supabase 실시간 이벤트로만 인지하는 구조.

```typescript
// ❌ 잘못된 패턴 — 클라이언트가 WebSocket 이벤트만 믿음
export async function startAuction(
  roomId: string,
): Promise<{ error?: string }> {
  const timerEndsAt = new Date(Date.now() + 10000).toISOString();
  await db.update({ timer_ends_at: timerEndsAt });
  return {}; // 클라이언트는 여기서 아무것도 모름
}
// 클라이언트는 DB → CDC → WebSocket → 클라이언트 경로(300~600ms)를 기다려야 함
```

**Root Cause**: Server Action은 DB에 이미 쓴 값을 알고 있는데, 그 값을 반환하지 않고 버렸다. 클라이언트는 다시 Supabase 실시간 구독을 통해 간접적으로 같은 값을 받아야 했다. 불필요한 왕복(round-trip) 지연이 경매 타이머처럼 ms 단위가 중요한 UI에서 체감 버그로 나타났다.

### ✅ 최종 해결책 (What worked)

Server Action이 DB에 저장한 값을 반환값에 포함. 클라이언트는 실시간 이벤트를 기다리지 않고 즉시 Store 업데이트(Optimistic Update).

```typescript
// ✅ 올바른 패턴 — Server Action이 변경된 값을 함께 반환
export async function startAuction(
  roomId: string,
  durationMs?: number
): Promise<{ error?: string; timerEndsAt?: string }> {
  const timerEndsAt = new Date(Date.now() + duration).toISOString()
  await db.update({ timer_ends_at: timerEndsAt })
  return { timerEndsAt }  // 실제 DB에 저장된 값을 그대로 반환
}

export async function placeBid(
  ...
): Promise<{ error?: string; newTimerEndsAt?: string }> {
  // ... 입찰 처리 후 타이머 연장 시
  newTimerEndsAt = new Date(Date.now() + EXTEND_DURATION_MS).toISOString()
  await db.update({ timer_ends_at: newTimerEndsAt })
  return { newTimerEndsAt }
}
```

```typescript
// RoomClient.tsx — 반환값으로 즉시 Store 업데이트
const res = await startAuction(roomId, duration);
if (res.error) alert(res.error);
else if (res.timerEndsAt) setRealtimeData({ timerEndsAt: res.timerEndsAt }); // 즉각 반영

// BiddingControl.tsx — 입찰 성공 시 타이머 연장 즉시 반영
const res = await placeBid(roomId, currentPlayer.id, teamId, finalAmount);
if (res.error) setBidError(res.error);
else {
  setBidAmount(finalAmount + 10);
  if (res.newTimerEndsAt) setRealtimeData({ timerEndsAt: res.newTimerEndsAt });
}
```

### 📌 AI 행동 지침 (Lessons Learned & New Rules)

> **시간에 민감한 상태(타이머, 입찰 결과 등)를 변경하는 Server Action은 반드시 변경된 값을 반환해야 하며, 클라이언트는 Supabase 실시간 이벤트를 기다리지 않고 해당 반환값으로 즉시 Store를 업데이트(Optimistic Update)해야 한다. "쓰고 잊는(fire and forget)" Server Action 패턴은 실시간 경매처럼 ms가 중요한 UI에서 항상 지연 버그를 만들어낸다.**

---

## CASE 3 — fetchAll 이중 setRealtimeData 호출: 중간 렌더 깜빡임

### 🔴 이슈 요약 (The Problem)

초기 로드 또는 INSERT/DELETE 이벤트 수신 시 `fetchAll`이 호출되는데, 내부에서 `setRealtimeData`를 **두 번** 호출했다. 첫 번째 호출 후 잠깐 teams/players가 빈 상태로 렌더되는 깜빡임이 발생.

**영향 파일**: `src/features/auction/hooks/useAuctionRealtime.ts`

### ❌ 실패한 접근법 (What didn't work)

```typescript
// ❌ 두 번 분리 호출 — 중간 불완전 상태 렌더 발생
if (roomRes.data) {
  setRealtimeData({
    timerEndsAt: roomRes.data.timer_ends_at,
    // ... room 필드들만
  }); // ← 이 시점: isRoomLoaded=true지만 teams/players는 아직 이전 값
}
setRealtimeData({
  teams: teamsRes.data || [],
  players: playersRes.data || [],
  // ... 나머지
});
```

**Root Cause**: 5개 테이블을 `Promise.all`로 병렬 fetch하면서도, 결과를 Store에 반영하는 건 두 번에 나눠 했다. React는 두 번의 `setState`를 각각 렌더 사이클로 처리하려 해서 불완전한 중간 상태가 노출되었다.

### ✅ 최종 해결책 (What worked)

```typescript
// ✅ 단일 setRealtimeData 호출로 통합 — 원자적 상태 업데이트
setRealtimeData({
  basePoint: roomRes.data.base_point,
  timerEndsAt: roomRes.data.timer_ends_at,
  // ... 모든 room 필드
  teams: teamsRes.data || [],
  bids: bidsRes.data || [],
  players: playersRes.data || [],
  messages: messagesRes.data || [],
});
```

### 📌 AI 행동 지침 (Lessons Learned & New Rules)

> **하나의 데이터 로드 사이클에서 발생하는 모든 Store 업데이트는 단일 action 호출로 처리해야 한다. 연관된 데이터를 여러 번 setState로 나눠 쓰면 불완전한 중간 상태가 렌더되어 깜빡임이나 UI 불일치가 발생한다.**

---

## CASE 4 — React useRef 초기화 누락: CenterTimer 진행바 미작동

### 🔴 이슈 요약 (The Problem)

경매 타이머의 진행바(progress bar)가 첫 마운트 시 항상 0으로 고정되어 있었다. 타이머 연장 이후에야 정상 동작.

**영향 파일**: `src/features/auction/components/AuctionBoard.tsx` (`CenterTimer` 컴포넌트)

### ❌ 실패한 접근법 (What didn't work)

```typescript
const lastTarget = useRef(target);
useEffect(() => {
  const diff = target - Date.now();
  if (target !== lastTarget.current) {
    // ← 최초 렌더 시 target === lastTarget.current
    initialDuration.current = diff; //    이 블록이 실행되지 않음
    lastTarget.current = target;
  }
}, [target]);

const progress = initialDuration.current
  ? (timeLeftMs / initialDuration.current) * 100
  : 0; // ← initialDuration이 null이므로 항상 0
```

**Root Cause**: `useRef(target)`으로 초기값을 설정했기 때문에 최초 마운트 시 `target === lastTarget.current`가 되어 조건이 false. `initialDuration.current`가 null로 유지되어 진행바가 0에서 시작.

### ✅ 최종 해결책 (What worked)

```typescript
useEffect(() => {
  // target 변경 또는 최초 마운트 시 항상 initialDuration 설정
  initialDuration.current = target - Date.now();
}, [target]);
```

조건 분기 없이 `target`이 바뀔 때마다(최초 포함) 항상 `initialDuration`을 갱신.

### 📌 AI 행동 지침 (Lessons Learned & New Rules)

> **`useRef`를 `useEffect`의 "이전값 비교" 용도로 쓸 때는, 초기값과 첫 번째 변경값이 같으면 effect 내부 블록이 실행되지 않는다는 점을 항상 인지해야 한다. 최초 마운트 시에도 값이 초기화되어야 하는 ref는 조건 없이 effect 내에서 바로 설정해야 한다.**

---

## 요약 테이블

| #   | 버그 유형            | 핵심 원인                                           | 해결 패턴                                       |
| --- | -------------------- | --------------------------------------------------- | ----------------------------------------------- |
| 1   | 쿠키 이름 충돌       | 격리 단위가 "방" 수준에서 끝남, "역할+팀" 미분리    | 쿠키 이름에 `{ROLE}_{teamId}` 포함              |
| 2   | Server Action 지연   | "Fire and forget" — 변경값 미반환, WebSocket만 의존 | Server Action이 변경값 반환 + Optimistic Update |
| 3   | 이중 setState 깜빡임 | 하나의 로드 사이클을 두 번의 setState로 나눔        | 단일 setState 호출로 통합                       |
| 4   | useRef 초기화 누락   | 초기값 비교 조건으로 인해 최초 실행 블록 스킵       | 조건 없이 effect에서 직접 설정                  |

---

## 이슈 #5 — 경매 로직 보안 강화 및 구조 개선 (2026-03-03)

### 이슈 요약 (The Problem)

경매 경쟁 루트(`/api/room-auth`, `drawNextPlayer`, `placeBid`, `awardPlayer`)에 다음 취약점과 버그가 동시에 존재했다:

- **P0**: role 화이트리스트 검증 없는 쿠키 발급, drawNextPlayer에 IN_AUCTION 중복 가드 없음, placeBid의 teamId가 해당 방 소속인지 검증 없음
- **P1**: startAuction 중복 타이머 실행, awardPlayer 비원자 처리(players/teams 업데이트 분리), 문자열 기반 isReAuctionRound 감지
- **P1**: ChatPanel과 useAuctionControl이 anon key로 직접 messages INSERT → RLS 강화 후 차단됨
- **P1**: page.tsx의 roleParam이 타입 캐스트만 하고 런타임 검증 없음

### 실패한 접근법 (What didn't work)

1. **anon key RLS 정책 삭제 후 방치**: SELECT 전용 RLS로 전환하면 기존 ChatPanel/useAuctionControl의 anon INSERT가 차단됨 — DB 정책 변경과 코드 변경이 반드시 함께 진행되어야 한다.
2. **문자열 기반 재경매 감지**: `content.includes('재경매를 재개합니다')` — 메시지 텍스트가 바뀌거나 국제화되면 즉시 깨지는 취약한 패턴이다.
3. **비원자 낙찰 처리**: `players.update(SOLD)` 후 `teams.update(point_balance)` 분리 호출 — 두 쿼리 사이에 충돌이 발생하면 데이터 불일치가 발생한다.

### 최종 해결책 (What worked)

1. **RLS 정책을 SELECT-only로 재설정** (마이그레이션 `00010`) — anon key는 읽기 전용, 모든 쓰기는 service_role(Server Actions)만 가능
2. **모든 DB 쓰기를 Server Action 경유** — ChatPanel, useAuctionControl의 `supabase.from('messages').insert()` → `sendChatMessage()` Server Action 호출로 교체
3. **award_player_atomic RPC** (마이그레이션 `00011`) — PostgreSQL 함수 내에서 `FOR UPDATE` 락으로 players + teams + rooms를 단일 트랜잭션으로 처리
4. **직접 플래그 설정** — `restartAuctionWithUnsold` 반환값에 `reAuctionStarted: true` 포함, AuctionBoard.tsx에서 직접 `setReAuctionRound(true)` 호출
5. **route.ts 토큰 DB 검증** — organizer_token, viewer_token, leader_token을 DB에서 조회하여 비교

### AI 행동 지침 (Lessons Learned & New Rules)

> **DB 정책(RLS)과 애플리케이션 코드는 반드시 함께 변경해야 한다. RLS를 강화할 때는 "anon key로 직접 쓰기를 수행하는 코드가 있는가?"를 반드시 전체 코드베이스에서 검색하고, 발견된 모든 직접 쓰기를 service_role 경유 Server Action으로 전환한 후에야 RLS 정책을 배포한다.**

---

## 이슈 #6 — 상태 읽기/쓰기 불일치 (Dead State) 패턴 (2026-03-04)

### 이슈 요약 (The Problem)

Zustand store에 `isReAuctionRound` 상태가 존재하고 `setReAuctionRound()` 쓰기가 여러 곳에서 일어났지만, 실제 `useAuctionStore(s => s.isReAuctionRound)`로 읽는 컴포넌트가 없었다. `RoomClient.tsx`는 동명의 로컬 변수(`const isReAuctionRound = unsoldPlayers.length > 0 && waitingPlayers.length === 0`)를 사용했고, 이 로컬 값은 `restartAuctionWithUnsold` 호출 후 unsold → waiting 전환되는 순간 `false`가 되어 재경매 타이머를 5초 대신 10초로 잘못 계산했다.

### 실패한 접근법 (What didn't work)

1. **로컬 상태 계산 유지**: 플레이어 상태(UNSOLD/WAITING)만으로 "재경매 중"을 판단 — 상태 전환 자체가 감지 조건을 파괴하는 시간차 문제 발생
2. **문자열 기반 메시지 감지**: `content.includes('재경매를 재개합니다')` — 텍스트 변경 시 즉시 깨지는 취약한 패턴

### 최종 해결책 (What worked)

- 로컬 계산식 제거 → `useAuctionStore(s => s.isReAuctionRound)` 참조로 통일
- `handleRestartAuction`에서 `setReAuctionRound(true)` 직접 호출 — 상태 전환과 독립적인 명시적 플래그

### AI 행동 지침 (Lessons Learned & New Rules)

> **Zustand store에 상태를 쓰는 코드를 추가할 때는, 그 상태를 실제로 읽는 컴포넌트가 있는지 반드시 확인하라. 스토어에 write만 하고 아무도 read하지 않는 "dead state"는 로컬 변수와 동명 충돌을 일으켜 버그의 원인이 된다. grep으로 `s\.상태명` 패턴을 검색하여 소비자가 존재하는지 확인할 것.**

---

## 이슈 #7 — Broadcast-primary 아키텍처 전환 시 스토어 상태 제거 부작용 (2026-03-04)

### 이슈 요약 (The Problem)

Broadcast-primary 아키텍처로 전환하면서 Zustand store에서 `hasPlayedReadyAnimation`, `addBid`, `addMessage`, `updatePlayer`, `updateTeam` 등을 제거했다. 그러나 `AuctionBoard.tsx`가 `hasPlayedReadyAnimation`과 `setReadyAnimationPlayed`를 store에서 읽고 있어 빌드 시 TypeScript 에러 발생.

### 실패한 접근법 (What didn't work)

1. **store에서 상태 제거 후 곧바로 빌드**: 상태를 제거하기 전에 어떤 파일이 해당 상태를 소비하는지 확인하지 않아 빌드 에러 발생
2. **"단순히 쓰기만 있는 상태다"라는 가정**: `setReadyAnimationPlayed` 호출이 store에서 `hasPlayedReadyAnimation`을 읽는 곳과 동일 컴포넌트 내에 존재했음

### 최종 해결책 (What worked)

- `AuctionBoard.tsx`에서 store 의존성을 제거하고 `useState`로 로컬 상태 전환:
  ```typescript
  // Before: const hasPlayedReadyAnimation = useAuctionStore(s => s.hasPlayedReadyAnimation)
  const [hasPlayedReadyAnimation, setHasPlayedReadyAnimation] = useState(false);
  const setReadyAnimationPlayed = (played: boolean) =>
    setHasPlayedReadyAnimation(played);
  ```
- Store 상태 제거 전 `grep -r "hasPlayedReadyAnimation" src/` 실행하여 소비자 위치 확인이 선행되었어야 했음

### AI 행동 지침 (Lessons Learned & New Rules)

> **Zustand store에서 상태를 제거할 때는, 반드시 먼저 `grep -r "s\.상태명\|상태명" src/` 명령으로 모든 소비 위치를 파악하고, 각 소비자를 로컬 상태나 props로 전환한 뒤에 store에서 제거해야 한다. 제거와 소비자 전환을 동시에 수행하지 않으면 빌드 에러가 발생한다.**

---

## 이슈 #8 — 모바일 뷰 Flex 레이아웃에서 자식 요소 수축(Shrink) 현상에 의한 겹침 버그 (2026-03-05)

### 이슈 요약 (The Problem)

모바일 기기 등 높이가 작은 화면에서 `RoomClient.tsx`의 `<main>` 컨테이너 내부의 패널들(경매정보, 실시간 채팅, 팀 현황)이 서로 겹치거나 영역 밖으로 튀어나오는 현상이 발생함. "1. 경매정보 2. 실시간채팅, 유찰정보 3. 팀 현황" 순으로 정상적으로 나열되어 스크롤되어야 하나 요소들이 강제로 찌그러지고 겹쳐진 상태로 노출됨.

### 실패한 접근법 (What didn't work)

1. 부모 컨테이너에 `flex-col`, `overflow-y-auto`만 지정하고 자식 요소들의 `flex-shrink`를 제어하지 않음.
2. 자식 요소들에 고정 높이나 최소 높이(`h-[400px]`, `min-h-[460px]`)를 선언했지만, `flex` 박스에서 자식의 기본 속성인 `flex-shrink: 1`이 여전히 적용되어 있어 좁은 화면에서 지정한 최소 치수가 무시됨.

### 최종 해결책 (What worked)

- 부모 엘리먼트(`flex-col`) 아래에서 고유의 높이를 유지해야 하는 자식 요소들(1뎁스의 `<aside>`, `<section>`)에 `shrink-0` (`flex-shrink: 0`) Tailwind 클래스를 일괄 추가.
- 이렇게 하면 부모 영역 높이가 모바일 디바이스 해상도로 인해 짧아지더라도, 자식들은 찌그러지지 않고 원래 지정한 크기를 유지하며 부모 트랙 내에서 정상적으로 수직 스크롤 됨.

### AI 행동 지침 (Lessons Learned & New Rules)

> **Flex 컨테이너 내부에서 스크롤이 가능한 세로형 레이아웃(`flex-col` + `overflow-y-auto`)을 구축할 때, 각 자식 컴포넌트가 최소한의 높이를 보장받아야 한다면 반드시 `shrink-0` 속성을 부여하라. 그렇지 않으면 브라우저는 좁은 화면 배율에서 자식 요소를 우선적으로 수축(`shrink`)시켜, 레이아웃 겹침(Overflow overlap) 등 치명적인 UI 버그를 유발한다.**

## [2026-03-09 16:04:12] 픽셀아트 컨셉 폰트 적용 시 @import 위치 오류
- **이슈 요약 (The Problem)**: 픽셀아트 컨셉 구현을 위해 외부 폰트(Galmuri)를 @import로 추가했으나, Tailwind CSS의 @import "tailwindcss" 보다 뒤에 위치하여 빌드 경고 및 적용 순서 혼선 발생.
- **실패한 접근법 (What didn't work)**: CSS 파일 중간에 @import를 삽입하거나 PowerShell의 -replace 연산자를 사용하여 정규식 이스케이프 문제로 파일 내용이 깨짐.
- **최종 해결책 (What worked)**: @import 규칙은 파일의 최상단(@charset 제외)에 위치해야 한다는 표준을 준수하여 globals.css를 전체 재작성(Set-Content)함.
- **AI 행동 지침 (Lessons Learned & New Rules)**: CSS 수정 시 @import 규칙은 항상 파일의 가장 처음에 배치해야 하며, 특수문자가 많은 설정 파일은 부분 치환보다 전체 구조를 재작성하는 것이 안전하다.

## [2026-03-09 16:37:53] PowerShell 경로 내 특수문자([id]) 처리 오류
- **이슈 요약 (The Problem)**: Next.js의 dynamic route 경로인 [id]가 포함된 파일을 PowerShell Get-Content로 읽을 때, []를 와일드카드로 인식하여 파일을 찾지 못하는 현상 발생.
- **실패한 접근법 (What didn't work)**: 일반적인 따옴표 처리만으로는 해결되지 않음.
- **최종 해결책 (What worked)**: -LiteralPath 파라미터를 사용하여 경로를 문자열 그대로 인식하게 함.
- **AI 행동 지침 (Lessons Learned & New Rules)**: 대괄호([])가 포함된 경로를 다룰 때는 반드시 -LiteralPath를 사용해야 하며, 가시성 개선 시에는 텍스트 색상뿐만 아니라 배경과의 대비(Contrast Ratio)를 최우선으로 고려한다.

## [2026-03-09 16:51:30] 서로 다른 역할의 컨트롤 패널 디자인 불일치
- **이슈 요약 (The Problem)**: 주최자 패널은 픽셀아트/블랙 헤더 스타일이 적용된 반면, 팀장 패널은 이전의 모던한 스타일이 남아있어 시각적 괴리 발생.
- **최종 해결책 (What worked)**: RoomClient의 GM Panel 레이아웃을 BiddingControl에 이식하여 상단 블랙 헤더, 고대비 텍스트, 픽셀 박스 스타일을 통일함.
- **AI 행동 지침 (Lessons Learned & New Rules)**: 전체 테마 변경 시 한 페이지 내의 모든 제어 컴포넌트를 전수 조사하여 디자인 일관성을 즉시 확보해야 한다.

## [2026-03-09 17:40:48] 일부 버튼의 스타일 가이드라인 미준수
- **이슈 요약 (The Problem)**: EXIT와 END 버튼이 전역 pixel-button 스타일이 아닌 개별 인라인 스타일(border-white 등)을 사용하여 통일감 저하.
- **최종 해결책 (What worked)**: 해당 버튼들을 pixel-button 클래스로 교체하고, 일관된 패딩과 폰트 크기를 적용함.
- **AI 행동 지침 (Lessons Learned & New Rules)**: 스타일 수정 시 특정 버튼만 고치는 것이 아니라, 해당 페이지 내의 모든 버튼이 동일한 전역 클래스를 사용하는지 전수 검사해야 한다.


## 2026-03-09: CenterTimer Style Update & Command Execution Issue
### 이슈 요약 (The Problem)
AuctionBoard.tsx의 CenterTimer 컴포넌트 스타일을 수정하던 중, 윈도우 환경에서 sed 명령어 체이닝(&&) 실패와 멀티라인 문자열 치환 오류가 발생함.

### 실패한 접근법 (What didn't work)
- sed -i ... && sed -i ...를 하나의 un_shell_command로 실행하려 했으나 윈도우 쉘에서 문법 오류 발생.
- $content.Replace(, )을 사용한 멀티라인 치환 시, 코드의 인덴트나 개행 문자가 정확히 일치하지 않아 치환이 무시됨.

### 최종 해결책 (What worked)
- powershell의 oreach 루프를 사용하여 라인별로 패턴을 매칭하고 필요한 부분만 Replace를 적용함.
- !border-red-600과 같이 중요도(!)를 명시하여 기존 pixel-box 유틸리티 클래스의 스타일 충돌을 해결함.

### AI 행동 지침 (Lessons Learned & New Rules)
윈도우 환경에서 복잡한 코드 수정 시 문자열 전체 치환보다는 라인별 매칭 수정을 우선하고, 스타일 우선순위 충돌이 예상될 경우 ! (important) 플래그를 적극 활용한다.


## 2026-03-09: JavaScript Falsy Value in Conditional Rendering (0 Price Issue)
### 이슈 요약 (The Problem)
경매 결과 모달(AuctionResultModal.tsx)에서 sold_price가 0포인트인 경우 포인트 정보가 화면에 나타나지 않는 문제가 발생함.

### 실패한 접근법 (What didn't work)
- {player.sold_price && (...)}와 같은 단순 논리 연산자(&&) 사용. 자바스크립트에서  은 falsy 값이기 때문에 sold_price가 0이면 조건이 거짓으로 판명되어 렌더링이 건너뛰어짐.

### 최종 해결책 (What worked)
- {typeof player.sold_price === "number" && (...)}로 조건을 변경하여  이라는 유효한 숫자값도 렌더링될 수 있도록 수정함.

### AI 행동 지침 (Lessons Learned & New Rules)
숫자 값이  을 가질 수 있는 필드(가격, 점수, 카운트 등)를 조건부 렌더링할 때는 단순히 && 연산자만 쓰지 말고, 명시적으로 	ypeof를 확인하거나 null/undefined 여부를 비교한다.


## 2026-03-09: Table Cell Multi-Alignment Layout Refactoring
### 이슈 요약 (The Problem)
AuctionArchiveSection.tsx에서 선수 이름과 낙찰 금액이 같은 곳에 뭉쳐 있어 가독성이 떨어짐. 이름은 중앙, 금액은 우측 끝으로 분할 배치가 필요함.

### 실패한 접근법 (What didn't work)
- 단순 ml-3 (margin-left) 사용: 이름의 길이에 따라 금액의 위치가 유동적으로 변하여 표가 지저분해 보임.

### 최종 해결책 (What worked)
- 	d를 elative로 설정하고, 이름은 	ext-center를 가진 div로 감싸 중앙에 배치.
- 금액은 bsolute right-4를 사용하여 우측 끝에 고정 배치함으로써 이름의 길이와 상관없이 일관된 레이아웃을 완성함.

### AI 행동 지침 (Lessons Learned & New Rules)
요소의 중앙 정렬을 유지하면서 특정 정보를 우측에 고정해야 할 때는, 중앙 요소의 너비를 100%로 잡고 정보 요소를 bsolute로 배치하여 레이아웃 무결성을 유지한다.


## 2026-03-09: Button Style Synchronization (UI Consistency)
### 이슈 요약 (The Problem)
메인 페이지의 두 핵심 버튼("방 만들기", "아카이브 보기")의 스타일이 서로 달라 디자인 일관성이 깨져 보임. 하나는 현대적인 둥근 스타일, 하나는 레트로 픽셀 스타일이었음.

### 실패한 접근법 (What didn't work)
- 개별 컴포넌트 내에서 스타일을 수정하다 보니, 공통 부모(page.tsx)에서의 배치 간격이나 모바일 반응형 너비가 어긋나는 경우가 발생할 수 있음.

### 최종 해결책 (What worked)
- 두 버튼 모두 pixel-button 베이스 클래스를 적용하고, 동일한 8px 검은색 픽셀 그림자를 설정함.
- w-full sm:w-auto를 통해 모바일과 데스크탑 환경 모두에서 균형 잡힌 레이아웃을 유지하도록 함.
- 부모 컨테이너의 gap을 조정하여 시각적 밀도를 높임.

### AI 행동 지침 (Lessons Learned & New Rules)
나란히 배치되는 버튼들은 반드시 동일한 외곽선(border), 그림자(shadow), 패딩(padding) 규격을 공유해야 하며, 색상으로만 기능을 구분하여 디자인 무결성을 유지한다.


## 2026-03-09: Modal Style Normalization (Pixel Art UI)
### 이슈 요약 (The Problem)
CreateRoomModal.tsx가 프로젝트의 전체적인 픽셀 아트 테마와 어울리지 않게 현대적인 둥근 디자인을 사용하고 있어 시각적 불일치가 발생함.

### 실패한 접근법 (What didn't work)
- 일부 클래스만 수정할 경우, 입력창이나 카드 요소들의 둥근 정도가 남아있어 여전히 어색해 보일 수 있음. 전체적인 컴포넌트 스타일을 한꺼번에 마이그레이션해야 함.

### 최종 해결책 (What worked)
- 모든 ounded 관련 클래스를 제거하거나 ounded-0으로 덮어씀.
- 테두리와 그림자 규격을 AuctionResultModal의 성공적인 사례에서 복사하여 적용함.
- pixel-button 유틸리티를 전면 도입하여 버튼 액션의 시각적 피드백을 통일함.

### AI 행동 지침 (Lessons Learned & New Rules)
특정 프로젝트의 독특한 디자인 시스템(예: 픽셀 아트)이 존재하는 경우, 새로운 컴포넌트나 수정 시 반드시 기존의 가장 완성도 높은 모달/섹션의 스타일 코드를 참조하여 작성한다.


## 2026-03-09: Pixel Art Scrollbar Customization
### 이슈 요약 (The Problem)
브라우저 기본 스크롤바가 프로젝트의 픽셀 아트 컨셉과 어울리지 않아 UI 완성도를 저해함.

### 실패한 접근법 (What didn't work)
- 일반적인 scrollbar-width: thin과 같은 표준 속성은 스타일링 자유도가 낮아 픽셀 특유의 두꺼운 테두리와 입체감을 표현하기 어려움.

### 최종 해결책 (What worked)
- ::-webkit-scrollbar 계열의 비표준 속성을 사용하여 너비, 배경, 테두리, 내부 그림자를 상세히 정의함.
- inset 그림자를 활용하여 별도의 이미지 자산 없이도 픽셀 느낌의 입체적인 핸들을 구현함.

### AI 행동 지침 (Lessons Learned & New Rules)
레트로/픽셀 아트 테마 작업 시, 스크롤바와 같은 세부 요소도 order-radius: 0과 order를 명시적으로 적용하여 "부드러움"을 배제하고 "딱딱하고 명확한" 선 중심의 디자인을 유지한다.
### [2026-03-09] 메타데이터 및 SEO 최적화 누락 대응
이슈 요약: layout.tsx에만 메타데이터가 집중되어 동적 경매방 페이지([id])의 타이틀이 중복 노출됨.
해결책: room/[id]/page.tsx에 generateMetadata를 도입하고, layout.tsx에 JSON-LD 구조화 데이터를 삽입함.
주의사항: PowerShell 사용 시 [id]와 같은 경로를 다룰 때는 -LiteralPath를 사용하여 와일드카드 인식을 방지할 것.

---
작업 시간: 2026-03-09 22:23:35
## 이슈 요약 (The Problem)
대규모 컴포넌트 리팩토링 과정에서 PowerShell의 \Set-Content\와 Here-string 사용 시 변수 보간(\$) 및 따옴표 이스케이프 문제로 인해 파일이 오염되거나 (\src/app/page.tsx\), 타입 에러가 발생하는 이슈가 있었음. 또한, 비대한 파일(56KB)을 한 번에 리팩토링하면서 하위 컴포넌트 간의 타입 불일치가 발생함.

## 실패한 접근법 (What didn't work)
- PowerShell Here-string (\@\"...\@) 내부에서 JavaScript의 템플릿 리터럴(\)을 사용할 때 \$\를 적절히 이스케이프하지 않아 파일 내용이 깨짐.
- 리팩토링 후 훅의 반환 객체에서 일부 함수를 누락시켜 빌드 실패를 초래함.
- \[id]\와 같은 경로를 포함한 파일 생성 시 PowerShell의 경로 처리 방식을 간과하여 에러가 발생함.

## 최종 해결책 (What worked)
- PowerShell에서 \@'...'@\ (단일 인용구)를 사용하여 변수 보간을 원천 차단하거나, \Set-Content -LiteralPath\를 사용하여 특수 문자가 포함된 경로를 정확히 지정함.
- \
pm run build\를 통한 지속적인 타입 체크로 분리된 컴포넌트 간의 인터페이스 정합성을 맞춤.
- 오염된 \src/app/page.tsx\를 수동으로 복구하여 빌드 무결성을 확보함.

## AI 행동 지침 (Lessons Learned & New Rules)
- **PowerShell을 통한 코드 생성 시 지침**: JavaScript/TypeScript 코드를 생성할 때는 반드시 단일 인용구 Here-string (\@'...'@\)을 사용하여 \$\ 문자가 보간되는 것을 방지하라.
- **컴포넌트 분리 원칙**: 10KB를 초과하는 컴포넌트는 반드시 기능적 최소 단위로 분리하고, 메인 컴포넌트는 오직 '조합'의 역할만 수행하도록 설계하라.

---

## 이슈 요약 (The Problem) — 2026-03-16

Phase 4 Firebase 마이그레이션 완료 후 `CreateRoomModal.test.tsx`가 `room-title-input`, `next-button`, `excel-upload-button` testId를 찾지 못해 2개 테스트 실패.

## 실패한 접근법 (What didn't work)

테스트 파일에 `getByTestId("room-title-input")` 등이 사용되어 있었지만, 해당 컴포넌트(`BasicInfoStep.tsx`, `CreateRoomModal.tsx`, `PlayerRegistrationStep.tsx`)에 `data-testid` 속성이 전혀 없었다. 컴포넌트와 테스트 파일의 동기화 여부를 사전에 확인하지 않았다.

## 최종 해결책 (What worked)

- `BasicInfoStep.tsx` title input → `data-testid="room-title-input"` 추가
- `CreateRoomModal.tsx` next button → `data-testid="next-button"` 추가
- `PlayerRegistrationStep.tsx` excel upload button → `data-testid="excel-upload-button"` 추가

## AI 행동 지침 (Lessons Learned & New Rules)

**테스트가 `getByTestId`를 사용할 경우, 대응하는 컴포넌트에 `data-testid` 속성이 실제로 존재하는지 반드시 `grep -rn "data-testid" src/`로 확인한 후 테스트를 실행하라. 속성이 없으면 컴포넌트에 먼저 추가해야 한다.**
