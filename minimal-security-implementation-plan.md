# 최소 유지 보안선 및 구현 계획서

작성일: 2026-05-19.

## 목표

소규모 지인용 링크 공유 운영 모델을 유지하면서, 경매 결과를 바꿀 수 있는 최소 위험만 막는다. 계정 시스템, 세션 DB, 복잡한 권한 모델은 추가하지 않는다.

핵심 성공 기준은 다음이다.

- 팀장은 자기 팀 링크로만 입찰할 수 있다.
- 주최자 액션과 공지는 기존 organizer token으로만 실행된다.
- direct bid Firestore rules는 경매 정합성 검증을 유지한다.
- RTDB 이벤트 revision은 클라이언트 입력을 그대로 믿지 않는다.
- 공개 입찰, 비공개 입찰, 공지, 경매 종료 흐름이 기존 UX를 유지한다.

## 최소 유지 권장 범위

### 반드시 유지

1. `room_auth_secrets` 기반 역할 토큰.
   - 새 계정 시스템은 만들지 않는다.
   - 기존 URL token을 계속 사용한다.
   - 서버에서 `roomId + role + teamId + token` 조합만 대조한다.

2. Firestore direct bid rules.
   - `isBidUpdate(roomId)`와 `isBidHistoryCreate(roomId)`는 유지한다.
   - 유지해야 할 검증은 `role`, `roomId`, `teamId`, 변경 가능 필드 제한, 현재 선수, 타이머, revision `+1`, 포인트 잔액이다.
   - rules를 `if true` 또는 단순 signed-in 허용으로 낮추지 않는다.

3. 서버 액션 fallback의 team token 검증.
   - `placeBid`는 direct bid 실패 시 쓰이는 공식 fallback이므로 direct bid와 같은 권한 경계가 필요하다.
   - `submitSealedBid`도 팀 단위 제출이므로 leader token 대조가 필요하다.

4. 주최자 전용 서버 액션의 organizer token 검증.
   - 이미 적용된 경매 시작, 추첨, 낙찰, 삭제 흐름은 유지한다.
   - `sendNotice`도 같은 기준으로 맞춘다.

5. `broadcastBidEvent`의 서버 재검산.
   - 클라이언트가 보낸 `revision`, `teamName`, `timerEndsAt`을 그대로 신뢰하지 않는다.
   - 서버가 room과 team을 읽어 현재 canonical `active_bid`, `auction_revision`, 팀명 기준으로 이벤트를 만든다.

### 완화 가능

1. 공개 read 범위.
   - room id를 아는 사용자의 `rooms/{roomId}` 단건 read와 하위 `teams`, `players`, `messages`, `bids` read는 유지해도 된다.

2. 일반 채팅.
   - 소규모 운영에서는 일반 채팅 메시지에 강한 역할 검증을 두지 않아도 된다.
   - 단, `NOTICE`와 `SYSTEM` 역할은 서버만 만들게 제한하는 것이 좋다.

3. 전체 lint gate.
   - 운영 전 최소선은 경매 핵심 테스트와 rules smoke다.
   - 전체 lint 실패는 별도 정리 과제로 둔다.

### 유지하지 말아야 할 완화

1. `rooms/{roomId}` update 전체 개방.
2. 클라이언트 입력 `revision` 그대로 RTDB fanout.
3. `teamId`만으로 입찰 또는 비공개 제출 허용.
4. organizer token 없는 공지 생성.

## 구현 계획

### 1단계. 역할 토큰 검증 헬퍼 정리

대상 파일 후보.

- `src/features/auction/utils/roomAuth.ts`
- `src/features/auction/api/organizerAuth.ts`
- 새 서버 전용 헬퍼 파일이 필요하면 `src/features/auction/api/roomRoleAuth.ts`

작업.

- `requireRoomLeader(roomId, teamId, token)` 헬퍼를 추가한다.
- `room_auth_secrets/{roomId}/team_tokens/{teamId}.leader_token`과 입력 token을 timing-safe 방식으로 비교한다.
- fixture 모드는 기존 fixture auth 흐름을 유지하거나 테스트 전용 분기를 둔다.
- 기존 `validateRoomAuthToken` 로직과 중복되면 서버 헬퍼에서 재사용한다.

검증.

- `roomAuthUtils.test.ts` 또는 새 테스트에서 올바른 leader token, 잘못된 token, 다른 team token을 검증한다.

### 2단계. Firebase custom token 발급 API 보호

대상 파일.

- `src/app/api/room-auth/firebase-token/route.ts`
- `src/lib/firebase.ts`
- room 입장 또는 auth context 전달부.

작업.

- `/api/room-auth/firebase-token` 요청 payload에 역할 token을 포함한다.
- `role === 'ORGANIZER'`면 organizer token을 검증한다.
- `role === 'LEADER'`면 `teamId + leader token`을 검증한다.
- `role === 'VIEWER'`면 viewer token을 검증하거나, 뷰어 링크를 공개로 둘지 명시적으로 결정한다.
- 검증 실패 시 custom token을 발급하지 않는다.

주의.

- 현재 `RoomPage`는 organizer token만 `token` query에서 읽고, leader token은 별도 전달이 약하다.
- `LinksModal`과 방 생성 결과 링크에서 팀장 URL에 leader token을 포함하는 기존 규칙을 먼저 확인해야 한다.

검증.

- API route 테스트를 추가한다.
- 잘못된 teamId로 custom token 발급이 실패해야 한다.

### 3단계. 공개 입찰 fallback에 leader token 검증 추가

대상 파일.

- `src/features/auction/api/auctionFlowActions.ts`
- `src/features/auction/hooks/useBiddingControl.ts`
- 필요 시 `RoomClient` 또는 store의 leader token 보관 흐름.

작업.

- `placeBid(roomId, playerId, teamId, amount)`를 `placeBid(roomId, playerId, teamId, amount, leaderToken)` 형태로 바꾼다.
- 서버 액션 시작부에서 `requireRoomLeader(roomId, teamId, leaderToken)`을 호출한다.
- direct bid 실패 fallback 호출부에서 현재 팀의 leader token을 넘긴다.
- token이 없거나 틀리면 일반 사용자 오류를 반환한다.

검증.

- `auctionActions.test.ts`에 다른 팀 token 또는 누락 token 거부 케이스를 추가한다.
- 기존 정상 입찰 테스트가 유지되어야 한다.

### 4단계. 비공개 입찰 제출에 leader token 검증 추가

대상 파일.

- `src/features/auction/api/auctionFlowActions.ts`
- `src/features/auction/components/SealedBiddingControl.tsx`
- 관련 hook 또는 store.

작업.

- `submitSealedBid(roomId, playerId, teamId, amount)`에 leader token 인자를 추가한다.
- 제출 전에 `requireRoomLeader`를 통과해야 한다.
- 재입찰 대상 팀 제한, 포인트 검증, 타이머 검증은 기존대로 유지한다.

검증.

- 정상 제출, 잘못된 token, 다른 팀 token, 재입찰 대상 외 팀 제출 거부 테스트를 추가한다.

### 5단계. 공지 메시지에 organizer token 검증 추가

대상 파일.

- `src/features/auction/api/chatActions.ts`
- `src/app/room/[id]/RoomClient.tsx`

작업.

- `sendNotice(roomId, content)`를 `sendNotice(roomId, organizerToken, content)`로 바꾼다.
- 서버 액션에서 `requireRoomOrganizer(roomId, organizerToken)`을 호출한다.
- `RoomClient`의 `handleNotice`에서 store의 organizer token을 전달한다.

검증.

- organizer token 누락 또는 오류 시 공지 생성이 거부되는 테스트를 추가한다.

### 6단계. `broadcastBidEvent` 서버 재검산

대상 파일.

- `src/features/auction/api/auctionFlowActions.ts`
- `src/features/auction/hooks/useBiddingControl.ts`

작업.

- `broadcastBidEvent`가 클라이언트 입력 `revision`, `timerEndsAt`, `teamName`을 그대로 이벤트에 쓰지 않게 한다.
- 서버에서 `rooms/{roomId}`를 읽고 다음을 확인한다.
  - 현재 `active_bid.player_id === playerId`.
  - 현재 `active_bid.team_id === teamId`.
  - 현재 `active_bid.amount === amount`.
  - 현재 `auction_revision`이 direct bid 결과 revision과 일치한다.
- 검증이 맞을 때만 RTDB 이벤트와 `last_auction_event`를 발행한다.
- team name은 `teams/{teamId}.name`에서 읽는다.

검증.

- revision을 크게 넣어도 canonical room revision과 맞지 않으면 이벤트를 발행하지 않는 테스트를 추가한다.
- 정상 direct bid 후 broadcast는 계속 동작해야 한다.

### 7단계. Firestore rules는 유지하고 smoke 보강

대상 파일.

- `firestore.rules`
- `scripts/smoke_room_rules.js`

작업.

- direct bid rules를 완화하지 않는다.
- smoke에 다음을 추가할 수 있으면 추가한다.
  - 다른 teamId claim으로 room update 실패.
  - `auction_revision` 점프 실패.
  - 허용 필드 외 변경 실패.

검증.

- `npm run smoke:room-rules`.

## 최소 테스트 계획

우선 실행할 명령.

```bash
npx vitest run __tests__/roomAuthUtils.test.ts __tests__/organizerAuth.test.ts __tests__/auctionActions.test.ts
npx vitest run __tests__/useBiddingControl.test.tsx __tests__/useAuctionRealtime.test.tsx
npm run smoke:room-rules
```

경매 흐름 변경 후 실행할 명령.

```bash
npm run test:e2e:auction
```

전체 품질 회복용 후속 명령.

```bash
npm run test
npm run lint
```

현재 lint는 별도 기존 실패가 많으므로, 이번 보안 최소선 작업의 완료 조건에는 경매 핵심 테스트와 smoke를 우선한다.

## 예상 리스크와 대응

1. leader token이 현재 클라이언트 state에 없을 수 있다.
   - 방 입장 파라미터와 store 저장 흐름을 먼저 확인한다.
   - 없다면 URL query token을 읽어 store에 저장하는 최소 변경이 필요하다.

2. Server Action 시그니처 변경으로 테스트와 호출부가 깨질 수 있다.
   - 각 액션별 호출부를 `rg`로 먼저 찾고 한 번에 맞춘다.

3. direct bid 성공 후 broadcast 실패가 생길 수 있다.
   - canonical Firestore snapshot은 이미 입찰을 반영하므로 입찰 자체는 유지된다.
   - broadcast 실패는 시스템 메시지와 RTDB fanout 지연으로만 취급하고 fallback snapshot 수렴을 유지한다.

4. fixture 경로와 운영 경로가 달라질 수 있다.
   - fixture는 기존 테스트 속도를 위해 우회하되, 운영 auth 테스트는 별도로 둔다.

## 작업 순서 권장안

1. leader token 저장/전달 흐름 확인.
2. `requireRoomLeader` 추가와 단위 테스트.
3. custom token 발급 API 검증 추가.
4. `placeBid` fallback token 검증 추가.
5. `submitSealedBid` token 검증 추가.
6. `sendNotice` organizer token 검증 추가.
7. `broadcastBidEvent` 서버 재검산 추가.
8. 핵심 Vitest 실행.
9. Firestore rules smoke 실행.
10. 경매 E2E 실행.

## 최종 권장 범위

이번 작업에서 구현할 최소 범위는 다음 5개다.

- Firebase custom token 발급 전 역할 token 대조.
- 공개 입찰 fallback의 leader token 대조.
- 비공개 입찰 제출의 leader token 대조.
- 공지 메시지의 organizer token 대조.
- `broadcastBidEvent`의 canonical room state 재검산.

Firestore rules 자체는 완화하지 않는다. 이 범위가 계정 시스템 없이 링크 공유 모델을 유지하면서도 경매 결과 정합성을 지키는 최소선이다.
