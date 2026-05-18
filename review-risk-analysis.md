# 현재 프로젝트 보안 완화 및 검증 우선순위 분석 보고서

작성일: 2026-05-18.

## 요약

이 프로젝트가 소규모 지인 운영용이고 방 링크를 신뢰 가능한 사람에게만 공유한다면, 기업용 인증 수준의 복잡한 사용자 계정 검증까지는 필요하지 않을 수 있다.

하지만 현재 위험은 "외부 해커가 무작위로 침입한다"보다 "방 링크를 가진 참여자가 브라우저 개발자 도구나 콘솔에서 자기 역할을 바꿔 호출할 수 있다"에 가깝다. 링크 공유 모델에서도 이 위험은 현실적이다. 특히 경매는 경쟁 상황이므로 실수, 장난, 악의가 모두 결과 정합성을 깨뜨릴 수 있다.

권장 결론은 다음과 같다.

- direct bid Firestore rules는 완전히 풀지 않는 것이 좋다.
- 복잡한 인증을 피하고 싶다면 최소한 role token 검증 또는 현재 발급된 custom token claim 검증만 유지하는 것이 적정선이다.
- 운영 전 최소 검증은 전체 lint 통과보다 경매 핵심 단위 테스트, room auth 테스트, Firestore rules smoke, 경매 E2E 1회다.

## P0 분석. Direct bid rules와 팀장 권한 침입 조건

### 현재 구조

Firestore rules는 `rooms/{roomId}` update를 기본 차단하고, `isBidUpdate(roomId)`를 통과한 direct bid만 허용한다.

현재 rules의 direct bid 검증 항목은 다음이다.

- Firebase Auth가 존재해야 한다.
- custom token claim이 `role == 'LEADER'`여야 한다.
- claim의 `roomId`가 대상 room과 같아야 한다.
- request의 `active_bid.team_id`가 claim의 `teamId`와 같아야 한다.
- 변경 가능 필드는 `active_bid`, `timer_ends_at`, `auction_revision`뿐이어야 한다.
- 현재 선수가 있어야 하고 타이머가 살아 있어야 한다.
- 입찰 선수, 입찰 금액, 현재 최고 입찰자, revision, 팀 포인트를 검증한다.

문제는 custom token 발급 API가 실제 역할 토큰을 확인하지 않고, 요청 본문의 `roomId`, `role`, `teamId`를 그대로 믿는다는 점이다. 즉 rules 자체는 꽤 많은 검증을 하지만, claim을 발급하는 문이 열려 있다.

### direct bid를 rules로 막지 않도록 수정하는 방법

완전히 막지 않으려면 `allow update`의 조건에서 `isBidUpdate(roomId)`를 더 느슨하게 만들면 된다. 가능한 선택지는 세 단계다.

1. 현 수준 유지.
   - `isBidUpdate(roomId)`와 `isBidHistoryCreate(roomId)` 유지.
   - 추천 수준이다.
   - 단, `/api/room-auth/firebase-token`에서 실제 leader token 검증을 추가해야 의미가 있다.

2. claim만 믿고 비즈니스 검증 일부를 완화.
   - 예를 들어 `role`, `roomId`, `teamId`, 변경 가능 필드, revision `+1`은 유지하고 금액 단위나 타이머 허용 폭만 완화한다.
   - 소규모 운영에서 허용 가능한 최대 완화선이다.
   - 팀 포인트와 현재 선수 검증은 유지해야 한다.

3. room update를 인증된 사용자에게 거의 개방.
   - 예시 개념은 `allow update: if request.auth != null` 같은 형태다.
   - 추천하지 않는다.
   - 이 경우 direct bid만 여는 것이 아니라 room hot state 전체 변조 위험으로 바뀐다.

가장 위험한 완화는 `allow update: if true` 또는 `allow update: if request.auth != null`이다. 이렇게 하면 누가 어떤 팀으로 얼마를 입찰했는지뿐 아니라 `timer_ends_at`, `auction_revision`, `active_bid`를 마음대로 바꿀 수 있다. 경매 결과가 더 이상 서버나 room state의 정본성을 갖지 못한다.

### 팀장이 다른 팀장 권한을 침입하려면 필요한 상황

외부인이 아무것도 모르는 상태에서 침입하려면 room id와 team id를 알아야 한다. 현재 room list는 막혀 있으므로 무작위 발견 난이도는 높다.

하지만 방에 정상 입장한 팀장 또는 뷰어는 다음 정보를 자연스럽게 알 수 있다.

- 현재 접속한 `roomId`.
- Firestore 공개 read로 내려오는 팀 목록.
- 각 팀의 `teamId`.
- 현재 경매 선수와 타이머.
- 각 팀의 포인트 잔액.

따라서 "팀장이 다른 팀장 권한으로 입찰한다"는 상황은 대략 다음이다.

- 정상 참여자가 방에 들어온다.
- 브라우저 개발자 도구, 네트워크 탭, 소스 번들, 콘솔 중 하나를 볼 수 있다.
- 다른 팀의 `teamId`를 확인한다.
- custom token 발급 API 또는 서버 액션에 자기 팀이 아닌 `teamId`를 넣어 호출한다.

이건 고급 해킹이라기보다 웹 앱을 조금 만질 줄 아는 사용자의 장난 수준에 가깝다. 소규모 지인 운영에서는 신뢰로 감당할 수도 있지만, 경매 결과가 민감하거나 상품, 회비, 순위가 걸리면 감당하기 어렵다.

### 보수적 판단

링크 공유 모델을 유지하더라도 "내 팀 링크를 가진 사람만 내 팀으로 입찰 가능" 정도는 최소 경계로 보는 것이 맞다. 복잡한 계정 시스템은 필요 없지만, leader token과 teamId를 서버에서 대조하는 얇은 검증은 필요하다.

## P1 분석. Revision 조작, 공지 메시지 생성 조건

### revision 조작이 가능한 상황

정상 경매 이벤트는 서버가 현재 room의 `auction_revision`을 읽고 `+1`로 이벤트를 만든다. 클라이언트는 `event.revision <= currentRevision`이면 무시하고, 더 큰 revision이면 적용한다.

위험은 `broadcastBidEvent`가 서버 액션으로 노출되어 있고 호출자 검증 없이 다음 값을 받는다는 점이다.

- `roomId`.
- `playerId`.
- `teamId`.
- `teamName`.
- `amount`.
- `timerEndsAt`.
- `revision`.

즉, 호출자가 현재보다 큰 revision을 넣어 `BID_PLACED` 이벤트를 만들 수 있다면 RTDB `auctionEvent`와 Firestore `last_auction_event`에 조작된 이벤트가 남을 수 있다.

다만 이 조작은 Firestore canonical `active_bid`를 반드시 바꾸는 것은 아니다. 그래서 영향은 두 층으로 나뉜다.

- 화면 표시 오염.
- fallback 또는 RTDB 이벤트 적용 경로에서 최신 입찰처럼 보이게 만들 가능성.
- 실제 낙찰 정산은 canonical room state와 서버 transaction이 더 중요하므로, 모든 경우에 최종 결과까지 바뀌는 것은 아니다.

하지만 실시간 경매 UX에서는 화면에 보이는 현재 최고 입찰과 타이머가 곧 운영 판단 기준이다. 주최자가 화면을 보고 수동 진행하거나 참가자가 더 높은 입찰을 포기하면, 표시 오염만으로도 운영 결과가 흔들릴 수 있다.

### 소규모 지인 프로젝트에서 revision 검증이 필요한가

보수적으로 보면 필요하다.

이유는 다음이다.

- 비용이 낮다. `broadcastBidEvent`는 클라이언트가 직접 호출할 필요가 없는 서버 후속 처리이므로, 서버 내부 전용으로 옮기거나 최소한 room state와 revision을 재조회해 대조하면 된다.
- 실패 영향이 크다. 화면 상태가 오염되면 경매 중 즉시 판단 오류가 생긴다.
- 지인 운영에서도 실수 가능성이 있다. 개발자 도구를 잘 모르는 사용자가 아니라도, 네트워크 재시도나 오래된 탭이 잘못된 값을 보내는 경우를 방어할 수 있다.

다만 "악의적 사용자 방어"가 목표가 아니라면 강한 인증보다 서버 재검산이 적절하다. 즉 `revision`을 클라이언트 인자로 믿지 말고 서버가 room을 읽어서 현재 `active_bid`와 `auction_revision`을 기준으로 이벤트를 만들면 된다.

### 공지 메시지를 뷰어나 팀장이 만들 수 있는 상황

`sendNotice(roomId, content)`는 `roomId`와 `content`만 받는다. organizer token이 없다. UI에서는 주최자에게만 버튼을 보여도, 서버 액션 자체는 역할을 확인하지 않는다.

가능한 상황은 다음이다.

- 방에 들어온 팀장 또는 뷰어가 클라이언트 번들에서 서버 액션 호출 경로를 찾는다.
- 브라우저 콘솔이나 네트워크 요청 재현으로 `sendNotice`를 호출한다.
- 메시지는 `sender_name: '주최자'`, `sender_role: 'NOTICE'`로 저장되고 RTDB에도 fanout된다.

영향은 경매 상태 변조보다 낮지만 운영 혼란은 크다. "경매 중단", "재입찰", "룰 변경" 같은 공지를 누군가 만들 수 있으면 참가자 행동이 바뀔 수 있다.

소규모 운영에서 최소 조치는 `sendNotice(roomId, organizerToken, content)` 형태로 바꾸고 기존 `requireRoomOrganizer`를 재사용하는 것이다. 계정 시스템은 필요 없다.

## P2 분석. 최소 검증 우선순위

현재 `npm run lint`는 실패한다. 대부분은 React 19/ESLint 신규 규칙과 scripts의 CommonJS 충돌이다. 전체 lint를 한 번에 통과시키는 것은 가치가 있지만, 운영 전 최소선으로 보기에는 범위가 넓다.

현재 `npm run test`는 189개 중 2개 테스트가 실패한다. 실패는 다음이다.

- `useAuctionControl`에서 `IN_AUCTION` 전환 시 lotteryPlayer 설정 기대값 실패.
- `LotteryAnimation`에서 비공개 입찰 추첨 정보 표시 기대값 실패.

### 운영 전 최소 통과선

최소한 다음은 챙겨야 한다.

1. Room auth와 organizer auth 단위 테스트.
   - 역할 토큰과 주최자 토큰 검증은 이번 리스크의 핵심이다.

2. 공개 입찰 서버 액션 테스트.
   - `placeBid`가 권한 없는 teamId를 거부하는지, 현재 팀 포인트와 현재 선수 검증이 유지되는지 확인해야 한다.

3. 비공개 입찰 제출 테스트.
   - `submitSealedBid`가 본인 팀만 제출 가능하고 재입찰 대상 팀 제한을 지키는지 확인해야 한다.

4. `auctionRealtimeUtils`와 `useAuctionRealtime` 테스트.
   - revision ordering, stale event ignore, fallback 적용은 실시간 정합성의 최소 핵심이다.

5. Firestore rules smoke.
   - `room_auth_secrets` 차단, top-level room list 차단, direct bid 허용 범위가 기대대로인지 확인해야 한다.

6. 경매 E2E 1회.
   - 공개 입찰 시작, 입찰, 타이머 연장, 낙찰까지는 실제 브라우저 경로로 확인해야 한다.

### 지금 실패한 테스트의 우선순위

`useAuctionControl` 실패는 경매 흐름과 관련이 있으므로 우선순위가 높다. 추첨 상태 전환이 깨지면 실제 경매 시작 UX가 흔들릴 수 있다.

`LotteryAnimation` 실패는 비공개 입찰 표시 정보 관련이다. 운영에서 비공개 입찰을 사용한다면 우선순위가 높고, 공개 입찰만 사용한다면 출시 차단 수준은 아니다.

lint는 다음 순서로 보는 것이 현실적이다.

- 경매 핵심 파일의 실제 오류.
- React Hooks rule 위반 중 런타임 버그 가능성이 있는 항목.
- scripts의 `require()` 규칙 충돌.
- unused warnings.

scripts의 CommonJS lint 오류는 운영 스크립트 실행에는 직접 문제를 만들지 않을 수 있다. 다만 `npm run lint`를 배포 gate로 쓸 계획이면 반드시 정리해야 한다.

## 권장 의사결정

### 링크 공유형 운영을 유지할 때 추천하는 최소 보안선

- 방 링크의 token은 계속 URL에 둔다.
- Firebase custom token 발급 API는 해당 token을 private auth 문서와 대조한다.
- 팀장용 서버 액션은 `teamId`와 leader token을 대조한다.
- 주최자용 서버 액션은 기존 `requireRoomOrganizer`를 유지한다.
- `broadcastBidEvent`는 클라이언트가 보낸 revision을 믿지 않고 서버에서 room state를 재조회한다.
- Firestore rules는 direct bid의 필드 제한, `auction_revision == before + 1`, 현재 선수, 팀 포인트 검증을 유지한다.

이 정도면 계정 시스템 없이도 링크 공유 모델과 경매 정합성 사이의 균형을 맞출 수 있다.

### 감수 가능한 완화

- read authorization은 지금처럼 room id를 아는 사용자의 공개 read로 둘 수 있다.
- room list 차단은 유지한다.
- 채팅 일반 메시지는 강한 인증 없이 둘 수 있다.
- 공지와 입찰만 token 검증을 둔다.

### 감수하지 않는 편이 좋은 완화

- `rooms/{roomId}` update를 `if true` 또는 단순 `request.auth != null`로 여는 것.
- 클라이언트가 보낸 `revision`을 그대로 RTDB 이벤트로 발행하는 것.
- 비공개 입찰 제출을 `teamId`만으로 허용하는 것.
- 주최자 공지를 token 없이 허용하는 것.

## 최종 판단

소규모 지인 프로젝트라는 전제는 보안 복잡도를 줄이는 근거가 될 수 있다. 하지만 direct bid와 경매 이벤트는 "보안"인 동시에 "게임 룰 정합성"이다. 복잡한 사용자 인증은 생략해도 되지만, 링크에 포함된 역할 토큰을 서버에서 대조하는 최소 검증은 유지하는 편이 맞다.

가장 실용적인 다음 단계는 rules를 풀기보다 토큰 발급 API와 서버 액션 fallback에 얇은 검증을 추가하는 것이다. 이 방식은 운영 부담은 거의 늘리지 않으면서, 다른 팀 명의 입찰과 조작 공지 같은 가장 현실적인 사고를 막는다.
