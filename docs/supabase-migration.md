# Firebase → Supabase 이관 분석 문서

> 작성일: 2026-05-11  
> 대상 프로젝트: league-auction (Minions Bid)  
> 현재 스택: Next.js 15 + Firebase (Auth + Firestore + RTDB) + Tailwind CSS

---

## 목차

1. [현재 Firebase 사용 현황](#1-현재-firebase-사용-현황)
2. [이관 전제조건 (Prerequisites)](#2-이관-전제조건-prerequisites)
3. [주의사항 (Gotchas)](#3-주의사항-gotchas)
4. [놓치기 쉬운 부분 (Hidden Gaps)](#4-놓치기-쉬운-부분-hidden-gaps)
5. [데이터 모델 매핑](#5-데이터-모델-매핑)
6. [실시간 채널 설계](#6-실시간-채널-설계)
7. [인증 전환 설계](#7-인증-전환-설계)
8. [트랜잭션 전환 목록](#8-트랜잭션-전환-목록)
9. [이관 우선순위 및 단계별 계획](#9-이관-우선순위-및-단계별-계획)
10. [기능별 트레이드오프](#10-기능별-트레이드오프)

---

## 1. 현재 Firebase 사용 현황

### 1.1 Firebase Auth

현재 프로젝트는 Firebase 일반 인증(이메일/비밀번호, OAuth)을 **사용하지 않는다**. Firebase Auth는 RTDB 보안 규칙에 `role`, `roomId`, `teamId` claims를 전달하는 **컨테이너** 역할만 한다.

**실제 인증 흐름.**

```
1. 방 생성 시 crypto.randomUUID()로 토큰 발급
   → organizerToken, viewerToken, 팀별 leaderToken
   → Firestore room_auth_secrets/{roomId} 에 저장

2. 방 접속 URL에 토큰 포함 (?token=xxx)
   → /api/room-auth 에서 Firestore 저장값과 대조 검증
   → 검증 통과 시 HttpOnly 쿠키 설정 + /room/{roomId} 리다이렉트

3. 클라이언트가 /api/room-auth/firebase-token 요청
   → 쿠키 검증 후 admin.auth().createCustomToken(uid, { role, roomId, teamId }) 발급
   → UID 형식: "room:{roomId}:{role}:{teamId|none}"

4. 클라이언트가 signInWithCustomToken(auth, token) 으로 Firebase 로그인
   → RTDB 보안 규칙에서 auth.uid, auth.token.role 등 claims 참조 가능

5. RTDB/Firestore 보안 규칙이 claims 기반 접근 제어
```

**관련 파일.**
- `src/lib/firebase.ts:39-64` — `ensureRoomFirebaseAuth()` (커스텀 토큰 발급 + signIn)
- `src/app/api/room-auth/route.ts:56-142` — 토큰 검증 + 쿠키 설정
- `src/app/api/room-auth/firebase-token/route.ts:46-48` — Custom Token 발급
- `src/features/auction/utils/roomAuth.ts:1-132` — 쿠키 파싱, 토큰 검증 유틸

---

### 1.2 Firestore 컬렉션 구조

```
rooms/{roomId}
  ├─ name, status, current_player_id, timer_ends_at, active_bid
  ├─ auction_revision, last_auction_event
  ├─ next_auction_duration_ms, is_re_auction_round
  │
  ├─ /teams/{teamId}
  │    └─ name, point_balance, leader_name, leader_position,
  │       leader_description, captain_points, room_id
  │
  ├─ /players/{playerId}
  │    └─ name, tier, main_position, sub_position, status,
  │       team_id, sold_price, description, room_id
  │
  ├─ /messages/{messageId}
  │    └─ event_id, room_id, sender_name, sender_role,
  │       content, created_at
  │
  └─ /bids/{bidId}  ← RTDB 이관 후 미사용 (잔존 레코드 존재 가능)
       └─ player_id, team_id, amount, created_at

room_auth_secrets/{roomId}
  ├─ organizer_token, viewer_token
  └─ /team_tokens/{teamId}
       └─ leader_token

auction_archives/{archiveId}
  └─ room_id, room_name, result_snapshot (jsonb), closed_at

hall_of_fame/{entryId}
  └─ archive_id, season_name, 선수/팀 결과

league_schedules/{scheduleId}
  ├─ name, starts_at, ...
  └─ /match_days/{dateKey}
       └─ matches (배열)

timerLabs/{labId}
  └─ 타이머 테스트 전용
```

**Firestore 사용 패턴 요약.**

| 패턴 | 위치 | 용도 |
|------|------|------|
| `runTransaction` (서버) | `auctionFlowActions.ts` (9곳) | 입찰, 낙찰, 추첨, 일시정지, 재개, 재경매 |
| `runTransaction` (서버) | `scheduleActions.ts` (3곳), `timer-lab/actions.ts` (3곳) | 일정 저장, 타이머 랩 |
| `runTransaction` (클라이언트) | `placeBidClient.ts:79` | 클라이언트 직접 입찰 (서버 왕복 없음) |
| `batch.set/commit` | `roomActions.ts:108-171` | 방 생성 (room+teams+players+auth 일괄) |
| `onSnapshot` | `useAuctionRealtime.ts:330-554` | Room, Teams, Players, Messages 실시간 구독 (4개) |
| `getDoc`/`getDocs` | `useCreateRoom.ts:101-108` | 활성 방 존재 여부 확인 |
| `collection.add` | `chatActions.ts`, `roomActions.ts`, 등 | 메시지/아카이브/명예전당 추가 |
| `where` 쿼리 | `auctionFlowActions.ts`, `watchdog/route.ts` | 상태별 선수 필터, 만료 경매 스캔 |
| `FieldValue.serverTimestamp()` | 11곳 이상 | 서버 타임스탬프 |
| `Timestamp.fromDate()` | `auctionFlowActions.ts` (4곳) | 타이머 종료 시각 |
| `recursiveDelete` | `roomActions.ts:285-286`, `scheduleActions.ts:911` | 방/일정 서브컬렉션 포함 전체 삭제 |

---

### 1.3 RTDB 경로 구조

```
presence/{roomId}/{sessionUid}
  └─ role, teamId  (onDisconnect → 자동 삭제)

signals/{roomId}
  ├─ auctionEvent         ← 최신 이벤트 (단일 값, 덮어쓰기)
  ├─ auctionEvents/{eventId}  ← 이벤트 히스토리
  └─ latestMessage        ← 최신 시스템 메시지 (빠른 전파용)

bids/{roomId}/{playerId}/{bidId}
  └─ player_id, team_id, amount, created_at, event_id
     (낙찰/유찰 시 서버가 remove())

timerLabSignals/{labId}
  ├─ auctionEvent
  └─ auctionEvents/{eventId}
```

**RTDB 사용 패턴 요약.**

| 패턴 | 위치 | 용도 |
|------|------|------|
| `ref` + `set` (서버) | `auctionFlowActions.ts:94-104` | 경매 이벤트 발행 (signals) |
| `ref` + `set` (서버) | `chatActions.ts:24-33` | 시스템 메시지 빠른 전파 |
| `ref` + `set` (서버) | `auctionFlowActions.ts` | 입찰 내역 RTDB 기록 |
| `ref` + `remove` (서버) | `auctionFlowActions.ts:854-857` | 낙찰/유찰 후 bids 정리 |
| `ref` + `onValue` (클라이언트) | `useAuctionRealtime.ts:614-680` | auctionEvent, auctionEvents, latestMessage 구독 |
| `ref` + `onValue` (클라이언트) | `usePresence.ts:62-99` | `.info/connected`, `presence/{roomId}` 구독 |
| `onDisconnect().remove()` | `usePresence.ts:69-78` | 연결 끊김 시 presence 자동 정리 |

---

### 1.4 서버 사이드 Firebase Admin SDK 사용 파일 목록

| 파일 | 사용 내용 |
|------|----------|
| `src/lib/firebaseAdmin.ts` | Admin 초기화, `getAdminDb()`, lazy proxy `adminDb` |
| `src/features/auction/realtime/serverAdapter.ts` | `admin.database()` (RTDB Admin 인스턴스) |
| `src/features/auction/api/auctionFlowActions.ts` | `Timestamp`, `FieldValue`, `runTransaction` (9개) |
| `src/features/auction/api/roomActions.ts` | `batch`, `FieldValue.serverTimestamp()`, `recursiveDelete` |
| `src/features/auction/api/chatActions.ts` | `FieldValue.serverTimestamp()`, RTDB `set` |
| `src/app/api/room-auth/firebase-token/route.ts` | `admin.auth().createCustomToken()` |
| `src/app/api/auction-watchdog/route.ts` | `Timestamp.now()`, Firestore 범위 쿼리 |
| `src/features/hall-of-fame/api/hallOfFameActions.ts` | `adminDb` Firestore CRUD |
| `src/features/schedules/api/scheduleActions.ts` | `adminDb`, `runTransaction` (3개), `recursiveDelete` |
| `src/features/timer-lab/actions.ts` | `FieldValue.serverTimestamp()`, `runTransaction` (3개), RTDB `set` |

---

### 1.5 보안 규칙

**RTDB 규칙** (`database.rules.json`)

| 경로 | 읽기 | 쓰기 |
|------|------|------|
| `presence/{roomId}` | 전체 허용 | `auth.uid === $sessionId` + role이 LEADER/ORGANIZER |
| `signals/{roomId}` | 전체 허용 | 차단 (Admin SDK만) |
| `timerLabSignals/{labId}` | 전체 허용 | 차단 (Admin SDK만) |
| `bids/{roomId}` | `auth != null` | 차단 (Admin SDK만) |

**Firestore 규칙** (`firestore.rules`)

| 규칙 | 내용 |
|------|------|
| `rooms/{roomId}` - get | 개별 get 허용, list 불허 |
| `rooms/{roomId}` - update | Admin SDK 또는 `isBidUpdate()` 통과 시 허용 |
| `isBidUpdate()` | LEADER의 클라이언트 직접 입찰 검증 (auth claims + 필드 제한 + 금액 검증 + 포인트 잔액 `get()` 조회) |
| `rooms/{roomId}/bids/{bidId}` - create | `isBidHistoryCreate()` 통과 시 허용 |
| `room_auth_secrets` | 전면 차단 (Admin SDK만) |

---

## 2. 이관 전제조건 (Prerequisites)

### P1. PostgreSQL 스키마 설계

Firestore의 Document/Sub-collection 모델을 관계형 스키마로 변환해야 한다.

```sql
-- 경매방 메타
CREATE TABLE rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'WAITING',  -- WAITING|ACTIVE|PAUSED|CLOSED
  current_player_id        uuid REFERENCES players(id) ON DELETE SET NULL,
  timer_ends_at            timestamptz,
  active_bid               jsonb,                 -- { team_id, team_name, amount }
  auction_revision         int NOT NULL DEFAULT 0,
  last_auction_event       jsonb,                 -- AuctionEvent 객체
  next_auction_duration_ms int,
  is_re_auction_round      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 팀
CREATE TABLE teams (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name             text NOT NULL,
  point_balance    int NOT NULL DEFAULT 0,
  leader_name      text NOT NULL,
  leader_position  text NOT NULL,
  leader_description text NOT NULL DEFAULT '',
  captain_points   int NOT NULL DEFAULT 0
);

-- 선수
CREATE TABLE players (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name           text NOT NULL,
  tier           text NOT NULL,
  main_position  text NOT NULL,
  sub_position   text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'WAITING',  -- WAITING|IN_AUCTION|SOLD|UNSOLD
  team_id        uuid REFERENCES teams(id) ON DELETE SET NULL,
  sold_price     int,
  description    text NOT NULL DEFAULT ''
);

-- 채팅/시스템 메시지
CREATE TABLE messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  event_id     text,
  sender_name  text NOT NULL,
  sender_role  text NOT NULL,  -- ORGANIZER|LEADER|VIEWER|SYSTEM|NOTICE
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 입찰 내역 (현재 RTDB bids → Postgres 이관)
CREATE TABLE bids (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  amount     int NOT NULL,
  event_id   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 인증 토큰
CREATE TABLE room_auth_secrets (
  room_id          uuid PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  organizer_token  uuid NOT NULL DEFAULT gen_random_uuid(),
  viewer_token     uuid NOT NULL DEFAULT gen_random_uuid()
);

CREATE TABLE room_auth_team_tokens (
  room_id      uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  team_id      uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  leader_token uuid NOT NULL DEFAULT gen_random_uuid(),
  PRIMARY KEY (room_id, team_id)
);

-- 아카이브
CREATE TABLE auction_archives (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          uuid,
  room_name        text NOT NULL,
  result_snapshot  jsonb NOT NULL,
  closed_at        timestamptz NOT NULL DEFAULT now()
);

-- 명예의 전당
CREATE TABLE hall_of_fame (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id   text,
  season_name  text NOT NULL,
  data         jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 리그 일정
CREATE TABLE league_schedules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  starts_at  timestamptz,
  data       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE league_schedule_match_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES league_schedules(id) ON DELETE CASCADE,
  date_key    text NOT NULL,
  matches     jsonb NOT NULL DEFAULT '[]'
);

-- 타이머 랩
CREATE TABLE timer_labs (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**필수 인덱스.**

```sql
CREATE INDEX idx_players_room_status     ON players(room_id, status);
CREATE INDEX idx_players_room_team_status ON players(room_id, team_id, status);
CREATE INDEX idx_rooms_timer             ON rooms(timer_ends_at) WHERE timer_ends_at IS NOT NULL;
CREATE INDEX idx_messages_room_created   ON messages(room_id, created_at DESC);
CREATE INDEX idx_bids_room_player        ON bids(room_id, player_id);
```

---

### P2. Supabase Auth + Custom Claims Edge Function

현재 인증 흐름을 유지하면서 Supabase Auth JWT에 claims를 주입해야 RLS가 동작한다.

```
기존: Firebase createCustomToken(uid, { role, roomId, teamId })
신규: Supabase Edge Function → JWT claims 주입 (Custom Access Token Hook)
```

**구현 방식.**

```typescript
// Supabase Auth Hook: Custom Access Token
// supabase/functions/custom-access-token/index.ts
export default async function handler(req: Request) {
  const { user_id, claims } = await req.json()
  // room_auth_secrets 조회 후 role/roomId/teamId 추가
  return Response.json({
    ...claims,
    role: 'authenticated',
    app_role: userClaims.role,       // ORGANIZER|LEADER|VIEWER
    room_id: userClaims.roomId,
    team_id: userClaims.teamId,
  })
}
```

**RLS에서 claims 참조.**

```sql
-- JWT에서 custom claims 추출
CREATE OR REPLACE FUNCTION auth_room_id() RETURNS uuid AS $$
  SELECT (auth.jwt() ->> 'room_id')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth_app_role() RETURNS text AS $$
  SELECT auth.jwt() ->> 'app_role'
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth_team_id() RETURNS uuid AS $$
  SELECT (auth.jwt() ->> 'team_id')::uuid
$$ LANGUAGE sql STABLE;
```

---

### P3. RLS 정책 설계

`isBidUpdate()` 검증 로직을 RLS로 재구현해야 한다.

```sql
-- rooms 테이블 RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- 같은 방의 인증된 사용자는 읽기 가능
CREATE POLICY "room_members_read" ON rooms FOR SELECT
  USING (id = auth_room_id());

-- LEADER만 입찰 업데이트 가능
CREATE POLICY "leaders_can_bid" ON rooms FOR UPDATE
  USING (
    auth_app_role() = 'LEADER'
    AND id = auth_room_id()
    AND timer_ends_at > now()
    AND current_player_id IS NOT NULL
  )
  WITH CHECK (
    (active_bid->>'team_id')::uuid = auth_team_id()
    AND (active_bid->>'amount')::int > COALESCE((OLD.active_bid->>'amount')::int, 0)
    AND auction_revision = OLD.auction_revision + 1
    AND (
      SELECT point_balance FROM teams
      WHERE id = auth_team_id() AND room_id = auth_room_id()
    ) >= (active_bid->>'amount')::int
  );

-- ORGANIZER는 모든 업데이트 가능
CREATE POLICY "organizer_full_access" ON rooms FOR ALL
  USING (
    auth_app_role() = 'ORGANIZER'
    AND id = auth_room_id()
  );

-- 팀 읽기
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_members_read_teams" ON teams FOR SELECT
  USING (room_id = auth_room_id());

-- 메시지 읽기 + LEADER/ORGANIZER 쓰기
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_members_read_messages" ON messages FOR SELECT
  USING (room_id = auth_room_id());
CREATE POLICY "members_send_messages" ON messages FOR INSERT
  WITH CHECK (
    room_id = auth_room_id()
    AND auth_app_role() IN ('ORGANIZER', 'LEADER')
  );

-- 입찰 읽기
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_members_read_bids" ON bids FOR SELECT
  USING (room_id = auth_room_id());
```

---

### P4. Supabase Client 설정

Firebase Admin SDK를 Service Role Key 기반 Supabase 클라이언트로 교체한다.

```typescript
// src/lib/supabaseAdmin.ts (firebaseAdmin.ts 대체)
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'  // supabase gen types로 자동 생성

export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// src/lib/supabaseClient.ts (클라이언트용)
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

---

### P5. 실시간 채널 전략 결정

**권장: Broadcast(이벤트 전파) + Postgres Changes(폴백)** 조합.

| 현재 (Firebase) | Supabase 이관 후 |
|-----------------|-----------------|
| RTDB `signals/{roomId}/auctionEvent` | Supabase Broadcast (`auction_event`) |
| RTDB `signals/{roomId}/auctionEvents/` | Supabase Broadcast (`auction_event`) |
| RTDB `signals/{roomId}/latestMessage` | Supabase Broadcast (`system_message`) |
| Firestore `last_auction_event` 폴백 | Postgres Changes (`rooms` UPDATE 폴백) |
| RTDB `bids/{roomId}/{playerId}` | Supabase Broadcast (`bid_placed`) 또는 `bids` Postgres Changes INSERT |
| RTDB `presence/{roomId}` | Supabase Presence |

---

## 3. 주의사항 (Gotchas)

### G1. Firestore 트랜잭션 16개가 전부 PostgreSQL 함수로 바뀐다

**이것이 이관에서 가장 큰 작업이다.**

Firestore 트랜잭션은 **낙관적 동시성 제어**(읽기 후 쓰기, 충돌 시 자동 재시도)이고, PostgreSQL은 **비관적 동시성 제어**(`SELECT ... FOR UPDATE` 잠금)이다.

모든 서버 트랜잭션을 `CREATE FUNCTION`으로 감싸고 `supabase.rpc()`로 호출해야 한다.

```sql
-- 예시: placeBid를 PostgreSQL 함수로 변환
CREATE OR REPLACE FUNCTION place_bid(
  p_room_id  uuid,
  p_player_id uuid,
  p_team_id  uuid,
  p_amount   int
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_room   rooms%ROWTYPE;
  v_team   teams%ROWTYPE;
  v_bid_id uuid := gen_random_uuid();
BEGIN
  -- 잠금 획득 (비관적 동시성)
  SELECT * INTO v_room FROM rooms WHERE id = p_room_id FOR UPDATE;

  IF v_room.timer_ends_at <= now() THEN
    RETURN jsonb_build_object('error', '경매 시간이 종료되었습니다.');
  END IF;
  IF v_room.current_player_id IS DISTINCT FROM p_player_id THEN
    RETURN jsonb_build_object('error', '현재 경매 선수가 아닙니다.');
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id AND room_id = p_room_id;
  IF v_team.point_balance < p_amount THEN
    RETURN jsonb_build_object('error', '포인트가 부족합니다.');
  END IF;
  IF p_amount <= COALESCE((v_room.active_bid->>'amount')::int, 0) THEN
    RETURN jsonb_build_object('error', '현재 최고 입찰가보다 높아야 합니다.');
  END IF;

  -- 입찰 적용
  UPDATE rooms
  SET
    active_bid       = jsonb_build_object(
                         'team_id', p_team_id,
                         'team_name', v_team.name,
                         'amount', p_amount
                       ),
    auction_revision = auction_revision + 1
  WHERE id = p_room_id;

  INSERT INTO bids (id, room_id, player_id, team_id, amount)
  VALUES (v_bid_id, p_room_id, p_player_id, p_team_id, p_amount);

  RETURN jsonb_build_object('success', true, 'bidId', v_bid_id);
END;
$$;
```

**전환 대상 트랜잭션 목록은 섹션 8 참조.**

---

### G2. Presence `onDisconnect` → heartbeat 기반 전환 시 감지 지연이 늘어난다

| 항목 | Firebase RTDB | Supabase Presence |
|------|--------------|-------------------|
| 감지 방식 | 서버 사이드 즉시 실행 | heartbeat 기반 (~10초 지연) |
| 감지 속도 | ~즉시 | ~10초 |
| 로컬 연결 상태 | `.info/connected` 즉시 감지 | 채널 `subscribe()` 상태 콜백 |

**영향.** `useAuctionPresenceGuard.ts:17`의 `PRESENCE_DISCONNECT_GRACE_MS = 3000` 값을 Supabase Presence 감지 지연을 고려해 최소 15,000ms 이상으로 재조정해야 한다.

```typescript
// 현재
const PRESENCE_DISCONNECT_GRACE_MS = 3000

// Supabase 이관 후
const PRESENCE_DISCONNECT_GRACE_MS = 15000  // heartbeat 감지 지연 고려
```

---

### G3. 클라이언트 직접 입찰(`placeBidClient.ts`)의 원자성을 보장하기 어렵다

현재 `placeBidClient.ts`는 Firestore 클라이언트 SDK로 트랜잭션을 직접 실행해 서버 왕복 없이 입찰한다. Firestore 보안 규칙 `isBidUpdate()`가 최종 방어선 역할을 한다.

Supabase 클라이언트 SDK에는 클라이언트 트랜잭션 기능이 없다. 원자성을 보장하려면 `supabase.rpc('place_bid', ...)` 호출이 필요하며, 이는 서버 왕복이 추가된다. RLS만으로는 read-then-write 원자성을 보장할 수 없다.

**레이턴시 영향.** 현재 `placeBidClient.ts` 경로 vs `auctionActions.ts` → Server Action 경로의 차이가 Supabase 이관 후 사라진다. `supabase.rpc()`는 Edge Function 없이도 Postgres 함수를 직접 호출할 수 있어 Server Action 경유보다 빠를 수 있다.

---

### G4. `timerDurationMs` 패턴은 Broadcast에서 그대로 작동한다

현재 클럭 스큐 해결책(서버가 절대 시각 대신 상대 duration을 보내고, 클라이언트가 `Date.now() + timerDurationMs`로 계산)은 Supabase Broadcast 페이로드에 그대로 포함하면 된다. 변경 없이 이관 가능하다.

```typescript
// 서버 (현재 RTDB → Supabase Broadcast로 변환)
const timerDurationMs = timerEndsAt.getTime() - Date.now()
await supabase.channel(`room:${roomId}`).send({
  type: 'broadcast',
  event: 'auction_event',
  payload: {
    ...auctionEvent,
    timerDurationMs,  // 이 필드 유지
  }
})

// 클라이언트 수신 (현재 로직 그대로)
const timerEndsAt = new Date(Date.now() + payload.timerDurationMs).toISOString()
```

---

### G5. `admin.firestore.FieldValue.serverTimestamp()` → PostgreSQL `now()`

11곳 이상에서 사용 중이다. PostgreSQL에서는 컬럼 `DEFAULT now()`로 자동 처리되거나, INSERT/UPDATE SQL에서 명시적으로 `now()`를 사용한다. Supabase 서버 사이드 클라이언트에서 `new Date().toISOString()` 대신 SQL 수준 `now()`를 우선한다.

---

### G6. `recursiveDelete` → `ON DELETE CASCADE`

방/일정 삭제 시 Firestore `recursiveDelete`로 서브컬렉션 전체를 지운다. PostgreSQL FK에 `ON DELETE CASCADE`를 설정하면 자동 처리된다. 스키마 설계 시 **모든 FK에 CASCADE 정책을 명시**해야 방 삭제 후 고아 레코드가 남지 않는다.

---

## 4. 놓치기 쉬운 부분 (Hidden Gaps)

### H1. `onSnapshot` ≠ Postgres Changes — 초기 로딩 race condition

Firestore `onSnapshot`은 구독 시작 시 현재 데이터를 즉시 전달한다. Supabase Postgres Changes는 **변경 이벤트만** 전달하므로, 구독 사이에 발생한 변경이 누락될 수 있다.

**안전한 패턴.**

```typescript
// 잘못된 방식 — race condition 발생 가능
const channel = supabase.channel(`room:${roomId}`)
  .on('postgres_changes', { event: 'UPDATE', ... }, handleChange)
  .subscribe()
const { data } = await supabase.from('rooms').select('*').eq('id', roomId).single()
// subscribe()와 select() 사이에 UPDATE가 발생하면 누락됨

// 올바른 방식 — 구독 먼저, fetch 후 병합
const pendingChanges: RoomRow[] = []
const channel = supabase.channel(`room:${roomId}`)
  .on('postgres_changes', { event: 'UPDATE', ... }, (payload) => {
    if (!initialLoaded) {
      pendingChanges.push(payload.new as RoomRow)
      return
    }
    applyChange(payload.new as RoomRow)
  })
  .subscribe()

const { data: initial } = await supabase.from('rooms').select('*').eq('id', roomId).single()
initialLoaded = true
applyChange(initial!)
pendingChanges.forEach(applyChange)
pendingChanges.length = 0
```

**영향받는 구독 5개.**
- `useAuctionRealtime.ts:330` — Room 문서
- `useAuctionRealtime.ts:457` — Teams 컬렉션
- `useAuctionRealtime.ts:479` — Players 컬렉션
- `useAuctionRealtime.ts:535` — Messages (최근 200개)
- `useAuctionRealtime.ts:374` — Bids (RTDB → Broadcast/Postgres Changes)

---

### H2. Messages `limitToLast(200)` 패턴 변환 필요

현재 Firestore onSnapshot에서 자동으로 최근 200개가 제공된다. Supabase에서는 별도로 처리해야 한다.

```typescript
// 초기 fetch — 최근 200개
const { data: initial } = await supabase
  .from('messages')
  .select('*')
  .eq('room_id', roomId)
  .order('created_at', { ascending: false })
  .limit(200)

setMessages(initial!.reverse())  // 시간순 정렬

// 이후 INSERT 이벤트 append
supabase.channel(`messages:${roomId}`)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
    (payload) => {
      setMessages(prev => [...prev.slice(-199), payload.new as Message])
    }
  )
  .subscribe()
```

---

### H3. Firestore 잔존 `bids` 서브컬렉션 정리

이전 세션에서 입찰 내역을 RTDB로 이관했으나, Firestore `rooms/{roomId}/bids/` 서브컬렉션에 이전 데이터가 남아 있을 수 있다. Supabase 이관 전에 불필요 데이터를 정리하거나, 이관 스크립트에서 제외 처리해야 한다.

---

### H4. Watchdog Cron → `pg_cron` 내부화 가능

현재 `/api/auction-watchdog` route는 외부 cron(Vercel Cron 또는 별도 서비스)이 주기적으로 호출해야 한다. Supabase에서는 `pg_cron` 확장으로 PostgreSQL 내부에서 직접 실행 가능하다.

```sql
-- pg_cron 활성화 (Supabase 대시보드에서 활성화 필요)
SELECT cron.schedule(
  'auction-watchdog',
  '*/1 * * * *',  -- 1분마다
  $$SELECT recover_expired_auctions()$$
);

CREATE OR REPLACE FUNCTION recover_expired_auctions() RETURNS void AS $$
BEGIN
  -- 타이머 만료된 ACTIVE 경매 처리
  UPDATE rooms
  SET status = 'PAUSED', timer_ends_at = NULL
  WHERE status = 'ACTIVE'
    AND timer_ends_at IS NOT NULL
    AND timer_ends_at < now() - interval '30 seconds';
  -- 실제 복구 로직은 auctionFlowActions.ts:watchdog 로직 참조
END;
$$ LANGUAGE plpgsql;
```

---

### H5. E2E Fixture 데이터 구조 갱신 필요

`src/features/auction/realtime/e2eAuctionFixture.ts`의 in-memory fixture가 Firestore Document 구조를 반영하고 있다. Supabase 이관 후 테스트가 깨지지 않으려면 fixture 내부 데이터 구조를 PostgreSQL 모델로 업데이트해야 한다.

**영향 파일.**
- `src/features/auction/realtime/e2eAuctionFixture.ts`
- `playwright/auction-realtime.spec.ts` (fixture 사용 E2E 테스트)
- `__tests__/useAuctionRealtime.test.tsx` (Firestore snapshot 에뮬레이션 코드)

---

### H6. Broadcast 채널 서버 사이드 권한

Supabase Broadcast는 기본적으로 클라이언트도 send 가능하다. 서버 전용 채널(경매 이벤트)은 **서버만 send 가능하도록 채널 설정**이 필요하다.

```typescript
// 채널 생성 시 서버 전용 옵션 (Supabase Realtime Protected Mode)
const channel = supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: {
      self: false,
      ack: false,
    },
    // 추후 protected mode 지원 시: server_only: true
  }
})
```

현재(2026년 기준) Supabase Realtime은 채널 단위 쓰기 제한을 서버 사이드에서만 완전히 강제할 수 없다. RLS + 별도 검증 로직으로 클라이언트 직접 broadcast를 차단해야 한다.

---

### H7. `Timestamp.toMillis()` / `toDate()` 패턴 전환

서버 사이드 코드에서 Firestore `Timestamp` 타입을 광범위하게 사용하고 있다.

| 현재 | 이관 후 |
|------|--------|
| `Timestamp.fromDate(date)` | `date.toISOString()` 또는 SQL `now()` |
| `timestamp.toMillis()` | `new Date(isoString).getTime()` |
| `timestamp.toDate()` | `new Date(isoString)` |
| `Timestamp.now()` | `new Date().toISOString()` 또는 SQL `now()` |
| `FieldValue.serverTimestamp()` | SQL 컬럼 `DEFAULT now()` 또는 명시적 `now()` |

**주요 위치.**
- `auctionFlowActions.ts:353` — `Timestamp.fromDate(timerEndsAt)`
- `auctionFlowActions.ts:575` — `timerField.toMillis() - Date.now()`
- `watchdog/route.ts:32` — `Timestamp.now()`
- 11곳 이상의 `FieldValue.serverTimestamp()`

---

### H8. Supabase Realtime 연결 상태 감지 방식 변경

현재 `.info/connected` RTDB 경로로 로컬 Firebase 연결 상태를 즉시 감지한다(`usePresence.ts:61-64`). Supabase에서는 채널 `subscribe()` 콜백의 상태값으로 대체한다.

```typescript
// 현재 (RTDB)
onValue(ref(rtdb, '.info/connected'), (snap) => {
  const connected = snap.val() as boolean
  setConnected(connected)
})

// Supabase 이관 후
const channel = supabase.channel(`presence:${roomId}`)
channel.subscribe((status) => {
  const connected = status === 'SUBSCRIBED'
  setConnected(connected)
})
```

---

## 5. 데이터 모델 매핑

| Firestore | Supabase PostgreSQL | 비고 |
|-----------|--------------------|----|
| `rooms/{roomId}` doc | `rooms` 테이블 행 | `timer_ends_at`: `Timestamp` → `timestamptz` |
| `rooms/{roomId}/teams/` | `teams` 테이블 + `room_id` FK | |
| `rooms/{roomId}/players/` | `players` 테이블 + `room_id` FK | |
| `rooms/{roomId}/messages/` | `messages` 테이블 + `room_id` FK | |
| `rooms/{roomId}/bids/` | `bids` 테이블 + `room_id` FK | RTDB 이관분 포함 |
| `room_auth_secrets/{roomId}` | `room_auth_secrets` 테이블 | Service Role만 접근 |
| `room_auth_secrets/{roomId}/team_tokens/` | `room_auth_team_tokens` 테이블 | |
| `auction_archives/` | `auction_archives` 테이블 | `result_snapshot`: jsonb |
| `hall_of_fame/` | `hall_of_fame` 테이블 | |
| `league_schedules/` | `league_schedules` 테이블 | |
| `league_schedules/{id}/match_days/` | `league_schedule_match_days` 테이블 | |
| `timerLabs/` | `timer_labs` 테이블 | |
| RTDB `signals/{roomId}/auctionEvent` | Supabase Broadcast `auction_event` | |
| RTDB `bids/{roomId}/{playerId}` | `bids` 테이블 + Broadcast | |
| RTDB `presence/{roomId}` | Supabase Presence | |

---

## 6. 실시간 채널 설계

### 경매방 채널 구조 (권장 설계)

```typescript
// 채널 1: 경매 이벤트 (Broadcast 우선, Postgres Changes 폴백)
const auctionChannel = supabase.channel(`room:${roomId}`)
  // 빠른 이벤트 전파
  .on('broadcast', { event: 'auction_event' }, (payload) => {
    applyAuctionEventToState(payload.payload)
  })
  // 폴백: RTDB 이벤트 누락 시 room 업데이트로 복구
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
    (payload) => {
      const room = payload.new as RoomRow
      // revision 비교 후 폴백 적용 (현재 useAuctionRealtime.ts 로직 유지)
      if (room.auction_revision > store.getState().auctionEventRevision) {
        if (room.last_auction_event) {
          applyAuctionEventToState(room.last_auction_event)
        }
      }
    }
  )
  .subscribe()

// 채널 2: 입찰 내역 (실시간 업데이트)
const bidsChannel = supabase.channel(`bids:${roomId}:${playerId}`)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'bids',
      filter: `room_id=eq.${roomId}` },
    (payload) => {
      const bid = payload.new as BidRow
      if (bid.player_id === currentPlayerId) {
        store.getState().setRealtimeData({ bids: [...bids, bid] })
      }
    }
  )
  .subscribe()

// 채널 3: Presence
const presenceChannel = supabase.channel(`presence:${roomId}`)
  .on('presence', { event: 'sync' }, () => {
    const state = presenceChannel.presenceState()
    updatePresenceStore(state)
  })
  .on('presence', { event: 'leave' }, ({ leftPresences }) => {
    handlePresenceLeave(leftPresences)
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({ role, teamId })
    }
  })
```

### 서버 사이드 이벤트 발행

```typescript
// auctionFlowActions.ts에서 RTDB set 대신 Broadcast 사용
const supabaseAdmin = getSupabaseAdmin()
const timerDurationMs = timerEndsAt.getTime() - Date.now()

await supabaseAdmin
  .channel(`room:${roomId}`)
  .send({
    type: 'broadcast',
    event: 'auction_event',
    payload: {
      ...auctionEvent,
      timerDurationMs,  // 클럭 스큐 해결 패턴 유지
    }
  })
```

---

## 7. 인증 전환 설계

### 현재 흐름 (Firebase)

```
토큰 URL → /api/room-auth → 쿠키 설정
→ /api/room-auth/firebase-token → createCustomToken
→ signInWithCustomToken → RTDB/Firestore auth claims
```

### 이관 후 흐름 (Supabase)

```
토큰 URL → /api/room-auth → 쿠키 설정 (동일)
→ /api/room-auth/supabase-token → signInAnonymously + Custom Access Token Hook
→ JWT에 role/roomId/teamId claims 포함
→ Supabase SDK가 자동으로 JWT 첨부 → RLS 적용
```

### 구현

```typescript
// src/app/api/room-auth/supabase-token/route.ts
// (firebase-token/route.ts 대체)
export async function POST(req: Request) {
  const { roomId, role, teamId } = await validateCookie(req)  // 기존 로직 재사용

  // Supabase Anonymous Sign-in (서버 사이드)
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: `room-${roomId}-${role}-${teamId ?? 'none'}@auction.internal`,
    password: crypto.randomUUID(),
    user_metadata: { role, roomId, teamId },
    app_metadata: { role, roomId, teamId },  // JWT claims에 포함됨
  })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // 단기 세션 토큰 발급
  const { data: session } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: data.user.email!,
  })

  return Response.json({ token: session?.properties?.hashed_token })
}
```

**주의.** Supabase Anonymous Auth 유저가 경매가 끝나도 DB에 남는다. 방 삭제 시 또는 주기적으로 `auth.admin.deleteUser()`로 정리하는 로직이 필요하다.

---

## 8. 트랜잭션 전환 목록

모든 Firestore `runTransaction`을 PostgreSQL 함수 + `supabase.rpc()`로 변환해야 한다.

| 파일 | 함수 | 트랜잭션 횟수 | 복잡도 |
|------|------|-------------|--------|
| `auctionFlowActions.ts` | `drawNextPlayer` | 1 | 중 |
| `auctionFlowActions.ts` | `startAuction` | 1 | 중 |
| `auctionFlowActions.ts` | `pauseAuction` | 1 | 하 |
| `auctionFlowActions.ts` | `resumeAuction` | 1 | 하 |
| `auctionFlowActions.ts` | `closeLotteryAction` | 1 | 중 |
| `auctionFlowActions.ts` | `placeBid` | 1 | 상 (입찰 검증 복잡) |
| `auctionFlowActions.ts` | `awardPlayer` | 1 | 상 (선수 상태 + 팀 포인트 + 이벤트 발행) |
| `auctionFlowActions.ts` | `draftPlayer` | 1 | 중 |
| `auctionFlowActions.ts` | `restartAuctionWithUnsold` | 1 | 중 |
| `placeBidClient.ts` | `placeBid` (클라이언트) | 1 | 상 (원자성 보장 패턴 변경) |
| `scheduleActions.ts` | 일정 저장 | 3 | 하~중 |
| `timer-lab/actions.ts` | 타이머 랩 | 3 | 하 |
| **합계** | | **16개** | |

---

## 9. 이관 우선순위 및 단계별 계획

### Phase 1: 기반 설정 (위험도 낮음, 1~2주)

- [ ] PostgreSQL 스키마 생성 + 인덱스 (`supabase db push`)
- [ ] Supabase TypeScript 타입 생성 (`supabase gen types`)
- [ ] Service Role Client 설정 (`firebaseAdmin.ts` 대체)
- [ ] 비실시간 도메인 이관: `hall_of_fame`, `auction_archives`, `league_schedules`
- [ ] 데이터 마이그레이션 스크립트 작성 (Firestore → Postgres 일회성)

### Phase 2: 인증 전환 (위험도 중간, 1주)

- [ ] Supabase Anonymous Auth + Custom Access Token Hook 설정
- [ ] RLS 정책 구현 (`isBidUpdate` 등)
- [ ] `/api/room-auth/firebase-token` → `/api/room-auth/supabase-token` 전환
- [ ] `src/lib/firebase.ts`의 `ensureRoomFirebaseAuth` → Supabase 버전 교체
- [ ] Anonymous 유저 정리 로직 추가

### Phase 3: 실시간 비경매 데이터 (위험도 중간, 1주)

- [ ] Teams, Players 초기 fetch + Postgres Changes 구독 전환
- [ ] Messages 구독 전환 (`limitToLast(200)` 패턴 적용)
- [ ] `useCreateRoom.ts` 쿼리 전환
- [ ] `roomActions.ts` CRUD 전환 (`batch` → Postgres 트랜잭션)

### Phase 4: 실시간 경매 핵심 (위험도 높음, 2~3주)

- [ ] Supabase Broadcast 채널 설정 (서버 사이드 send)
- [ ] `auctionFlowActions.ts` PostgreSQL 함수 9개 작성
- [ ] `scheduleActions.ts` PostgreSQL 함수 3개 작성
- [ ] Room 구독 전환 (Room 문서 + Broadcast 폴백)
- [ ] 입찰 내역 구독 전환 (RTDB bids → Postgres Changes)
- [ ] `placeBidClient.ts` → `supabase.rpc('place_bid')` 전환
- [ ] Presence 전환 (RTDB → Supabase Presence, grace time 재조정)
- [ ] `useAuctionPresenceGuard.ts` 연결 끊김 감지 방식 전환

### Phase 5: 정리 및 검증 (1주)

- [ ] Watchdog Cron → `pg_cron` 전환
- [ ] Timer Lab 전환
- [ ] E2E Fixture 데이터 구조 갱신
- [ ] 전체 E2E 테스트 통과 확인
- [ ] Firebase SDK 의존성 제거 (`firebase`, `firebase-admin` 패키지)
- [ ] 환경변수 정리 (Firebase 관련 제거, Supabase 관련 추가)

---

## 10. 기능별 트레이드오프

| 관점 | Firebase 현재 | Supabase 이관 후 | 영향 |
|------|--------------|-----------------|------|
| **실시간 레이턴시 (이벤트)** | RTDB: ~50ms | Broadcast: ~50ms | 동일 |
| **실시간 레이턴시 (데이터)** | Firestore onSnapshot: ~100ms | Postgres Changes: ~100-200ms | 약간 증가 |
| **클라이언트 직접 입찰** | Firestore 클라이언트 트랜잭션 (서버 왕복 없음) | `supabase.rpc()` (서버 왕복 추가) | 레이턴시 약 50-100ms 증가 |
| **Presence 감지** | `onDisconnect` 즉시 (~0ms) | heartbeat 기반 (~10초) | 팀장 연결 끊김 감지 지연 |
| **트랜잭션 모델** | 낙관적 (충돌 시 자동 재시도) | 비관적 (FOR UPDATE 잠금) | 고부하 시 잠금 경합 가능 |
| **초기 데이터 로딩** | onSnapshot 자동 제공 | 별도 fetch 필요 (race condition 주의) | 코드 복잡도 증가 |
| **보안 규칙** | Firestore DSL (제한적) | RLS (SQL, 강력하고 표현력 높음) | 보안 강화 |
| **스키마 유연성** | Document DB (스키마리스) | 관계형 (마이그레이션 필요) | 타입 안전성 증가, 유연성 감소 |
| **서버 사이드 SDK** | Admin SDK (전용 패키지, 사용 편의) | Service Role Key (동일 SDK, 직관적) | 동등 |
| **비용 구조** | 읽기/쓰기 횟수 과금 | 연결 수 + 데이터 전송량 과금 | 경매 특성상 Supabase 유리 가능 |
| **타입 안전성** | 수동 타입 정의 필요 | `supabase gen types`로 자동 생성 | 개발 생산성 향상 |
| **쿼리 유연성** | 복합 인덱스 제한 | 완전한 SQL 쿼리 | 집계/분석 쿼리 용이 |

---

## 참고 파일 목록

| 파일 | 관련 내용 |
|------|---------|
| `src/lib/firebase.ts:23-65` | 클라이언트 Firebase Auth (`ensureRoomFirebaseAuth`) |
| `src/lib/firebaseAdmin.ts:1-52` | Admin SDK 초기화 및 lazy proxy |
| `src/features/auction/realtime/serverAdapter.ts:1-25` | 서버 Firestore + RTDB 인스턴스 |
| `src/features/auction/realtime/clientAdapter.ts:1-28` | 클라이언트 Firestore + RTDB 인스턴스 |
| `src/features/auction/hooks/useAuctionRealtime.ts:122-699` | Firestore onSnapshot 4개 + RTDB onValue 3개 |
| `src/features/auction/hooks/usePresence.ts:28-117` | RTDB Presence (`onDisconnect` + `.info/connected`) |
| `src/features/auction/api/auctionFlowActions.ts:1-1125` | 핵심 경매 트랜잭션 9개 |
| `src/features/auction/api/placeBidClient.ts:42-154` | 클라이언트 직접 입찰 트랜잭션 |
| `src/features/auction/api/roomActions.ts:85-293` | 방 CRUD (`batch`, `recursiveDelete`) |
| `src/features/auction/api/chatActions.ts:37-125` | 채팅/공지 (Firestore + RTDB 듀얼) |
| `src/app/api/room-auth/route.ts:19-142` | 토큰 검증 + 쿠키 인증 |
| `src/app/api/room-auth/firebase-token/route.ts:19-53` | Firebase Custom Token 발급 |
| `src/features/auction/utils/roomAuth.ts:1-132` | 인증 유틸리티 |
| `src/features/auction/store/useAuctionStore.ts:9-115` | 핵심 데이터 타입 정의 |
| `src/features/auction/utils/auctionRealtime.ts:237-322` | `applyAuctionEventToState` |
| `src/features/auction/hooks/useAuctionPresenceGuard.ts:20-130` | Presence 기반 경매 일시정지/재개 |
| `database.rules.json:1-29` | RTDB 보안 규칙 |
| `firestore.rules:1-135` | Firestore 보안 규칙 (`isBidUpdate` 포함) |
| `src/app/api/auction-watchdog/route.ts:1-76` | 만료 경매 복구 cron |
| `src/features/hall-of-fame/api/hallOfFameActions.ts:1-147` | 명예의 전당 CRUD |
| `src/features/schedules/api/scheduleActions.ts:1-995` | 리그 일정 CRUD + 트랜잭션 |
| `src/features/timer-lab/actions.ts:1-365` | 타이머 랩 (Firestore + RTDB) |
| `src/features/auction/realtime/e2eAuctionFixture.ts` | E2E 테스트 Fixture (구조 갱신 필요) |
