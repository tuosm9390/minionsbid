Date: 2026-03-16 21:35:00
Author: Antigravity

# Firebase Migration Design: Supabase ➔ Firestore

이 문서는 League Auction 프로젝트의 데이터베이스를 Supabase(PostgreSQL)에서 Firebase(Firestore)로 이전하기 위한 데이터 구조 및 실시간 통신 설계를 정의합니다.

## 1. 컬렉션 구조 (Collection Structure)

Firestore의 계층적 구조를 활용하여 경매 방(`room`) 중심의 설계를 적용합니다.

### 📁 rooms (Root Collection)

각 경매 방의 메타데이터와 현재 상태를 저장합니다.

- **Document ID**: `{roomId}` (UUID string)
- **Fields**:
  - `name`: string
  - `total_teams`: number
  - `base_point`: number
  - `members_per_team`: number
  - `timer_ends_at`: timestamp | null
  - `current_player_id`: string | null
  - `organizer_token`: string
  - `viewer_token`: string
  - `created_at`: timestamp

#### 📁 teams (Sub-collection)

- **Document ID**: `{teamId}` (UUID string)
- **Fields**:
  - `name`: string
  - `point_balance`: number
  - `leader_token`: string
  - `leader_name`: string
  - `leader_position`: string
  - `leader_description`: string
  - `captain_points`: number

#### 📁 players (Sub-collection)

- **Document ID**: `{playerId}` (UUID string)
- **Fields**:
  - `name`: string
  - `tier`: string
  - `main_position`: string
  - `sub_position`: string
  - `status`: "WAITING" | "IN_AUCTION" | "SOLD" | "UNSOLD"
  - `team_id`: string | null
  - `sold_price`: number
  - `description`: string

#### 📁 bids (Sub-collection)

- **Document ID**: Auto-generated
- **Fields**:
  - `player_id`: string
  - `team_id`: string
  - `amount`: number
  - `created_at`: timestamp

#### 📁 messages (Sub-collection)

- **Document ID**: Auto-generated
- **Fields**:
  - `sender_name`: string
  - `sender_role`: "ORGANIZER" | "LEADER" | "VIEWER" | "SYSTEM" | "NOTICE"
  - `content`: string
  - `created_at`: timestamp

### 📁 auction_archives (Root Collection)

완료된 경매의 스냅샷을 영구 저장합니다.

- **Document ID**: Auto-generated
- **Fields**:
  - `room_id`: string
  - `room_name`: string
  - `room_created_at`: timestamp
  - `closed_at`: timestamp
  - `result_snapshot`: map (Snapshot of teams and players)

## 2. 실시간 통신 패턴 (Realtime Pattern)

기존 Supabase Channel 구독을 Firestore `onSnapshot` 리스너로 대체합니다.

- **Room Data**: `onSnapshot(doc(db, "rooms", roomId))`
- **Teams/Players**: `onSnapshot(collection(db, "rooms", roomId, "teams/players"))`
- **Messages**: `onSnapshot(query(collection(db, "rooms", roomId, "messages"), orderBy("created_at", "desc"), limit(50)))`

## 3. 핵심 비즈니스 로직 (Transactions)

입찰(`placeBid`) 및 선수 낙찰(`awardPlayer`) 시 동시성 이슈를 방지하기 위해 Firestore Transaction을 사용합니다.

- `placeBid`: 입찰자의 포인트 잔액 확인 및 최고 입찰가 갱신을 원자적으로 처리.
- `awardPlayer`: 타이머 종료 여부와 선수 상태를 확인하고 포인트 차감 및 팀 할당을 한 번에 처리.
