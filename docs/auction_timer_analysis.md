# 실시간 경매 타이머 기능 요구사항 분석 및 설계 검토

## 1. 현재 구현 분석

제공된 `minionsbid` 프로젝트는 Firebase Realtime Database (RTDB)와 Firestore를 활용하여 경매 기능을 구현하고 있습니다. 주요 로직은 다음과 같습니다.

*   **Firestore**: 경매의 캐노니컬(canonical) 상태(예: `current_player_id`, `active_bid`, `timer_ends_at`, `auction_revision`, `last_auction_event`)를 저장하는 데 사용됩니다. 이는 주로 서버 측에서 관리되며, 클라이언트의 직접 입찰(direct bid) 시 트랜잭션을 통해 업데이트됩니다.
*   **Realtime Database (RTDB)**: 저지연(low-latency) 데이터 전파를 위해 사용됩니다. `signals/{roomId}/auctionEvent` 경로를 통해 경매 이벤트(예: `BID_PLACED`, `AUCTION_STARTED`)를 브로드캐스트하여 클라이언트들이 실시간으로 상태를 동기화합니다.
*   **Server Actions**: `auctionFlowActions.ts`에 정의된 서버 액션들은 선수 추첨, 경매 시작, 낙찰 처리 등 경매의 핵심 흐름을 제어합니다. 이들은 주로 Firestore를 업데이트하고 RTDB를 통해 이벤트를 발행합니다.
*   **Client-side Direct Bid (`placeBidClient.ts`)**: 클라이언트에서 직접 Firestore 트랜잭션을 통해 입찰을 처리하여 지연을 최소화합니다. Firestore 보안 규칙(`firestore.rules`)이 입찰의 유효성을 최종적으로 검증합니다.
*   **타이머 로직**: `auctionTimings.ts`에 정의된 상수(`AUCTION_DURATION_MS`, `EXTEND_THRESHOLD_MS`, `EXTEND_DURATION_MS`)를 기반으로 타이머가 동작합니다. 특히 `EXTEND_THRESHOLD_MS` (5초)는 입찰 시 타이머 연장 여부를 결정하는 핵심 값입니다.

## 2. 요구사항별 분석 및 구현 전제

사용자께서 제시하신 요구사항들을 현재 코드와 비교하여 분석하고, 구현 전제 조건을 정리합니다.

### 요구사항 1: 최소 3명 이상의 유저가 하나의 room에 입장

*   **현재 구현**: `RoomClient.tsx` 및 `OrganizerControlPanel.tsx`에서 `allConnected` 상태를 통해 모든 리더가 연결되었는지 확인하는 로직이 존재합니다. 이는 최소 3명 이상의 유저(주최자 1명 + 최소 2명의 리더)가 필요하다는 전제를 간접적으로 반영합니다. 그러나 명시적으로 '최소 3명'을 강제하는 로직은 보이지 않습니다. 현재는 '주최자 + 팀 수만큼의 리더'가 연결되어야 경매 시작 버튼이 활성화되는 방식으로 보입니다.
*   **구현 전제**: 경매 시작 전, `room`에 `ORGANIZER` 역할의 유저 1명과 `LEADER` 역할의 유저가 최소 2명 이상(`teams.length`에 따라) 참여했는지 확인하는 로직이 필요합니다. 이 조건이 충족되지 않으면 경매 시작을 막아야 합니다.
*   **Supabase 이관 시 고려사항**: Supabase Realtime 또는 WebSockets를 사용하여 유저의 `room` 입장 및 역할 정보를 실시간으로 관리해야 합니다. `presence` 기능을 활용하여 `room` 내 유저 수를 파악하고, 각 유저의 `role`을 검증하는 로직이 필요합니다.

### 요구사항 2: 주최자 1명을 제외하고 모든 leader 권한을 가진 유저만 bid(입찰)을 진행할 수 있음

*   **현재 구현**: `firestore.rules`에서 `isBidUpdate` 함수를 통해 `request.auth.token.role == 'LEADER'` 조건을 명시적으로 검증하고 있습니다. 이는 `LEADER` 역할만 입찰할 수 있도록 강제합니다. `useAuctionControl.ts`에서도 `effectiveRole !== 'ORGANIZER'`와 같은 체크를 통해 주최자의 입찰을 막고 있습니다.
*   **구현 전제**: `LEADER` 역할의 유저만 입찰을 시도할 수 있도록 클라이언트 UI에서 제어하고, 서버 측(Firestore 보안 규칙 또는 Supabase Row Level Security)에서 `role` 기반의 입찰 권한을 강력하게 검증해야 합니다.
*   **Supabase 이관 시 고려사항**: Supabase의 Row Level Security (RLS) 정책을 사용하여 `bids` 테이블에 `LEADER` 역할의 유저만 `INSERT` 또는 `UPDATE`할 수 있도록 설정해야 합니다. 인증 시 `role` 클레임을 포함하는 JWT를 사용해야 합니다.

### 요구사항 3: 주최자가 선수를 추첨하고 경매를 시작하면 leader권한 유저들은 입찰 가능

*   **현재 구현**: `drawNextPlayer` 서버 액션(`auctionFlowActions.ts`)이 `WAITING` 상태의 선수를 `IN_AUCTION`으로 변경하고, `startAuction` 서버 액션이 `timer_ends_at`을 설정하여 경매를 시작합니다. `useBiddingControl.ts`의 `canBid` 로직은 `isAuctionActive` (타이머가 설정되고 만료되지 않음) 및 `hasCurrentPlayer` (경매 중인 선수가 있음) 조건을 포함하여 입찰 가능 여부를 결정합니다.
*   **구현 전제**: 주최자가 선수 추첨(`drawNextPlayer`) 및 경매 시작(`startAuction`) 액션을 순차적으로 호출해야 합니다. 이 두 액션이 성공적으로 완료되어 `current_player_id`와 `timer_ends_at`이 설정되면 `LEADER` 유저들은 입찰을 시작할 수 있습니다.
*   **Supabase 이관 시 고려사항**: Supabase Functions (Edge Functions) 또는 Database Functions (PostgreSQL Functions)를 사용하여 `drawNextPlayer` 및 `startAuction`과 같은 서버 액션을 구현해야 합니다. 이 함수들은 `players` 및 `rooms` 테이블의 상태를 안전하게 변경하고, 변경 사항을 실시간으로 클라이언트에 전파해야 합니다.

### 요구사항 4: 타이머는 경매가 시작되는 시간 기준으로 현재시간 + 10초후에 종료되는 10초 타이머로 시작

*   **현재 구현**: `auctionTimings.ts`에 `AUCTION_DURATION_MS = 10_000` (10초)로 정의되어 있으며, `startAuction` 서버 액션(`auctionFlowActions.ts`)에서 이 값을 사용하여 `timer_ends_at`을 `Date.now() + AUCTION_DURATION_MS`로 설정합니다. 이는 요구사항과 정확히 일치합니다.
*   **구현 전제**: 경매 시작 시 `timer_ends_at` 필드를 서버 시간 기준으로 정확히 10초 뒤로 설정해야 합니다. 클라이언트는 이 `timer_ends_at` 값을 기준으로 타이머 UI를 렌더링합니다.
*   **Supabase 이관 시 고려사항**: Supabase Database Functions에서 `NOW()` 함수를 사용하여 서버 시간을 기준으로 `timer_ends_at`을 계산하고 설정해야 합니다. 클라이언트와 서버 간의 시간 동기화 문제를 최소화하기 위해 서버 시간을 사용하는 것이 중요합니다.

### 요구사항 5: 현재시간 - 5초 < 종료시간 일 경우는 각 leader 유저들이 입찰을 해도 타이머가 갱신되지 않음.

*   **현재 구현**: `auctionTimings.ts`에 `EXTEND_THRESHOLD_MS = 5_000` (5초)로 정의되어 있습니다. `placeBidClient.ts`의 `shouldOptimisticallyResetTimer` 로직은 `new Date(timerEndsAt).getTime() - bidClickedAt < EXTEND_THRESHOLD_MS` (즉, 남은 시간이 5초 미만일 경우)일 때 `true`가 되어 타이머 연장을 시도합니다. `firestore.rules`의 `isValidDirectBidTimerUpdate` 함수 또한 `before.timer_ends_at <= request.time + duration.value(5, 's')` (즉, 남은 시간이 5초 이하일 경우)일 때 타이머 연장을 허용합니다. 이는 **남은 시간이 5초 이상일 경우 타이머가 갱신되지 않도록 하는 사용자 요구사항과 정확히 일치합니다.**
*   **구현 전제**: 현재 코드는 사용자 요구사항에 부합합니다. 타이머 갱신 로직을 변경할 필요는 없습니다.
*   **Supabase 이관 시 고려사항**: Supabase Database Functions 또는 Edge Functions에서 입찰 처리 로직을 구현할 때, 이 타이머 갱신 조건을 정확히 반영해야 합니다. RLS 정책에서도 이 조건을 검증하여 데이터 무결성을 유지해야 합니다.

### 요구사항 6: 현재시간 - 5초 > 종료시간 일 경우 leader 유저들이 입찰할 때마다 입찰을 요청한 시점부터 5초뒤에 만료되는 타이머로 갱신함

*   **현재 구현**: `placeBidClient.ts`에서 `shouldOptimisticallyResetTimer`가 `true`일 경우 (즉, 남은 시간이 5초 미만일 경우), `nextTimerEndsAt`을 `now + EXTEND_DURATION_MS` (5초)로 설정합니다. 이는 '입찰 시점부터 5초 뒤에 만료되는 타이머로 갱신'하는 요구사항과 일치합니다. 이 로직은 **남은 시간이 5초 미만일 경우 타이머를 갱신하는 사용자 요구사항과 정확히 일치합니다.**
*   **구현 전제**: 현재 코드는 사용자 요구사항에 부합합니다. 타이머 갱신 로직을 변경할 필요는 없습니다.
*   **Supabase 이관 시 고려사항**: Supabase Functions에서 `timer_ends_at` 갱신 로직을 구현할 때, `NOW()`를 기준으로 `EXTEND_DURATION_MS`를 더하여 새로운 종료 시간을 설정해야 합니다.

### 요구사항 6-1: 입찰이 진행될 때마다 5초가 추가되는게 아니라 계속해서 입찰 시점 기준으로 5초 후에 만료되는 타이머 시간 설정

*   **현재 구현**: `placeBidClient.ts`에서 `nextTimerEndsAt`을 `now + EXTEND_DURATION_MS`로 설정하는 방식은 '입찰 시점 기준으로 5초 후에 만료되는 타이머'를 의미합니다. 즉, 현재 시간에 5초를 더하는 방식이므로, 요구사항과 일치합니다.
*   **구현 전제**: 타이머 갱신 시 `timer_ends_at = Date.now() + EXTEND_DURATION_MS` 공식을 일관되게 적용해야 합니다.
*   **Supabase 이관 시 고려사항**: Supabase Functions에서 `NOW() + INTERVAL '5 seconds'`와 같은 형태로 구현할 수 있습니다.

### 요구사항 7: 현재시간 < 종료시간 이 되었을 때 경매를 종료하고 경매 종료 알림을 표시

*   **현재 구현**: `useAuctionControl.ts`의 `useEffect` 훅에서 `effectiveRole === 'ORGANIZER'`인 클라이언트가 `timerEndsAt`을 모니터링하여 타이머가 만료되면 (`new Date(timerEndsAt).getTime() - Date.now()`가 0에 가까워지면) `triggerAward(playerId)`를 호출하여 자동 낙찰을 시도합니다. 이는 경매 종료 및 낙찰 처리 로직입니다. 경매 종료 알림은 `sysMsg` 함수를 통해 시스템 메시지로 전파됩니다.
*   **구현 전제**: 타이머 만료 시점(`timer_ends_at`)에 도달하면, 경매를 종료하고 낙찰 처리(또는 유찰 처리)를 진행해야 합니다. 이 과정에서 모든 클라이언트에게 경매 종료 및 결과 알림을 실시간으로 전파해야 합니다.
*   **Supabase 이관 시 고려사항**: Supabase Realtime의 `channels` 또는 `broadcast` 기능을 사용하여 경매 종료 이벤트를 모든 클라이언트에 전파할 수 있습니다. 또한, Supabase Functions를 사용하여 `timer_ends_at`이 만료되었을 때 자동으로 낙찰/유찰 처리 로직을 트리거하는 스케줄링된 함수(예: `pg_cron` 또는 외부 스케줄러)를 고려할 수 있습니다. 현재 Firebase의 `auction-watchdog`와 유사한 역할을 할 수 있습니다.

## 3. 설계 개선 제안 및 놓친 부분

### 3.1. 타이머 동기화 및 신뢰성

현재 구현은 클라이언트에서 `placeBidDirect`를 통해 직접 Firestore를 업데이트하고, 이후 `broadcastBidEvent`를 통해 RTDB로 이벤트를 전파하는 하이브리드 방식을 사용합니다. 이는 빠른 응답성을 제공하지만, 다음과 같은 점을 고려해야 합니다.

*   **클라이언트 시간 의존성**: `placeBidClient.ts`에서 `Date.now()`를 사용하여 `shouldOptimisticallyResetTimer`를 계산하고 `new Date(bidClickedAt + EXTEND_DURATION_MS).toISOString()`으로 `timerEndsAt`을 설정하는 부분이 있습니다. 클라이언트와 서버 간의 시간 차이(clock skew)가 발생할 경우 타이머 동기화 문제가 발생할 수 있습니다. Firestore 트랜잭션 내부에서는 `Timestamp.now()`를 사용하므로 서버 시간을 따르지만, 클라이언트의 낙관적 업데이트 시점에는 클라이언트 시간을 사용합니다.
*   **개선 제안**: 모든 타이머 관련 시간 계산은 **반드시 서버 측에서만** 수행되어야 합니다. 클라이언트는 단순히 입찰 요청을 보내고, 서버에서 계산된 `timer_ends_at` 값을 받아 UI를 갱신하는 방식으로 변경하는 것이 가장 신뢰성 높습니다. Supabase로 이관 시, Edge Functions 또는 Database Functions 내에서 `NOW()`를 사용하여 `timer_ends_at`을 계산하도록 강제해야 합니다.

### 3.2. Supabase 이관 시 아키텍처 고려사항

Firebase에서 Supabase로 이관할 경우, 다음과 같은 아키텍처 변경을 고려해야 합니다.

*   **Realtime Database 대체**: Firebase RTDB의 저지연 브로드캐스트 기능은 Supabase Realtime의 `channels` 또는 `broadcast` 기능을 통해 대체할 수 있습니다. `auctionEvent`와 같은 실시간 이벤트 전파에 활용합니다.
*   **Firestore 대체**: Firestore의 문서 기반 데이터 모델은 Supabase PostgreSQL의 테이블로 매핑될 수 있습니다. `rooms`, `players`, `bids` 등의 컬렉션은 각각 테이블로 전환됩니다.
*   **Server Actions 대체**: Firebase Cloud Functions 또는 Vercel Server Actions로 구현된 로직은 Supabase Edge Functions (Deno 기반) 또는 PostgreSQL Functions (PL/pgSQL, SQL)로 대체할 수 있습니다. 특히 트랜잭션이 필요한 입찰 로직은 PostgreSQL Functions에서 구현하는 것이 데이터 무결성 측면에서 유리합니다.
*   **보안 규칙 대체**: Firestore 보안 규칙은 Supabase Row Level Security (RLS) 정책으로 대체됩니다. `LEADER` 역할 검증, 입찰 금액 유효성 검증, 타이머 갱신 조건 검증 등을 RLS 정책에 명시하여 데이터베이스 수준에서 보안을 강화해야 합니다.
*   **Watchdog 대체**: 현재 `auction-watchdog`와 같은 타이머 만료 처리 로직은 Supabase의 `pg_cron` 확장 또는 외부 스케줄링 서비스를 통해 구현할 수 있습니다. `timer_ends_at`이 지난 경매를 주기적으로 스캔하여 낙찰/유찰 처리하는 방식입니다.

### 3.3. 추가적인 고려사항

*   **네트워크 지연**: 실시간 경매에서 네트워크 지연은 매우 중요합니다. 현재 `LATENCY_DEBUG`와 같은 디버깅 기능이 있지만, Supabase 환경에서도 지연을 최소화하기 위한 아키텍처 설계(예: Edge Functions 사용)가 필요합니다.
*   **동시성 제어**: 여러 리더가 동시에 입찰을 시도할 때 발생할 수 있는 동시성 문제를 Supabase 트랜잭션(PostgreSQL `FOR UPDATE` 또는 `Serializable` 격리 수준)을 통해 안전하게 처리해야 합니다.
*   **테스트**: 타이머 로직은 복잡하고 시간에 민감하므로, E2E 테스트 및 시나리오 기반 테스트를 철저히 수행하여 모든 엣지 케이스를 검증해야 합니다.

## 결론

현재 `minionsbid` 프로젝트의 실시간 경매 타이머 기능은 Firebase를 기반으로 잘 설계되어 있습니다. 특히 클라이언트 직접 입찰과 서버 액션의 조합은 지연을 최소화하려는 노력이 돋보입니다. 사용자께서 제시하신 요구사항 5와 6의 타이머 갱신 로직은 현재 코드와 정확히 일치하는 것으로 확인되었습니다.

Supabase로의 이관은 Firebase의 각 기능을 Supabase의 상응하는 기능(PostgreSQL, Realtime, Edge Functions, RLS)으로 매핑하는 과정이 될 것입니다. 이 과정에서 타이머 로직의 신뢰성을 높이기 위해 모든 시간 계산을 서버 측에서 수행하도록 변경하는 것을 강력히 권장합니다.
