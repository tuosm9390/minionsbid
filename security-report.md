# 보안 분석 보고서 - Minions Bid

**분석 일자:** 2026-05-18  
**분석 범위:** presence-only 인증 전환 이후 전체 코드베이스  
**전체 위험도:** HIGH (신뢰된 소규모 모임 한정 MEDIUM)

---

## 요약

| 심각도 | 건수 |
|--------|------|
| Critical | 1 |
| High | 4 |
| Medium | 4 |
| Low | 3 |

핵심 문제는 **`requireRoomOrganizer`가 항상 통과**하고 **custom-token 발급 라우트가 무인증**으로 동작한다는 점입니다. 방 ID(UUID)를 아는 사람은 누구나 주최자 권한을 얻을 수 있습니다.

---

## 1. 현재 인증 아키텍처

### 1.1 인증/권한 결정 흐름

1. **URL 파라미터 기반 role 결정** — `src/app/room/[id]/page.tsx:29-31`
   - `?role=ORGANIZER|LEADER|VIEWER` 값을 그대로 신뢰. 어떤 서버 측 검증도 없음.

2. **Firebase Custom Token 발급 라우트** — `src/app/api/room-auth/firebase-token/route.ts:15-36`
   - 요청 바디의 `roomId/role/teamId`를 검증 없이 custom token으로 발급. 누구나 `role: 'ORGANIZER'` 토큰 획득 가능.

3. **서버 액션 권한 검증** — `src/features/auction/api/organizerAuth.ts`
   ```ts
   export async function requireRoomOrganizer(_roomId, _token): Promise<string | null> {
     return null // 항상 통과
   }
   ```
   `startAuction`, `pauseAuction`, `awardPlayer`, `drawNextPlayer`, `deleteRoom`, `saveAuctionArchive`, `restartAuctionWithUnsold`, `lockSealedBidRound`, `revealSealedBidRound`, `completeSealedBidReveal`, `draftPlayer`, `closeLotteryAction` 등 모든 주최자 액션이 이 빈 가드 뒤에 있음.

4. **Presence 검증의 실제 역할**
   - `getPresenceRole`은 RTDB presence 레코드와 `sessionId` 형식으로 role을 추출.
   - 이는 "리더 2명 이상 접속 확인" 같은 **동시성·UX 게이트**이며, 권한 게이트가 아님.

---

## 2. 소규모 모임 환경에서의 보안 충분성

### 위협 모델

| 위협 주체 | 보호 수준 |
|---|---|
| 같은 방의 일반 유저(친구) | **취약** — URL 편집으로 주최자/타팀 LEADER 위장 가능 |
| 방 링크가 외부 유출(스크린샷·디스코드 공유) | **취약** — 방 ID가 곧 권한 |
| 인터넷 외부 공격자(roomId 모름) | 충분 — UUID 추측 불가 |
| 자동화된 봇·스캐너 | 충분 — 방을 찾지 못함 |

### 충분한 점

- 방 ID가 `crypto.randomUUID()`로 생성 — 추측 불가, URL 자체가 첫 번째 방어선.
- 민감 정보 없음 — 포인트와 닉네임뿐, 결제·PII 없음.
- 클라이언트 직접 쓰기는 입찰(`isBidUpdate`)만 허용 — `firestore.rules` 캐치올.
- `room_auth_secrets`는 클라이언트 접근 불가.
- 입력 길이 제한 적절 — chat 200자, 팀이름 20자, bid 양의 정수 + 10P 단위 + 100,000P 한도.

### 부족한 점

- **친구가 `?role=ORGANIZER`로 접속해 방 종료·강제 낙찰·재경매 실행 가능** (`requireRoomOrganizer`가 항상 통과).
- **친구가 `?role=LEADER&teamId=OTHER_TEAM`으로 접속해 다른 팀 이름으로 입찰 가능** — custom-token 라우트가 누구에게나 원하는 teamId 토큰 발급.
- **방 링크 유출 = 영구 손상** — 토큰 무효화 메커니즘 없음.
- **감사 로그 없음** — 누가 어떤 액션을 실행했는지 추적 불가.

**결론:** 모든 참여자가 신뢰 가능한 5~10명 모임이라면 사고 가능성이 낮지만, 장난·실수로 게임 전체가 망가질 수 있음. **"방 링크 알면 = 모든 권한"** 모델.

---

## 3. 복잡한 환경(다수 유저, 동시 경매)에서의 안정성

### 동시성·안정성 — 양호한 부분

- `runTransaction`으로 원자성 보장 — `placeBid`, `awardPlayer`, `startAuction`, `draftPlayer` 모두 사용.
- `auction_revision` 카운터로 이벤트 순서 보장.
- `isBidUpdate` 규칙이 `after.auction_revision == before.auction_revision + 1` 강제 — 동시 입찰 중 하나 자동 실패.
- `timer_ends_at > request.time`으로 타이머 만료 후 입찰 차단.
- 포인트 잔액을 트랜잭션 내부 fresh read 후 검증.
- watchdog 라우트가 zombie 상태 자동 복구.
- `useAuctionPresenceGuard`가 LEADER 끊김 시 3초 grace 후 pause, 재연결 시 resume.

**판정:** 기술적 안정성은 양호. 문제는 동시성이 아니라 **인증된 액터의 신원을 신뢰할 수 없다**는 점.

---

## 4. 발견된 취약점

### [CRITICAL] 주최자 권한 검증 완전 비활성화
- **위치:** `src/features/auction/api/organizerAuth.ts:5-9`
- **분류:** OWASP A01 Broken Access Control
- **Exploitability:** 원격, 인증 불필요. roomId만 알면 됨.
- **영향:** 방 종료, 강제 낙찰, 재경매, 결과 아카이브 조작, 자유계약 영입 — 전 게임 흐름 파괴 가능.

**개선안** (`room_auth_secrets`의 `organizer_token` 검증 복원)
```ts
export async function requireRoomOrganizer(
  roomId: string,
  token?: string,
): Promise<string | null> {
  if (!token) return ORGANIZER_AUTH_ERROR
  const { firestore } = getAuctionServerServices()
  const secretSnap = await firestore.collection('room_auth_secrets').doc(roomId).get()
  const expected = secretSnap.data()?.organizer_token
  if (typeof expected !== 'string' || expected.length !== token.length) {
    return ORGANIZER_AUTH_ERROR
  }
  const a = Buffer.from(expected)
  const b = Buffer.from(token)
  return (await import('node:crypto')).timingSafeEqual(a, b) ? null : ORGANIZER_AUTH_ERROR
}
```
방 생성 시 `organizer_token`이 이미 `room_auth_secrets`에 저장되므로(`roomActions.ts:113, 144`), 함수 본체만 채우면 됨.

---

### [HIGH-1] Custom-token 라우트 무인증 발급
- **위치:** `src/app/api/room-auth/firebase-token/route.ts:15-36`
- **분류:** OWASP A01 / A07
- **영향:** 임의의 roomId/teamId에 대해 LEADER claim token 발급 → 다른 팀 포인트로 입찰 가능.

**개선안** (`validateRoomAuthToken` 헬퍼가 이미 `src/features/auction/utils/roomAuth.ts`에 존재)
```ts
const isValid = await validateRoomAuthToken({ roomId, role, teamId, token: accessToken, ... })
if (!isValid) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
```

---

### [HIGH-2] URL `?role=` 파라미터가 곧 권한
- **위치:** `src/app/room/[id]/page.tsx:29-31`
- **분류:** OWASP A01
- **영향:** 브라우저 주소창 편집만으로 ORGANIZER UI 활성화 + API 직접 실행.

**개선안:** CRITICAL-1 + HIGH-1 수정 후 클라이언트 URL 조작 시 API가 거절하므로 실질 피해 차단.

---

### [HIGH-3] 채팅 발신자 위장 (공지/시스템 메시지)
- **위치:** `src/features/auction/api/chatActions.ts:37-86`
- **분류:** OWASP A01 / A04
- **영향:** VIEWER가 senderRole을 `NOTICE`로 보내 가짜 공지 게시 또는 다른 팀장 닉네임으로 메시지 발송.

**개선안**
```ts
if (senderRole === 'ORGANIZER' || senderRole === 'NOTICE' || senderRole === 'SYSTEM') {
  const err = await requireRoomOrganizer(roomId, roleToken)
  if (err) return { error: err }
}
```

---

### [HIGH-4] `xlsx` 패키지 알려진 취약점 (Prototype Pollution + ReDoS)
- **위치:** `package.json` → `xlsx ^0.18.5`
- **분류:** OWASP A06
- `npm audit` 결과: 총 28건 (critical 1, high 9, moderate 10, low 8)

**개선안:** `exceljs` 또는 SheetJS 공식 CDN tarball 최신 빌드로 마이그레이션. 입력 신뢰 경계 명확화.

---

### [MEDIUM-1] 토큰 회전·만료 메커니즘 부재
방 링크가 한 번 유출되면 방을 새로 만드는 것 외 무효화 방법 없음.

**개선안:** `rotateRoomTokens(roomId, organizerToken)` 액션 추가.

### [MEDIUM-2] 감사 로그 부재
모든 주최자 액션에 actor identity 기록 없음. `pauseAuction`, `awardPlayer`, `deleteRoom`에 검증된 token의 sha-256 prefix 기록 권장.

### [MEDIUM-3] `/api/room-links` GET이 인증 없이 팀 정보 노출
닉네임·팀 명단이 roomId만으로 조회 가능 → viewer_token 또는 organizer_token 요구 권장.

### [MEDIUM-4] watchdog cron 비프로덕션 무인증
`CRON_SECRET`/`legacySecret`이 없으면 비프로덕션에서 누구나 호출 가능. 명시적 `ALLOW_INSECURE_WATCHDOG=1` opt-in으로 전환 권장.

### [LOW-1~3]
- `/api/room-links`가 팀 leader_name을 인증 없이 노출.
- `placeBidClient.ts:127` bid ID 생성에 `Math.random()` 사용 → `crypto.randomUUID()` 권장.
- 디버그 모드가 URL/localStorage로 토글 가능 → 빌드 시점 가드 권장.

---

## 5. 팀장 컨트롤 패널 표시 문제 분석

### 5.1 컨트롤 패널 표시 조건

`src/app/room/[id]/RoomClient.tsx:454`에서 아래 세 조건이 동시에 true여야 패널 표시.

1. `effectiveRole === "LEADER"`
2. `roomId` truthy
3. `storeTeamId` truthy (Zustand store의 `teamId`)

### 5.2 문제 원인 가설 (우선순위 순)

**[가장 유력] 가설 A — 잘못된 링크 공유**
- `LinksModal.tsx`의 `[...captainLinks].sort(...)` 후 표시되는 링크를 운영자가 잘못 짚어 다른 팀에게 다른 팀의 LEADER 링크를 보낸 경우.
- 토큰 제거 이후 "잘못된 링크" = "조용히 엉뚱한 역할로 입장"으로 바뀜. 에러 메시지 없음.

**[유력] 가설 B — 단축 URL 리다이렉트에서 `teamId` 파라미터 유실**
- 메신저/단축 URL 처리 중 `&teamId=...` 파라미터가 잘리는 경우.
- `page.tsx:30`에서 `isValidRoomRole` 실패 → `role = null` → 어떤 패널도 미표시.
- 단축 URL 도입 PR(`d3e2b38`, `4be23c1`)이 직전 변경이라 의심.

**가설 C — `teamId`가 빈 문자열로 도달**
- `page.tsx:31`: `resolvedSearchParams.teamId || null` — 빈 문자열은 null.
- `useAuctionStore.ts:202`: `teamId || null`로 null 저장.
- `RoomClient.tsx:454`의 `storeTeamId` 가드 falsy → 팀장 패널 미표시.
- 동시에 `usePresence.ts:48`에서 사일런트 스킵 → 본인이 다른 유저 화면에서 미접속자로 보임.

**가설 D — `usePresence` 등록 실패로 주최자 UI 간접 비활성화**
- Firebase 익명 인증 실패 시 `setPresenceLoaded(true)`만 호출 → 본인 presence 누락.
- 다른 유저 화면에서 `allConnected` 조건 실패 → 주최자의 "다음 선수 추첨" 버튼 비활성화.
- "주최자가 컨트롤을 못 본다"로 오보고되었을 가능성.

### 5.3 권고사항

1. **(높음, 1~2시간) 진단 UI 추가**
   - `effectiveRole === null` 또는 `effectiveRole === 'LEADER' && !storeTeamId`일 때 "잘못된 접속 링크입니다. 주최자에게 링크를 다시 요청하세요." 화면 출력.

2. **(높음, 30분) 단축 URL 회귀 테스트**
   - `role`과 `teamId` 두 파라미터가 모두 보존되는지 확인. 특히 `teamId`(UUID) URL-encode 유지 여부.

3. **(중간, 30분) `LinksModal`에 팀별 "테스트 입장" 버튼**
   - 운영자가 배포 전 각 팀장 링크를 직접 열어볼 수 있도록.

4. **(중간, 1시간) `useRoomAuth` 단순화 또는 이름 변경**
   - 현재 함수는 단순 effect 래퍼로만 동작. `useSyncRoomContext`로 이름 변경하거나 인라인화 권장.

---

## 6. 최종 판정 및 즉시 수행 권고

### 즉시 (Critical/High)

- [ ] `requireRoomOrganizer`를 `room_auth_secrets`의 `organizer_token`으로 복원.
- [ ] `firebase-token` 발급 라우트를 `validateRoomAuthToken` 헬퍼로 게이트.
- [ ] `sendChatMessage`의 발신자 역할 검증 추가 (ORGANIZER/NOTICE 사칭 차단).
- [ ] `xlsx` 의존성 교체 또는 사용 경로 격리.

### 단기 (Medium)

- [ ] 토큰 회전 API (`rotateRoomTokens`) 추가.
- [ ] `/api/room-links`에 viewer_token 요구.
- [ ] watchdog 비프로덕션 무인증 분기를 명시적 env opt-in으로 전환.
- [ ] 감사 로그 — 주요 액션에 actor digest 기록.

### 팀장 패널 문제

- [ ] `effectiveRole`/`teamId` 검증 실패 시 에러 UI 표시.
- [ ] 단축 URL 파라미터 보존 회귀 테스트.
- [ ] `LinksModal` 팀별 테스트 입장 버튼.

### 보안 체크리스트

| 항목 | 상태 |
|---|---|
| 하드코딩된 secret 없음 | ✅ 통과 |
| 모든 사용자 입력 검증 | ⚠️ 부분 통과 (sender role/name 미검증) |
| 인젝션 방어 | ✅ 통과 (Firestore SDK + 보안 규칙) |
| 인증/인가 검증 | ❌ 실패 (주최자 토큰 검증 비활성, custom-token 무인증) |
| 의존성 audit | ❌ 실패 (28건, 1 critical, 9 high; xlsx no-fix) |
| XSS 방어 | ✅ 통과 (`dangerouslySetInnerHTML` 1곳은 정적 JSON-LD) |
| HTTPS 강제 | ✅ Vercel 기본 처리 |
| 로깅·모니터링 | ⚠️ 부족 (audit log 부재) |

---

## 관련 핵심 파일

| 파일 | 이슈 |
|---|---|
| `src/features/auction/api/organizerAuth.ts:5-9` | CRITICAL — 항상 null 반환 |
| `src/app/api/room-auth/firebase-token/route.ts:15-36` | HIGH — 무인증 token 발급 |
| `src/app/room/[id]/page.tsx:29-31` | HIGH — URL role 파라미터 무검증 신뢰 |
| `src/features/auction/api/chatActions.ts:37-86` | HIGH — 발신자 역할 위장 가능 |
| `src/features/auction/hooks/useRoomAuth.ts:12-18` | 역할 검증 없이 store 동기화만 함 |
| `src/features/auction/hooks/usePresence.ts:48-51` | LEADER+teamId 누락 시 사일런트 스킵 |
| `src/features/auction/components/LinksModal.tsx:97-163` | 토큰 없는 long URL 생성 |
| `src/features/auction/utils/roomAuth.ts` | 복원 가능한 검증 헬퍼 존재 |
| `src/app/room/[id]/RoomClient.tsx:431-481` | 팀장 패널 표시 조건 |
| `src/features/auction/store/useAuctionStore.ts:200-209` | `setRoomContext` — teamId 빈 문자열은 null |
| `src/app/api/auction-watchdog/route.ts:24-27` | 비프로덕션 무인증 분기 |
| `firestore.rules` | Admin SDK 경로는 규칙 우회 |
| `database.rules.json` | RTDB — custom token claim 그대로 신뢰 |
| `package.json` | `xlsx ^0.18.5` — no-fix known vulnerabilities |
