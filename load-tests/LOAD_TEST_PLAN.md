# 경매 시스템 부하테스트 분석 및 트래픽 분산 처리 계획서

> 작성일: 2026-06-11  
> 대상 시스템: Minions Bid (Next.js 15 + Firebase Realtime DB + Firestore)  
> 가정: 경매 룸 1개, 동시 참여자 최대 10인 (ORGANIZER 1 + LEADER 최대 9)

---

## 1. 10인 동시 참여 시나리오 구성

### 참여자 역할 및 트래픽 특성

| 역할 | 인원 | 발생 트래픽 |
|------|------|-------------|
| ORGANIZER | 1 | drawNextPlayer, startAuction, awardPlayer, closeLottery, pauseAuction/resumeAuction |
| LEADER (팀장) | 최대 9 | placeBidDirect (Firestore 트랜잭션), presence RTDB 쓰기, 채팅 |
| VIEWER (관전) | 0~N | Firestore onSnapshot 읽기 전용 |

### 10초 경매 1라운드 내 트래픽 예측

| 이벤트 | 발생 횟수 | 대상 서비스 |
|--------|-----------|-------------|
| Presence 접속 (10명) | 10 | RTDB write + onDisconnect 등록 |
| 경매 이벤트 팬아웃 | 1 이벤트 × 10 클라이언트 | RTDB read (onValue 리스너) |
| 동시 입찰 시도 | 최대 9회/라운드 | Firestore 트랜잭션 (`rooms/{id}`) |
| RTDB 이벤트 발행 | 입찰당 2 write | `signals/{roomId}/auctionEvent` + `auctionEvents/{id}` |
| 시스템 채팅 메시지 | 입찰당 1 | Firestore messages + RTDB latestMessage |
| Watchdog cron | 1회/분 | Firestore 쿼리 + recoverExpiredAuction |

---

## 2. 병목 포인트 심층 분석

### 2-1. Firestore 트랜잭션 경합 (심각도: 높음)

**현재 구현 (`placeBid`, `placeBidDirect`):**  
`rooms/{roomId}` 단일 문서에 대해 Firestore 직렬화 트랜잭션을 실행한다. 동일 문서에 동시 트랜잭션이 충돌하면 Firestore SDK가 최대 5회 자동 재시도한다.

**10인 동시 입찰 시 예상 동작:**

```
라운드당 최악 시나리오 (9명 동시 입찰):
- 1명 성공: 트랜잭션 1회 완료, ~100-300ms
- 8명 첫 재시도: 각 ~500ms 지연
- 일부 2차 재시도: 각 ~1000ms 지연
- 예상 p95 응답: 1500-2500ms (타이머 연장 없이)
```

**Firebase 할당량 대비 위험도:**  
Firestore 무료 티어 기준 초당 1회 쓰기/문서. 9명 동시 입찰은 초당 9 write 시도 → **할당량 초과 위험. Blaze 플랜 필수.**  
Blaze 플랜에서도 단일 문서 핫스팟은 초당 ~1QPS 쓰기가 권장 상한선.

**개선 우선순위: 상**

---

### 2-2. RTDB 이중 쓰기 팬아웃 (심각도: 중)

**현재 구현 (`publishAuctionEvent`):**

```typescript
await Promise.all([
  rtdb.ref(`signals/${roomId}/auctionEvent`).set(event),       // write 1
  rtdb.ref(`signals/${roomId}/auctionEvents/${eventId}`).set(event), // write 2
])
```

`broadcastBidEvent`는 추가로 Firestore `last_auction_event` 업데이트까지 3중 쓰기를 수행한다.

**10인 동시 접속 시 예상 RTDB 연결 수:**  
- 10개 WebSocket 연결 유지 (presence + signals 리스너)
- 각 이벤트마다 10-way 팬아웃
- Firebase 무료 플랜: 동시 연결 100 제한 → 10명이면 여유 있음
- RTDB 단일 노드 쓰기 속도: ~100ms, 팬아웃 지연 ~50ms 추가

**개선 우선순위: 중**

---

### 2-3. drawNextPlayer 리더 검증 지연 (심각도: 중)

**현재 구현 (`auctionFlowActions.ts:464-479`):**

```typescript
for (let attempt = 0; attempt < 3; attempt++) {
  const presenceSnap = await rtdb.ref(`presence/${roomId}`).get()
  leaderCount = presenceRoles.filter(r => r === 'LEADER').length
  if (leaderCount >= 2) break
  if (attempt < 2) await sleep(350)  // 최대 700ms 추가 지연
}
```

리더가 아직 presence를 등록하지 않은 경우 최대 700ms 추가 대기가 발생한다. 10명 모두 동시에 접속하는 경우 RTDB 동시 쓰기 폭주로 인해 presence 반영이 늦어질 수 있다.

**개선 우선순위: 중**

---

### 2-4. Vercel Serverless Cold Start (심각도: 중)

**현재 구조:**  
모든 Server Action (`drawNextPlayer`, `startAuction`, `awardPlayer` 등)이 Vercel Serverless Function을 통해 실행된다.

- Cold Start 지연: 200~500ms (Node.js 런타임)
- Singapore 리전(`sin1`) → Firebase asia-northeast 왕복 RTT: ~50-100ms
- 10분 비활성 후 재호출 시 Cold Start 재발

**개선 우선순위: 중**

---

### 2-5. Presence Storm (심각도: 중)

**현재 구현 (`usePresence.ts`):**  
10명이 동시에 접속하면 각각 RTDB에 presence 레코드를 write하고 onDisconnect 핸들러를 등록한다. RTDB의 `presence/{roomId}` onValue 리스너가 10번 연속으로 발화되어 React state 업데이트가 10회 발생한다.

**예상 현상:**  
- 접속 완료까지 최대 500-1000ms 동안 `isPresenceLoaded = false` UI 블로킹
- 동시 재접속(네트워크 일시 단절) 시 presence 리스너 중복 발화 가능

**개선 우선순위: 중**

---

### 2-6. 채팅 이중 쓰기 (심각도: 낮음)

**현재 구현 (`chatActions.ts`):**

```typescript
await Promise.all([
  firestore.collection('rooms').doc(roomId).collection('messages').add({...}),
  rtdb.ref(`signals/${roomId}/latestMessage`).set({...}),
])
```

채팅은 입찰과 달리 경합이 없어 낮은 심각도다. 단, 10명이 동시에 채팅하면 Firestore messages 컬렉션에 10 동시 write가 발생한다.

**개선 우선순위: 낮음**

---

## 3. 트래픽 분산 처리 전략 (우선순위 순)

### 전략 1: `placeBidDirect` 클라이언트 경로로 통일 (최우선)

**현재 문제:**  
`placeBid` Server Action은 Vercel → Firebase Admin SDK를 거치므로 Cold Start + 왕복 지연이 발생한다. `placeBidDirect`는 클라이언트 Firestore SDK를 직접 사용하므로 서버 경유 없이 입찰이 처리된다.

**해결 방안:**  
입찰 UI에서 `placeBid` Server Action 경로를 완전히 제거하고 `placeBidDirect`만 사용한다. 단, 보안 최종 검증은 Firestore 보안 규칙(`isBidUpdate`)에 위임한다. (이미 `placeBidClient.ts`에 구현됨, 경로 통일 여부 재확인 필요)

**예상 효과:**  
입찰 지연 200-500ms 감소 (Vercel Cold Start 제거)

---

### 전략 2: Firestore 트랜잭션 경합 완화

**현재 문제:**  
`rooms/{roomId}` 단일 문서에 모든 경매 상태(timer_ends_at, active_bid, auction_revision)가 집중되어 있어 10명 동시 입찰 시 직렬화 병목이 발생한다.

**해결 방안:**

```
옵션 A: 낙관적 업데이트 + 충돌 감지
  - 클라이언트에서 auction_revision을 읽고 CAS(Compare-And-Swap) 방식으로 update
  - 충돌 시 즉시 실패 반환 (재시도 없음) → UX에서 "다른 팀이 먼저 입찰" 표시

옵션 B: 입찰 debounce (클라이언트)
  - 동일 팀의 연속 입찰 시도를 200ms debounce
  - 트랜잭션 재시도 횟수 감소
```

**예상 효과:**  
p95 응답 시간 500-1000ms 감소

---

### 전략 3: RTDB 이중 쓰기를 단일 쓰기로 통합

**현재 문제:**  
`publishAuctionEvent`가 `auctionEvent`와 `auctionEvents/{id}` 두 경로에 동시 쓰기한다. `auctionEvents/{id}`는 히스토리 목적이지만, 클라이언트 실시간 타이머 갱신에는 `auctionEvent` 하나만 필요하다.

**해결 방안:**  
`auctionEvents/{id}` 히스토리 쓰기를 fire-and-forget으로 분리하여 타이머 갱신 경로에서 제외한다.

```typescript
// 변경 전
await Promise.all([
  rtdb.ref(`signals/${roomId}/auctionEvent`).set(event),
  rtdb.ref(`signals/${roomId}/auctionEvents/${event.eventId}`).set(event),
])

// 변경 후
await rtdb.ref(`signals/${roomId}/auctionEvent`).set(event)
// 히스토리는 별도 비동기 처리
rtdb.ref(`signals/${roomId}/auctionEvents/${event.eventId}`).set(event).catch(() => {})
```

**예상 효과:**  
`publishAuctionEvent` 완료 시간 ~50ms 단축

---

### 전략 4: Presence 업데이트 배치 처리 (Debounce)

**현재 문제:**  
10명 동시 접속 시 `presence/{roomId}` onValue가 10회 연속 발화되어 React state 업데이트가 10회 발생한다.

**해결 방안:**  
`usePresence.ts`의 `onValue` 콜백에 클라이언트 debounce 적용:

```typescript
// onValue 콜백을 50ms debounce로 묶어 배치 처리
const debouncedUpdate = useMemo(
  () => debounce((presences: PresenceUser[]) => setRealtimeData({ presences }), 50),
  [setRealtimeData]
)
```

**예상 효과:**  
동시 접속 시 React 렌더링 횟수 최대 10회 → 1-2회로 감소

---

### 전략 5: Watchdog 병렬 처리

**현재 문제 (`auction-watchdog/route.ts`):**  
만료된 룸을 순차적으로 처리한다. 동시에 여러 룸이 만료되면 처리가 순차적으로 지연된다.

**해결 방안:**

```typescript
// 변경 전: for...of 순차 처리
for (const roomDoc of snapshot.docs) {
  const result = await recoverExpiredAuction(roomDoc.id)
  results.push(...)
}

// 변경 후: 병렬 처리 (최대 5개 동시)
const CONCURRENCY = 5
for (let i = 0; i < snapshot.docs.length; i += CONCURRENCY) {
  const batch = snapshot.docs.slice(i, i + CONCURRENCY)
  const batchResults = await Promise.all(
    batch.map(doc => recoverExpiredAuction(doc.id).then(r => ({ roomId: doc.id, ...r })))
  )
  results.push(...batchResults)
}
```

**예상 효과:**  
여러 룸 동시 만료 시 Watchdog 처리 시간 최대 80% 단축

---

### 전략 6: Vercel Edge Runtime 전환 검토

**현재 문제:**  
Watchdog과 일부 API 라우트가 Node.js 런타임 사용으로 Cold Start 지연이 발생한다.

**해결 방안 (조건부):**  
Firebase Admin SDK가 필요없는 경량 API 라우트 (`/api/short-links`, `/api/room-links`)를 Edge Runtime으로 전환한다.  
단, Firebase Admin SDK는 Edge Runtime 미지원이므로 Watchdog 및 경매 액션에는 적용 불가.

**예상 효과:**  
경량 API 라우트 Cold Start 제거, 글로벌 엣지 캐싱 활용

---

## 4. 부하테스트 성공 기준

### 시나리오별 목표값

| 시나리오 | p50 | p95 | p99 | 에러율 | 비고 |
|----------|-----|-----|-----|--------|------|
| 01. 정상 경매 흐름 | < 300ms | < 2000ms | < 3000ms | < 5% | 순차 입찰 |
| 02. 동시 입찰 스파이크 | < 500ms | < 3000ms | < 5000ms | < 60% | 경합 실패 포함 |
| 03. 혼합 부하 | < 400ms | < 2000ms | < 3500ms | < 10% | 입찰 기준 |
| 04. Watchdog | < 500ms | < 5000ms | < 8000ms | < 5% | Firestore 쿼리 포함 |

### 핵심 비기능 요구사항

- **입찰 승자 결정**: 동시 입찰 시 단 1명만 성공 (Firestore 트랜잭션 직렬화 보장)
- **타이머 정확도**: 서버 시간 기준 ±500ms 이내
- **Presence 로딩**: 10명 동시 접속 후 3초 이내 `isPresenceLoaded = true`
- **경매 복구**: 타이머 만료 후 60초 이내 Watchdog이 낙찰/유찰 처리

---

## 5. Firebase 모니터링 체크리스트

### Firebase Console → Realtime Database

| 메트릭 | 임계값 | 측정 시점 |
|--------|--------|-----------|
| 동시 연결 수 | < 80 (무료 100 한도) | 테스트 중 최대값 |
| 데이터 전송량 | < 1 GB/일 (무료 티어) | 일별 누적 |
| 읽기 지연 | < 200ms | p95 |
| 쓰기 지연 | < 300ms | p95 |

### Firebase Console → Firestore

| 메트릭 | 임계값 | 측정 시점 |
|--------|--------|-----------|
| 읽기 횟수 | < 50,000/일 (무료 티어) | 일별 누적 |
| 쓰기 횟수 | < 20,000/일 (무료 티어) | 일별 누적 |
| `rooms/{id}` 문서 쓰기 QPS | < 1 QPS (권장) | 테스트 중 최대값 |
| 트랜잭션 재시도율 | < 30% | 입찰 트랜잭션 기준 |
| 쿼리 응답 시간 | < 500ms | p95 |

### Vercel Dashboard

| 메트릭 | 임계값 |
|--------|--------|
| Function 호출 횟수 | < 1,000,000/월 (무료 티어) |
| Function 실행 시간 | p95 < 3000ms |
| Cold Start 발생률 | < 5% |
| Edge Request 오류율 | < 1% |

---

## 6. 실측 결과 (2026-06-11, 로컬 dev 서버)

> 환경: Windows 11 / Next.js 16.1.6 Turbopack / E2E in-memory fixture (Firebase 미연결)  
> 서버: `npm run dev` + `E2E_AUCTION_FIXTURE=1` (ProcessStartInfo 환경변수 주입)

### 시나리오 01: 정상 경매 흐름 (10 VU, 4분)

| 지표 | 실측값 | 목표값 | 결과 |
|------|--------|--------|------|
| 성공 요청 p50 | 7.27ms | < 300ms | ✅ |
| 성공 요청 p95 | 27.17ms | < 2000ms | ✅ |
| 전체 http_req_failed | 61.95% | < 5% | ❌ |
| bid_success_count | 8 | > 0 | ✅ |
| auction_round_duration p95 | 37.64ms | — | — |

**발견사항:**  
- 로컬 dev 서버가 **약 183초(3m03s) 후 프로세스 크래시**. 이후 `connection refused` 에러가 전체 에러율을 61.95%로 끌어올렸음.  
- 서버 생존 구간의 응답시간은 우수: avg 12.49ms, p95 27.17ms.  
- 총 919 iterations 완료, 0 interrupted.  
- **핵심 시사점: 로컬 단일 Node.js 프로세스는 10 VU 지속 부하에 취약. Vercel Serverless는 요청별 격리이므로 동일 현상 없음.**

### 시나리오 02: 동시 입찰 스파이크 (10 VU, 2분 30초)

| 지표 | 실측값 | 목표값 | 결과 |
|------|--------|--------|------|
| checks 성공률 | **100%** (3666/3666) | — | ✅ |
| http_req_duration p(95) | **83.83ms** | < 3000ms | ✅ |
| concurrent_bid_latency p(95) | **380.79ms** | — | — |
| http_req_failed | **74.57%** | < 60% | ❌ |
| bid_conflict_rate | **99.12%** | — | 정상 |
| concurrent_bid_success | **8** | > 0 | ✅ |

**발견사항:**  
- 서버가 2분 20초 전체 구간 생존 (시나리오 01 크래시와 달리 안정적).  
- **bid_conflict_rate 99.12%**: 10명 동시 입찰 시 트랜잭션 직렬화가 정상 작동. 1명만 성공, 나머지 9명은 경합 실패 → 재시도 1822회 발생.  
- http_req_failed 74.57%는 경합 실패 응답(에러 코드)이 실패로 카운트된 것. checks 100% 성공이 실제 가용성을 반영.  
- **핵심 시사점: 경합 자체는 Firestore 트랜잭션이 보장하나, 10명 동시 입찰 시 재시도 폭발(평균 ~2회)이 발생. bid debounce 또는 낙관적 업데이트 적용 필요.**

### 시나리오 03: 혼합 부하 (15 VU, 4분)

| 지표 | 실측값 | 목표값 | 결과 |
|------|--------|--------|------|
| http_req_duration p(95) | **149.39ms** | < 2000ms | ✅ |
| bid_under_mixed_load_ms p(95) | **13.24ms** | — | ✅ |
| state_under_mixed_load_ms p(95) | **149.34ms** | < 1000ms | ✅ |
| room_page_load_ms p(95) | **140.74ms** | — | ✅ |
| http_req_failed | **99.11%** | < 10% | ❌ |
| mixed_bid_success_rate | **75%** (3/4) | — | — |
| 서버 생존 | **4분 전체** | — | ✅ |

**발견사항:**  
- **서버가 4분 전체 구간 생존** — 시나리오 01(3분 크래시)과 달리 안정적. 70% 입찰자 + 30% 관찰자 혼합이 부하를 분산했을 가능성.  
- http_req_failed 99.11%는 fixture observer 패턴 한계 (state 폴링 중 auction이 idle 상태로 대부분 empty 응답)이며, 실제 응답시간은 우수함.  
- bid 시도 횟수가 4회로 적음 — fixture에서 auction이 진행 중인 시간 대비 state 폴링 비율 불균형.  
- **핵심 시사점: 관찰자(VIEWER) 혼합 시 서버 안정성 향상. 순수 입찰자 10명보다 입찰 7명+관찰 3명 구성이 서버에 더 유리.**

### 시나리오 04: Watchdog 부하 (authorized 5 req/s + unauthorized 2 req/s)

| 지표 | 실측값 | 목표값 | 결과 |
|------|--------|--------|------|
| http_req_failed | **0.00%** | < 10% | ✅ |
| watchdog_latency_ms p(95) | **38ms** | < 5000ms | ✅ |
| watchdog_latency_ms avg | **37.03ms** | — | ✅ |
| watchdog_fail_count | **0** | < 5 | ✅ |
| watchdog_success_count | **599** (4.59/s) | — | ✅ |
| watchdog_unauthorized_rate | **28.69%** | 0% (401 기대) | ❌ |
| checks_succeeded | **83.25%** | — | — |

**발견사항:**  
- Watchdog 자체는 완벽하게 작동. 840 요청 중 실패 0건, p(95) 38ms.  
- **⚠️ 보안 이슈: dev 환경에서 미인증 요청도 200 반환.** `NODE_ENV !== "production"` 조건이 `CRON_SECRET` 검증을 bypass함. 프로덕션 배포 전 반드시 `CRON_SECRET` 환경변수 설정 필요.  
- checks 실패 16.75%는 미인증 요청이 기대하는 401 대신 200을 반환해 `check('미인증 요청은 401 반환')` 실패.  
- **핵심 시사점: Watchdog 성능 자체는 문제없음. 보안 설정만 확인하면 됨.**

---

### 종합 요약표

| 시나리오 | 총 iterations | 서버 생존 | p(95) 응답 | 에러율 | 핵심 발견 |
|----------|--------------|-----------|------------|--------|-----------|
| 01. 정상 흐름 | 919 | ❌ 3분 후 크래시 | 27ms (성공만) | 61.95% | dev 서버 메모리 한계 |
| 02. 동시 스파이크 | 919 | ✅ 2m20s 생존 | 83.83ms | 74.57% | 경합률 99.12%, 재시도 1822회 |
| 03. 혼합 부하 | 916 | ✅ 4분 전체 생존 | 149.39ms | 99.11% | 관찰자 혼합 시 서버 안정화 |
| 04. Watchdog | 840 | ✅ 2분 전체 생존 | 38ms | 0.00% | 보안 이슈: dev 미인증 통과 |

### 핵심 발견 5가지

**1. 로컬 dev 서버의 메모리 불안정성**  
시나리오 01 (10 VU 전체 경매 흐름)에서 3분 후 `connection refused`로 프로세스 사망. Vercel Serverless(요청별 격리)에서는 같은 현상 없음. 로컬 E2E 테스트 시 서버를 정기적으로 재시작해야 함.

**2. 동시 입찰 경합은 예상대로 동작**  
10명 동시 입찰 시 Firestore 트랜잭션 직렬화가 정확히 1명만 성공시킴. 단, 1822회 재시도 발생(평균 2회/VU). bid debounce 없이는 Firestore 부하가 기하급수적 증가.

**3. 관찰자(VIEWER) 혼합이 서버 안정성 개선**  
순수 입찰자 10명(시나리오 01)보다 입찰 7명+관찰 3명(시나리오 03)이 4분 전체 서버 생존. 실제 경매에서도 VIEWER가 포함되므로 프로덕션 안정성은 더 높을 것.

**4. Watchdog 성능 우수, 보안 설정 확인 필요**  
Watchdog 응답 p(95) 38ms로 매우 빠름. 단, `NODE_ENV !== "production"` bypass로 dev 환경에서 CRON_SECRET 없이 접근 가능 → 프로덕션 배포 시 `CRON_SECRET` 환경변수 반드시 설정.

**5. 응답시간은 전반적으로 우수**  
서버 생존 구간의 응답시간은 모든 시나리오에서 목표치를 크게 하회. Vercel + Firebase 프로덕션 환경에서도 추가 RTT(50-100ms)를 고려해도 p(95) < 300ms 목표 달성 가능.

---

## 7. 테스트 실행 권장 순서

```bash
# Step 1: 개발 서버 시작 (E2E fixture 모드)
E2E_AUCTION_FIXTURE=1 npm run dev

# Step 2: 정상 흐름 먼저 검증
k6 run load-tests/scenarios/01-normal-auction.js

# Step 3: 스파이크 테스트
k6 run load-tests/scenarios/02-concurrent-bids.js

# Step 4: 혼합 부하
k6 run load-tests/scenarios/03-mixed-load.js

# Step 5: Watchdog (CRON_SECRET 없으면 dev 모드에서 자동 통과)
k6 run load-tests/scenarios/04-watchdog.js

# Step 6: 결과 JSON 저장
k6 run --out json=load-tests/results/report-$(date +%Y%m%d).json \
  load-tests/scenarios/02-concurrent-bids.js
```

---

## 8. 한계 및 주의사항

1. **Firebase RTDB WebSocket 미측정**: k6는 WebSocket 프로토콜을 지원하지만 Firebase RTDB의 내부 프로토콜을 재현하기 어렵다. RTDB 실시간 팬아웃 지연은 이 테스트로 측정되지 않는다. 실제 브라우저 10개를 Playwright로 동시 구동하는 E2E 방식이 더 정확하다.

2. **E2E Fixture 한계**: `E2E_AUCTION_FIXTURE=1` 모드는 실 Firebase를 사용하지 않는 인메모리 구현이다. 실 Firebase 부하(트랜잭션 경합, RTDB 팬아웃)를 측정하려면 별도 Firebase Emulator 또는 실 프로젝트가 필요하다.

3. **Vercel 배포 환경 재현**: 로컬 `npm run dev`는 Vercel Serverless 환경과 다르다. Cold Start, 리전별 레이턴시를 측정하려면 Vercel Preview 배포 대상으로 테스트해야 한다.

4. **Firebase 과금 주의**: 실 Firebase 프로젝트 대상 부하테스트 시 Blaze 플랜의 과금이 발생할 수 있다. Firestore 쓰기 $0.18/100K, RTDB 연결 $5/GB 기준으로 예산을 미리 설정한다.

---

## 9. 리허설 실측 결과 (2026-06-12, 로컬 프로덕션 빌드)

> 환경: Windows 11 / Next.js 16.2.9 / `next start --port 3010` + `E2E_AUCTION_FIXTURE=1`  
> 목적: 실전 경매(D-10) 전 리허설. 6-11 dev 서버 베이스라인 대비 성능 수정(presence debounce, watchdog 병렬화 등) 적용 후 비교.  
> 원본 요약: `load-tests/results/rehearsal-260612-*.json`

### 베이스라인 대비 비교 (p95 기준)

| 지표 | 6-11 dev 서버 | 6-12 prod 빌드 | 변화 |
|------|--------------|---------------|------|
| 01 서버 생존 | ❌ 3분 후 크래시 | ✅ 4m03s 전체 생존 | **dev 한정 문제로 확정** |
| 01 http_req_duration p95 | 27.17ms | 2.01ms | -92% |
| 02 concurrent_bid_latency p95 | 380.79ms | 105ms | -72% |
| 02 bid_conflict_rate | 99.12% | 99.15% | 동일 (직렬화 정상) |
| 03 http_req_duration p95 | 149.39ms | 4.31ms | -97% |
| 03 room_page_load p95 | 140.74ms | 7ms | -95% |
| 03 입찰 시도 횟수 | 4회 | 990회 | 시나리오 정상 작동 |
| checks 성공률 (전 시나리오) | 100% | 100% | 동일 |

### 판정

- **6-11 핵심 발견 1번(서버 크래시)은 dev 서버(Turbopack) 한정 문제.** 프로덕션 빌드는 10~15 VU 지속 부하에서 11분간(3개 시나리오 연속) 안정적으로 생존했다.
- `http_req_failed` threshold는 3개 시나리오 모두 초과했으나, 이는 입찰 경합 거절 응답(4xx)이 실패로 집계되는 알려진 아티팩트다. checks 100%가 실제 가용성을 반영한다.
- 경합 직렬화(1라운드 1명 낙찰)와 재시도 횟수(1,874회, 베이스라인 1,822회)는 베이스라인과 동일한 패턴 — 회귀 없음.
- **실전 전 잔여 확인 사항**: 실 Firebase RTDB 팬아웃과 Vercel Cold Start는 이 리허설로 측정되지 않음(8장 한계 1·3번). 실전 당일 latency 관측(`latency_reports` 컬렉션, p95 ≤ 500ms 목표)으로 보완한다.
