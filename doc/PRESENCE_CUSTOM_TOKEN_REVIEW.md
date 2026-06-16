# Presence와 Custom Token 설계 점검

작성일: 2026-06-16.

## 목적

이 문서는 Minions Bid가 Firebase custom token과 presence를 반드시 사용해야 하는지 기술적으로 점검하고, 유사한 실시간 시스템들이 presence와 권한을 어떻게 설계하는지 비교한다.

## 현재 구현 요약

현재 방 입장과 연결 상태 표시는 서로 다른 경로를 사용한다.

| 기능 | 현재 근거 | 인증 의존성 |
|---|---|---|
| 방 입장과 팀 식별 | URL `role`, `teamId`, `token`과 Firestore room/team read | Firebase Auth custom token 없이도 화면 표시 가능 |
| 팀장 입찰 | `placeBidDirect()` Firestore client transaction | Firebase Auth custom token claim 필수 |
| 팀장 연결 상태 | RTDB `presence/{roomId}/{uid}` write와 subscribe | 현재 RTDB rules 기준 Firebase Auth 필수 |
| 경매 진행 차단 | `presences` 배열에서 전체 팀장 접속 여부 계산 | presence write 성공에 의존 |

핵심 코드는 아래 위치다.

- `src/lib/firebase.ts`: `/api/room-auth/firebase-token` 호출 후 `signInWithCustomToken()`.
- `src/features/auction/hooks/usePresence.ts`: custom token 로그인 후 RTDB `presence/{roomId}/{authUid}` 기록.
- `database.rules.json`: presence write는 `auth != null && auth.uid === $sessionId`일 때만 허용.
- `firestore.rules`: direct bid는 `request.auth.token.role`, `roomId`, `teamId` claim으로 최종 검증.

## 현재 증상의 기술적 해석

팀장들이 모두 방에 들어와 있고 각자 어느 팀인지 보이는 상태에서도, `/api/room-auth/firebase-token`이 실패하면 팀장 연결 상태는 갱신되지 않는다.

그 이유는 팀 정보 표시와 presence 등록이 독립적이기 때문이다.

1. 팀장 링크로 방에 입장한다.
2. URL과 Firestore 데이터로 팀명과 팀장 UI가 표시된다.
3. `usePresence()`가 custom token 발급 API를 호출한다.
4. API가 500이면 Firebase Auth 로그인이 실패한다.
5. RTDB presence write가 실행되지 않는다.
6. organizer 화면은 `presences`를 기준으로 팀장이 미연결이라고 판단한다.

따라서 이 증상은 “팀장이 방에 접속하지 않음”이 아니라 “팀장 접속을 증명하는 인증과 presence write 경로가 실패함”으로 보는 것이 맞다.

## Custom Token이 정말 필수인지

### Direct Bid에는 필수다

현재 프로젝트는 입찰 hot path를 Vercel Server Action 왕복 없이 Firestore client transaction으로 처리한다. 이 설계에서는 Firestore Security Rules가 최종 방어선이다.

`firestore.rules`는 다음 claim을 사용한다.

- `request.auth.token.role == 'LEADER'`.
- `request.auth.token.roomId == roomId`.
- `request.auth.token.teamId == 입찰 팀`.

Firebase 공식 문서도 사용자 기반 또는 역할 기반 접근 제어에는 Firebase Authentication과 Security Rules 조합이 필요하다고 설명한다. Custom claims는 역할 기반 접근 제어를 rules에서 적용하기 위한 수단이다.

근거.

- Firebase Firestore Security Rules는 사용자 기반 및 역할 기반 접근 제어를 위해 Firebase Authentication을 사용한다. https://firebase.google.com/docs/firestore/security/get-started.
- Firebase custom claims는 역할 기반 접근 제어를 Security Rules에서 강제하는 데 사용된다. https://firebase.google.com/docs/auth/admin/custom-claims.
- Firebase Admin SDK는 서버에서 custom token을 만들고 클라이언트에 전달하는 방식을 제공한다. https://firebase.google.com/docs/auth/admin/create-custom-tokens.

즉, 현재처럼 팀장이 클라이언트에서 직접 Firestore 입찰 transaction을 수행하려면 custom token 또는 동등한 Firebase Auth claim 전달 수단이 필요하다.

### Presence에는 필수는 아니지만 현재 구현에서는 필수다

presence 자체는 반드시 Firebase custom token이어야 하는 기능은 아니다. 서버가 대신 presence를 쓰거나, 다른 실시간 서비스의 presence 기능을 쓰거나, heartbeat 기반으로 구현할 수 있다.

하지만 현재 `database.rules.json`는 presence write에 Firebase Auth를 요구한다.

```json
".write": "auth != null && auth.uid === $sessionId && ..."
```

따라서 지금 구현에서는 presence도 custom token 발급 경로에 묶여 있다.

## 유사 서비스의 설계 패턴

### Firebase

Firebase RTDB는 클라이언트가 직접 읽고 쓸 수 있는 구조이고, 서버 측 Security Rules가 read/write를 최종 판단한다. 공식 문서도 RTDB rules가 서버에서 강제되며, 모든 read/write는 rules가 허용할 때만 완료된다고 설명한다.

Firebase 방식의 핵심은 “클라이언트 직접 접근을 허용하되, Auth와 Rules로 서버에서 강제한다”다.

이 프로젝트의 현재 구현은 Firebase 권장 모델과 잘 맞는다. 다만 custom token 발급 API가 장애를 내면 direct bid와 presence가 동시에 영향을 받는 단일 장애점이 된다.

근거.

- Firebase RTDB Security Rules는 read/write 권한과 데이터 구조, 인덱스를 결정하고 서버에서 강제된다. https://firebase.google.com/docs/database/security.
- RTDB rules는 `auth.uid` 같은 인증 정보를 참조해 사용자별 write를 제한할 수 있다. https://firebase.google.com/docs/database/security.

### Supabase Realtime

Supabase Realtime Presence는 자체 presence 기능을 제공한다. Private channel에서는 Realtime Authorization을 사용하고, Postgres RLS 정책으로 Broadcast와 Presence 권한을 제어한다.

Supabase의 패턴은 “채널 참가 시점에 JWT와 RLS로 권한을 계산하고, presence publish와 receive 권한을 분리한다”다.

이 프로젝트에 적용한다면 Firebase custom token 대신 Supabase JWT와 RLS가 같은 역할을 맡는다. 인증 의존성이 사라지는 것이 아니라, 다른 인증 토큰과 정책 체계로 이동하는 것이다.

근거.

- Supabase는 Realtime Broadcast와 Presence 접근을 `realtime.messages` 테이블의 RLS 정책으로 제어한다. https://supabase.com/docs/guides/realtime/authorization.
- 권한 계산은 WebSocket 연결과 Channel join 시점에 JWT claims, request headers, channel topic, RLS 정책을 바탕으로 수행된다. https://supabase.com/docs/guides/realtime/authorization.
- Supabase Presence는 클라이언트 라이브러리로 사용자 간 상태를 추적한다. https://supabase.com/docs/guides/realtime/presence.

### Ably

Ably는 presence set을 서비스가 유지하고 SDK가 동기화한다. 클라이언트 권한은 API key를 직접 노출하지 않고 서버가 발급하는 짧은 token과 channel capability로 제한하는 방식을 권장한다.

Ably의 패턴은 “untrusted client에는 짧은 토큰을 주고, 토큰 capability로 channel별 publish/subscribe/presence 권한을 제한한다”다.

이 프로젝트에 적용한다면 `/api/room-auth/firebase-token`과 비슷한 서버 발급 endpoint가 유지된다. 다만 Firebase Auth custom token 대신 Ably token request가 된다.

근거.

- Ably token은 untrusted client에 공유되도록 설계됐고, 짧은 수명과 programmatic capability를 제공한다. https://ably.com/docs/auth/capabilities.
- Ably presence는 channel attach 이후 presence set을 SDK가 동기화하고 presence event로 갱신한다. https://ably.com/docs/presence-occupancy/presence.

### Pusher Channels

Pusher Presence Channel은 반드시 authorization이 필요하다. presence channel 참가 시 서버가 서명한 authorization token을 발급하고, presence token에는 연결된 사용자를 식별할 user data가 포함된다.

Pusher의 패턴은 “presence channel subscribe 자체를 서버 서명 authorization으로 보호한다”다.

이 프로젝트에 적용한다면 지금의 room token 검증과 custom token 발급 endpoint가 Pusher channel authorization endpoint로 바뀌는 형태다. 인증 endpoint 자체는 여전히 필수 구성요소다.

근거.

- Pusher presence channel subscription은 authorize되어야 한다. https://pusher.com/docs/channels/using_channels/presence-channels/.
- Pusher는 서버가 사용자와 접근 권한의 authority이고, client library가 서버 endpoint에서 signed authentication 또는 authorization token을 받는다고 설명한다. https://pusher.com/docs/channels/server_api/authorizing-users/.
- Pusher presence channel token에는 연결된 사용자를 다른 구독자에게 알려주기 위한 user data가 포함될 수 있다. https://pusher.com/docs/channels/server_api/authorizing-users/.

## 비교 요약

| 시스템 | Presence 권한 방식 | 서버 발급 토큰 또는 권한 endpoint | Minions Bid와의 시사점 |
|---|---|---:|---|
| Firebase RTDB | Auth와 RTDB Rules | 필요 | 현재 구조와 일치한다 |
| Supabase Realtime | JWT와 RLS | 필요 | 인증이 사라지지 않고 RLS로 이동한다 |
| Ably | Token capability | 필요 | 서버 발급 토큰으로 channel 권한을 제한한다 |
| Pusher Channels | Signed channel authorization | 필요 | presence channel은 서버 authorization이 필수다 |

공통점은 명확하다. 실시간 presence를 신뢰 가능한 경매 진행 조건으로 쓰려면, 대부분의 서비스가 서버가 검증한 identity와 권한을 요구한다.

## 대안 검토

### A. 현 구조 유지와 안정화

내용.

- Firebase custom token을 계속 사용한다.
- `/api/room-auth/firebase-token`을 운영 smoke test 대상으로 고정한다.
- 장애 시 “팀장 미접속”과 “presence 인증 장애”를 UI에서 분리한다.
- Vercel 배포 후 `POST /api/room-auth/firebase-token` 400, 403, 200 경로를 확인한다.

장점.

- direct bid 보안 모델과 일관된다.
- 변경 범위가 작다.
- Firestore/RTDB rules를 크게 바꾸지 않아도 된다.

단점.

- custom token route가 direct bid와 presence의 공통 장애점이다.
- Firebase Admin SDK와 serverless bundling 이슈를 운영 검증으로 계속 관리해야 한다.

판단.

현재 운영 단계에서는 이 방향이 가장 현실적이다.

### B. Presence만 서버 action 기반으로 분리

내용.

- 클라이언트가 RTDB에 직접 presence를 쓰지 않는다.
- 서버가 room token을 검증한 뒤 Admin SDK로 presence를 쓴다.
- 클라이언트는 heartbeat를 보내고, 서버 또는 scheduled cleanup이 만료 presence를 제거한다.

장점.

- presence write가 Firebase client Auth custom token에 덜 의존한다.
- presence 장애와 direct bid Auth 장애를 일부 분리할 수 있다.

단점.

- RTDB `onDisconnect()` 장점을 잃는다.
- heartbeat, TTL, cleanup, 다중 탭 처리, 모바일 sleep 처리 설계가 필요하다.
- serverless 환경에서 짧은 주기 heartbeat가 비용과 레이턴시를 만든다.

판단.

custom token route 안정화보다 구현 리스크가 크다. presence가 매우 자주 장애를 일으키는 경우에만 검토한다.

### C. Direct bid를 Server Action 전용으로 되돌림

내용.

- 팀장 입찰도 모두 서버 action으로 처리한다.
- Firestore client direct transaction과 custom token claim 의존도를 낮춘다.
- presence는 별도 가벼운 인증 또는 서버 heartbeat로 구현한다.

장점.

- 클라이언트 Firestore write 권한 모델이 단순해진다.
- custom token이 핵심 입찰 권한에서 빠질 수 있다.

단점.

- 입찰 레이턴시와 p95 품질이 나빠질 가능성이 크다.
- 현재 아키텍처 문서와 Playwright 검증의 주요 전제가 바뀐다.
- 경매 hot path를 다시 설계해야 한다.

판단.

현재 목표가 저지연 입찰이면 권장하지 않는다.

### D. Supabase, Ably, Pusher 등 외부 realtime presence로 교체

내용.

- RTDB presence를 외부 presence 서비스로 대체한다.
- 각 서비스의 JWT, RLS, token capability, signed channel authorization을 사용한다.

장점.

- presence 기능이 제품화되어 있다.
- channel member set과 join/leave event가 더 명시적이다.

단점.

- 인증 endpoint는 여전히 필요하다.
- Firestore direct bid 권한과 presence 권한이 서로 다른 identity 체계로 갈라진다.
- 운영 장애 표면이 Firebase와 외부 realtime provider로 늘어난다.

판단.

Firebase 전체 이탈 또는 Supabase 전환 같은 큰 마이그레이션과 함께 검토할 선택지다. presence 문제 하나만으로 교체하기에는 비용이 크다.

## 권고안

단기 권고는 A안이다. custom token 구조를 유지하고 운영 안정성을 강화한다.

구체적인 조치.

1. `/api/room-auth/firebase-token`을 배포 smoke test에 넣는다.
2. invalid payload는 400 JSON, 잘못된 token은 403 JSON, 정상 leader token은 200과 Firebase custom token을 반환해야 한다.
3. 주최자 UI에서 “팀장 미접속”과 “presence 인증 장애”를 분리한다.
4. presence 인증 실패 횟수와 마지막 실패 메시지를 client debug state나 latency report에 포함한다.
5. Vercel logs에서 `[room-auth] firebase token request failed`, `[firebaseAdmin] 초기화 실패`, `ERR_REQUIRE_ESM` 계열 로그를 배포 직후 확인한다.
6. `npm run smoke:room-rules`와 별도로 room auth token smoke script를 추가한다.

중기 권고는 presence를 경매 차단 조건으로 계속 쓸지 재검토하는 것이다.

현재 정책은 “organizer와 모든 팀장이 연결되어야 경매 진행”이다. 이 정책은 공정성에는 좋지만, presence 인증 장애 하나가 경매 전체를 멈추는 단점이 있다. 따라서 UI와 운영 로그는 “실제 미접속”과 “presence 시스템 장애”를 반드시 구분해야 한다.

## 최종 판단

Minions Bid는 현재 direct bid 구조 때문에 Firebase custom token 또는 동등한 Firebase Auth claim 전달 수단이 필요하다.

presence는 개념적으로 custom token이 필수는 아니지만, 현재 RTDB rules와 `onDisconnect()` 기반 구현에서는 custom token이 실질적으로 필요하다.

유사 서비스들도 신뢰 가능한 presence에는 서버가 검증한 identity와 channel 권한을 요구한다. 즉, 문제의 본질은 “토큰을 쓰느냐 마느냐”가 아니라 “서버 발급 권한 경로를 얼마나 안정적으로 운영하고, 장애를 사용자 상태와 구분해 보여주느냐”다.
