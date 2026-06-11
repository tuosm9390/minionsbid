# 코드베이스 전체 점검 및 단계별 개선 계획 (2026-06-11)

> 점검 범위: src 전체(27,484줄), 보안 규칙, 의존성, CI, 저장소 위생.
> 점검 방법: tsc / eslint / npm audit 실행, 보안 규칙·API 라우트 전수 확인, 대형 파일 식별, TODOS.md 백로그 대조.

---

## 0. 현재 상태 요약 (양호한 부분)

- **타입 안전성 우수**: `tsc --noEmit` 통과, src 내 `as any` / `@ts-ignore` 0건.
- **단위 테스트 통과**: 33개 파일 210개 테스트 전부 green.
- **보안 규칙 정교함**: `isBidUpdate` Firestore 규칙이 입찰 금액/타이머/revision/포인트 잔액까지 검증.
- **E2E 라우트 가드 정상**: `/api/e2e/*`는 `E2E_AUCTION_FIXTURE` / `USE_FIREBASE_EMULATOR` 환경변수로 차단됨.

---

## 1. 발견된 문제 목록

### 🔴 심각 (보안/의존성)

| # | 문제 | 위치 | 근거 |
|---|------|------|------|
| S1 | **npm 취약점 28건** (critical 3, high 9) | `package.json` | `npm audit` 실측 |
| S2 | **xlsx 패키지 high 취약점, 패치 없음** (Prototype Pollution + ReDoS) | `xlsx@0.18.5` | GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9 |
| S3 | **firebase-admin 취약 체인** (uuid → teeny-request → @google-cloud/firestore) | `firebase-admin@13.7.0` | npm audit |
| S4 | **short-links API 무인증·무제한** — origin 검증은 있으나 rate limit 없음. buly API 쿼터 소진 공격 가능 | `src/app/api/short-links/route.ts` | 코드 확인 |
| S5 | RTDB `signals`/`presence` `.read: true` — roomId만 알면 누구나 채팅·이벤트·접속자 열람 | `database.rules.json` | TODOS 백로그에도 인지됨 |

### 🟡 중간 (구조/유지보수)

| # | 문제 | 위치 | 근거 |
|---|------|------|------|
| M1 | **god file**: `auctionFlowActions.ts` 1,878줄 — 추첨/시작/입찰/낙찰/일시정지/비공개입찰 등 10개+ 액션 혼재 | `src/features/auction/api/auctionFlowActions.ts` | wc -l |
| M2 | 대형 파일 5개 추가: `LeagueScheduleManager.tsx` 1,127줄, `scheduleActions.ts` 1,057줄, `ScheduleMatchDayEditor.tsx` 922줄, `useAuctionRealtime.ts` 807줄, `useCreateRoom.ts` 605줄 | 각 파일 | wc -l |
| M3 | **이중 입찰 경로**: `placeBidDirect`(클라이언트) 실패 시 `placeBid`(서버 액션) 폴백 — 검증 로직이 두 곳에 중복 유지됨 | `useBiddingControl.ts:182-272` | LOAD_TEST_PLAN 전략 1과 동일 지적 |
| M4 | **CI에 단위테스트/타입체크/lint/build 전무** — Playwright smoke만 실행. vitest 210개가 PR에서 검증 안 됨 | `.github/workflows/auction-realtime-ci.yml` | grep 확인 |
| M5 | watchdog `isAuthorized`에 죽은 코드 — `if (!cronSecret && !legacySecret) return false;` 직후 `return false;` 중복 | `src/app/api/auction-watchdog/route.ts:24-27` | 2026-06-11 보안 수정의 잔재 |

### 🟢 경미 (위생/품질)

| # | 문제 | 위치 |
|---|------|------|
| L1 | 커밋된 불필요 파일: `load-tests/dev-server.log`, `.codex/**/__pycache__/*.pyc` 3개, `.sisyphus/run-continuation/*.json` | git ls-files |
| L2 | lint 경고 6건 (load-tests 시나리오의 anonymous default export, unused vars) | `load-tests/scenarios/*.js` |
| L3 | `.gitignore`에 `*.log`(load-tests), `__pycache__/`, `.sisyphus/` 패턴 없음 | `.gitignore` |
| L4 | E2E final-second 시나리오 flaky (runner 속도 의존) | `playwright/auction-realtime.spec.ts` — TODOS 기존 백로그 |
| L5 | 운영 latency 관측 체계 부재 (`p95 <= 500ms` 검증 불가) | TODOS 기존 백로그 |

---

## 2. 단계별 개선 계획

### Phase 1 — 위생·보안 즉시 조치 (반나절, 위험도 낮음)

1. **커밋된 junk 제거 + gitignore 보강** (L1, L3)
   - `git rm --cached`: `load-tests/dev-server.log`, `.pyc` 3개, `.sisyphus/` json
   - `.gitignore`에 `load-tests/*.log`, `__pycache__/`, `.sisyphus/` 추가
   - 검증: `git ls-files | grep -E "\.log$|\.pyc$|\.sisyphus"` → 0건
2. **watchdog 죽은 코드 정리** (M5) — `isAuthorized` 마지막 분기를 `return false` 하나로 통합
   - 검증: tsc 통과 + 기존 테스트 green
3. **lint 경고 해소** (L2) — named export 전환, unused var 제거
   - 검증: `npm run lint` → 0 warnings
4. **비파괴 `npm audit fix` 적용** (S3) — undici, uuid, minimatch, picomatch 등 해결
   - ~~firebase-admin 업데이트~~ → 14.0.0은 레거시 namespace API(`admin.firestore` 등)를 제거한 메이저로, 10개 파일 60곳 수정 필요. Phase 2 항목으로 분리 (실측: 14 설치 시 tsc 오류 다수 발생하여 13.7.0 유지).
   - 검증: critical/high 건수 감소 확인, `npm test` green
   - **실행 결과 (2026-06-11)**: 28건 → 18건 (high 9→2, critical 3→2). 잔여는 next/xlsx/vitest 체인으로 전부 breaking 업그레이드 필요.

### Phase 2 — 의존성·CI 강화 (1~2일) ✅ 완료 (2026-06-11)

> **실행 결과**: next 16.2.9 업그레이드, quality-ci 워크플로 추가, firebase-admin 모듈러 API 전환 + v14, xlsx → SheetJS 공식 CDN 0.20.3, short-links 상한(20)/IP 스로틀(30/min) 적용.
> 취약점 28건 → 14건. 잔여는 전부 upstream 대기(next 내장 postcss, google-cloud 체인) 또는 dev 전용(vitest/esbuild 체인).
> 검증: tsc / lint 0건 / 단위테스트 212개 / 프로덕션 빌드 통과.

> **추가 발견 (2026-06-11 Phase 1 중)**: 고정된 `next@16.1.6` 자체에 high/critical CVE 다수 — 미들웨어 우회(GHSA-492v, GHSA-267c), 캐시 포이즈닝(GHSA-wfc6), HTTP request smuggling(GHSA-ggv3) 등. **next 16.2.9 업그레이드가 Phase 2 최우선.**

4-1. **next 16.1.6 → 16.2.9 업그레이드** — package.json이 정확 버전 고정이므로 명시 변경 필요.
   - 검증: `npm run build` + `npm test` + E2E fixture 스모크
4-2. **firebase-admin 14 마이그레이션** — `import * as admin` namespace 제거 대응. 10개 파일 60곳: `admin.firestore.Timestamp/FieldValue` → `firebase-admin/firestore` 모듈 import, `admin.auth()` → `getAuth()`.
   - 검증: tsc + 210 단위 테스트 + E2E
5. **CI에 검증 잡 추가** (M4) — 가장 투자 대비 효과 큰 항목.
   - 새 job: `npm ci && npx tsc --noEmit && npm run lint && npm test`
   - 기존 Playwright 잡과 병렬 실행, 전체 PR에 대해 트리거 (현재는 auction 경로만)
   - 검증: 의도적 타입 오류 PR로 실패 확인 후 revert
6. **xlsx 대체 검토** (S2) — 패치가 없으므로 선택지 비교 후 결정.
   - 옵션 A: `exceljs`로 교체 (유지보수 활발, API 상이 — `useCreateRoom.ts`의 파싱 로직 수정 필요)
   - 옵션 B: 신뢰 사용자(방 생성자)만 업로드하므로 위험 수용 + `npm audit --omit=dev` 예외 문서화
   - 권장: A. 업로드 파일은 외부 입력이므로 ReDoS 표면을 남기지 않는 편이 안전.
   - 검증: `CreateRoomModal.test.tsx`의 Excel 파싱 테스트 6건 green
7. **short-links 남용 방지** (S4) — 요청당 links 개수 상한(예: 20) + 간단한 IP 기반 rate limit 또는 room-auth 토큰 요구
   - 검증: 상한 초과 요청 400 반환 테스트 추가

### Phase 3 — 코드 구조 정리 (1주, 기능 변화 없음) — 8번 완료 (2026-06-11)

> **8번 실행 결과**: auctionFlowActions.ts(1,883줄)를 5개 모듈로 분할 — Shared(공유 헬퍼)/Draw/Lifecycle/Bid/SealedBid. 기존 파일은 배럴로 전환해 import 경로 무수정 호환. 코드 구간 그대로 이동(로직 변경 없음). tsc/lint/테스트 212개/빌드 통과.
> 9번(입찰 폴백 경로 정리)은 운영 로그에서 `placeBid` 폴백 발동 빈도 확인이 선행 — 미착수. 10번(스케줄 컴포넌트 분할)은 아키텍처 결정 대기로 보류 유지.

8. **`auctionFlowActions.ts` 분할** (M1) — 도메인별 4파일로:
   - `auctionEventPublish.ts` (publishAuctionEvent, sysMsg, createEventId 등 공용 헬퍼)
   - `auctionDrawActions.ts` (drawNextPlayer, closeLottery)
   - `auctionBidActions.ts` (placeBid, broadcastBidEvent, awardPlayer, recoverExpiredAuction)
   - `auctionSealedBidActions.ts` (비공개 입찰 일체)
   - 제약: re-export로 기존 import 경로 유지 → 호출부 무수정. 분할 전후 `npm test` + E2E fixture 테스트로 검증.
9. **이중 입찰 경로 정리** (M3) — 실 운영 로그에서 `placeBid` 폴백 발동 빈도 확인 후:
   - 발동 0건이면 폴백 제거하고 `placeBidDirect` 단일화 (Firestore rules가 최종 방어선)
   - 발동 있으면 원인(권한 토큰 만료 등) 해소가 선행
   - 검증: `useBiddingControl.test.tsx` + `auction-realtime.spec.ts` E2E
10. **대형 컴포넌트 분할은 보류** (M2) — 스케줄 기능은 TODOS의 "일정 관리 아키텍처 미결정 2건"과 묶여 있으므로, 아키텍처 결정 전 분할은 이중 작업. 결정 후 착수.

### Phase 4 — 보안 모델 고도화 (TODOS 백로그 연계, 별도 스프린트)

11. **RTDB read 범위 제한** (S5) — `signals`/`presence` 읽기에 `auth != null` 최소 요구. 현재 VIEWER도 custom token을 받는지 확인 필요 — 받지 않으면 VIEWER용 익명 인증 경로부터 추가.
12. **Firestore read 범위 identity 기반 제한** — TODOS "Firebase client identity 모델 고도화"와 동일 트랙. messages/teams/players의 `list: true`를 room 참여자 클레임 기반으로 전환.
   - 주의: 링크 입장(roomId 공유) UX와 충돌하므로 토큰 발급 흐름 설계가 선행. 단독 진행 금지.

### Phase 5 — 운영 품질 (지속)

13. **latency 관측 체계** (L5) — 이미 존재하는 `recordAuctionLatencyMarker`(eventId 기반 marker)를 운영 수집으로 확장. Vercel Analytics custom event 또는 Firestore 별도 컬렉션 집계 중 택일.
14. **final-second E2E 안정화** (L4) — fixture에 timer freeze 훅 추가 검토 (TODOS 기존 항목).
15. **부하테스트 정례화** — `load-tests/` 시나리오를 릴리스 전 체크리스트에 포함. Vercel Preview 대상 실행으로 Cold Start 실측 보완.

---

## 3. 실행 순서 요약

```
Phase 1 (반나절) → 위생·보안 quick win, 즉시 가능
Phase 2 (1~2일) → CI 강화가 최우선, xlsx 교체 결정 필요
Phase 3 (1주)   → 구조 정리, 기능 변화 없음, 테스트로 검증
Phase 4 (별도)  → 보안 모델 — 단독 진행 금지, 설계 선행
Phase 5 (지속)  → 운영 관측·테스트 안정화
```

**의존 관계**: Phase 1·2는 독립적으로 즉시 가능. Phase 3-9(입찰 경로 정리)는 운영 로그 확인이 선행. Phase 4는 토큰 발급 흐름 설계가 선행. Phase 3-10(스케줄 컴포넌트 분할)은 아키텍처 결정이 선행.
