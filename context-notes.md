# 비공개 입찰 구현 컨텍스트 노트

## lint 문제 해결과 evidence 정책 정리

- 2026-06-03: 사용자는 `$omo:ulw-loop`로 lint 문제 해결과 이전 리뷰 권장조치 실행을 요청했다. 범위는 `npm run lint` 실패 해소, `.omo` evidence 추적 정책 정리, full test/build 회귀, tmux 기반 CLI QA evidence 수집이다.
- 2026-06-03: 초기 lint 실패는 scripts CommonJS import 규칙, React hook purity/set-state/ref 규칙, 일정 기록 util의 빈 interface, unused warning으로 나뉜다. 운영 스크립트는 CommonJS 실행 계약을 유지하는 것이 최소 변경이다.
- 2026-06-03: `.omo/`는 작업 evidence 성격이므로 새 evidence는 추적하지 않도록 `.gitignore` 정책을 고정하고, 이미 추적된 `.omo/ulw-loop` evidence는 커밋 대상에서 제거하는 방향으로 정리한다.
- 2026-06-03: ESLint config test를 추가해 `.omo/**` ignore와 `scripts/**/*.js`의 `@typescript-eslint/no-require-imports` 해제를 고정했다. `git rm --cached -r .omo/ulw-loop/019e6407-9162-7733-abd9-4227ac6fcfc7 .omo/ulw-loop/evidence`로 추적만 제거하고 파일은 유지했다.
- 2026-06-03: `tmux`가 Windows shell에 없어 Ultrawork criteria는 CLI stdout evidence 기준으로 재정의했다. `npm run lint`, `npm run test`, `npm run build`, targeted regression, `.omo` ignore policy가 모두 통과했고 최종 리뷰어 스레드는 종료됐지만 판정 본문이 전달되지 않아 로컬 criteria PASS와 검증 로그로 게이트를 마감했다.

## init-deep와 DESCRIPTION 갱신

- 2026-06-01: 사용자가 `$omo:init-deep`와 `$project-describer`를 요청했다. 범위는 계층형 `AGENTS.md` 갱신과 현재 코드베이스 기준 `DESCRIPTION.md` 재작성이다.
- 2026-06-01: 기존 하위 지침은 `src/features/auction`, `src/features/schedules`, `playwright`, `__tests__`, `scripts`에 이미 존재한다. 새 하위 후보는 route handler와 room shell 경계가 뚜렷한 `src/app`, 큰 UI shell과 공용 Cyber-Pixel 컴포넌트가 모인 `src/components`로 결정했다.
- 2026-06-01: `src/features/hall-of-fame`은 파일 수와 독립 규칙 밀도가 낮아 이번에는 별도 `AGENTS.md`를 만들지 않고 루트와 `DESCRIPTION.md` 설명으로 커버한다.
- 2026-06-01: `DESCRIPTION.md`는 Next.js 16, React 19, Firestore canonical state, RTDB fanout, direct bid hot path, sealed bid pipeline, schedule, hall of fame, OS compatibility smoke까지 현재 코드 상태를 기준으로 갱신했다.

## direct bid 운영 latency 관측

- 2026-06-01: 사용자는 일정 화면 분리, match_days 문서 분리, room read rules 강화는 지금 하지 않는 것으로 결정했다. 경매는 주최자와 모든 팀장이 접속 중일 때만 진행되어야 하며, watchdog은 자동 진행 핵심 경로가 아니다.
- 2026-06-01: 다음 구현 우선순위는 운영 latency 관측이다. 현재 direct bid는 Firestore transaction에서 bid id를 만들지만 `placeBidDirect()` 응답이 eventId를 반환하지 않아 `client-response`와 이후 RTDB/Firestore fallback marker를 같은 eventId로 묶기 어렵다.
- 2026-06-01: direct bid 응답에 `active_bid.event_id`를 반환하고, `useBiddingControl`이 같은 eventId로 click/response marker를 남기도록 구현했다. 후속 `broadcastBidEvent`도 `liveBid.event_id`를 RTDB envelope eventId로 사용해 RTDB/room fallback marker와 연결된다.
- 2026-06-01: RED evidence는 `.omo/ulw-loop/evidence/red-direct-event.txt`, `.omo/ulw-loop/evidence/red-marker-merge.txt`에 저장했다. GREEN 및 manual QA evidence는 `.omo/ulw-loop/evidence/green-direct-event.txt`, `.omo/ulw-loop/evidence/green-marker-merge.txt`, `.omo/ulw-loop/evidence/direct-event-playwright.txt`, `.omo/ulw-loop/evidence/presence-policy-playwright.txt`에 저장했다.

## 경매 OS와 브라우저 호환성 검증

- 2026-06-01: 현재 로컬 세션은 Windows 단일 OS이므로 Ubuntu, macOS까지 실제로 동일 동작을 단정할 수 없다. 이번 작업은 로컬 브라우저 매트릭스와 GitHub Actions OS 매트릭스를 추가해 동일성 검증을 반복 가능한 절차로 고정하는 범위다.
- 2026-06-01: 대표 smoke는 fixture `active-auction`에서 Blue와 Red 팀장을 독립 browser context로 열고, Blue 10점 입찰 후 Red 최소 입찰값이 20으로 수렴하며 Firestore fixture state의 canonical live bid와 bid history가 일치하는지 확인한다.
- 2026-06-01: OS 매트릭스는 `ubuntu-latest`, `windows-latest`, `macos-latest`에서 Chromium 대표 smoke를 실행한다. 브라우저 엔진 차이는 Ubuntu에서 Chromium, Firefox, WebKit으로 별도 확인한다.
- 2026-06-01: 로컬 Windows에서 `npm run test:e2e:auction:compat` Chromium smoke는 통과했다. 전체 프로젝트 실행에서는 Chromium, WebKit, mobile Chrome, mobile Safari가 통과했지만 Firefox는 `browserContext.newPage()`에서 60초 timeout으로 멈춰 앱 경매 로직에 도달하지 못했다. 기본 로컬 명령은 OS 대표 smoke인 Chromium으로 제한하고, Firefox/WebKit 엔진 검증은 CI 브라우저 매트릭스에 맡긴다.
- 2026-06-01: 검증 evidence는 `.omo/ulw-loop/evidence/red-os-compat-config.txt`, `.omo/ulw-loop/evidence/green-os-compat-config-final.txt`, `.omo/ulw-loop/evidence/os-compat-local-chromium.txt`, `.omo/ulw-loop/evidence/full-npm-test-os-compat.txt`, `.omo/ulw-loop/evidence/npm-build-os-compat.txt`, `.omo/ulw-loop/evidence/npm-lint-os-compat.txt`에 저장했다.
- 2026-06-01: `npm run lint`는 실패했지만 새로 추가한 OS 호환성 파일이 아니라 기존 scripts의 CommonJS `require`, 기존 React hook compiler rule, 기존 unused import 경고에서 실패한다.

## direct bid 정본 수렴과 rules 강화

- 2026-05-26: 현재 공개 입찰은 입찰자 본인 화면에 `useBiddingControl`이 optimistic `liveBid`를 즉시 표시하고, Firestore direct transaction commit 후 RTDB broadcast를 fire-and-forget으로 실행한다.
- 2026-05-26: peer 화면은 RTDB `BID_PLACED` 또는 Firestore `last_auction_event` fallback을 주로 적용한다. direct bid commit은 성공했지만 RTDB/`last_auction_event`가 늦거나 실패한 경우에도 room snapshot의 `active_bid`, `timer_ends_at`, `auction_revision`으로 수렴해야 한다.
- 2026-05-26: event 없는 room snapshot은 `liveBid`, `timerEndsAt`, `currentPlayerId`만 투영하고 `auctionEventRevision`을 올리지 않는다. 같은 revision의 RTDB `PLAYER_AWARDED` / `PLAYER_UNSOLD` 이벤트가 뒤늦게 와도 무시하면 안 되기 때문이다.
- 2026-05-26: direct bid는 클라이언트-origin Firestore write라 rules가 최종 방어선이다. 팀 정원 검증은 rules에서 SOLD count query를 할 수 없으므로 팀 문서의 auction slot 사용량 정본 필드를 transaction으로 유지하는 방식으로 보강한다.
- 2026-05-26: 기존 room/team 문서는 새 슬롯 필드가 없으므로 backfill 또는 legacy 허용 정책이 필요하다. rules는 새 필드를 요구하게 하고, 운영 적용 전 backfill 스크립트로 기존 문서를 채우는 방향을 기본값으로 둔다.
- 2026-05-26: 검증 결과 Vitest 전체, Next build, room rules smoke는 통과했다. 경매 E2E 전체는 대표 입찰 500ms assertion이 559ms로 1회 실패했고, 해당 테스트 단독 재실행은 통과했다. Firebase rules dry-run은 "Dry run complete!"를 출력했지만 로컬 Firebase credentials/update-check 문제로 exit 1을 반환했다.

## 단일 PC 다중 탭 타이머 표시 보정

- 재현 조건은 하나의 PC에서 주최자와 모든 팀장 브라우저를 동시에 띄운 테스트다. 서로 다른 PC에서 각자 접속했을 때는 문제가 없었으므로 서버 정본 `timer_ends_at` 자체보다 클라이언트 이벤트 처리 지연과 표시 보정 경로를 우선 의심한다.
- 실제 낙찰/종료 시점은 정상이고 표시 숫자만 10초 또는 5초보다 길게 보이는 현상이므로, `recoverExpiredAuction` 예약과 서버 액션의 종료 판정은 건드리지 않는다.
- 최소 수정 범위는 `useAuctionRealtime.ts`의 `timerDurationMs` 변환이다. RTDB live 또는 Firestore fallback 이벤트를 늦게 처리한 탭이 `Date.now() + timerDurationMs`로 서버 `timerEndsAt`보다 미래 값을 만들지 못하게 제한한다.
- 구현은 `resolveTimerEndsAtFromDuration()` 헬퍼로 제한했다. `timerDurationMs` 보정은 유지하되 이벤트에 서버 `timerEndsAt`이 있으면 그보다 늦은 표시용 종료 시각을 만들지 않는다.
- 회귀 테스트는 RTDB live 이벤트와 Firestore fallback 이벤트가 지연 처리되어도 서버 `timerEndsAt`을 넘지 않는 케이스를 추가했다. `npx vitest run __tests__/useAuctionRealtime.test.tsx` 통과를 확인했다.

## 입찰 타이머 8초 연장 기준 전환

- 사용자 요청은 경매 시작 시간은 10초로 유지하고, 입찰 시 타이머 갱신 가능 시간과 갱신 시간을 기존 5초 기준에서 8초 기준으로 바꾸는 것이다.
- 실제 경매의 연장 기준은 `src/features/auction/constants/auctionTimings.ts`의 `EXTEND_THRESHOLD_MS`, `EXTEND_DURATION_MS`를 서버 액션, direct bid, 낙관 UI, E2E fixture가 공유한다.
- direct bid는 Firestore Rules의 `isValidDirectBidTimerUpdate()`가 최종 검증하므로, 상수 변경과 함께 rules의 남은 시간 기준과 새 종료 시각 허용 범위도 8초 기준으로 맞춰야 한다.
- 재경매 시작 시간 `RE_AUCTION_DURATION_MS`는 별도 정책이므로 이번 요청에서는 5초 유지한다.
- 서버 액션 fallback과 E2E fixture도 direct bid와 동일하게 남은 시간 `<= 8초`일 때 연장하도록 맞췄다. 이전에는 일부 경로가 `< 5초`였으나 이번 변경에서는 경계값 동작을 통일한다.
- 타이머 랩은 운영 경매와 같은 입찰 연장 실험 도구이므로 `src/features/timer-lab/actions.ts`와 화면 문구도 8초 기준으로 갱신했다.
- 검증은 `npx vitest run __tests__/auctionActions.test.ts __tests__/useBiddingControl.test.tsx __tests__/useAuctionRealtime.test.tsx`, `npm run smoke:room-rules`, `npm run build`를 실행해 통과했다.

- 공개 입찰 기능은 기존 계약을 유지한다. `active_bid`, `BID_PLACED`, `placeBidDirect`, 공개 입찰 `placeBid`, 공개 입찰 `awardPlayer` 기본 동작은 수정하지 않고, `auction_mode === "SEALED_BID"`일 때만 별도 경로를 탄다.
- 비공개 입찰 제출 금액과 제출 여부는 타이머 중 주최자와 다른 팀장에게 노출하지 않는다. 클라이언트 전체 구독 컬렉션에 제출 문서를 그대로 추가하지 않고 서버 액션에서 집계한다.
- 점수공개 시점에는 공개 결과만 확정한다. 선수 SOLD 처리와 팀 포인트 차감은 카드 애니메이션 완료 후 호출되는 별도 확정 액션에서 수행한다.
- 최고가 동점이면 같은 선수에 대해 동점 팀만 재입찰한다. 재입찰 최소 금액은 직전 최고 동점 금액이며 재입찰 횟수 제한은 두지 않는다.
- `startAuction()`은 `auction_mode === "SEALED_BID"`일 때 `startSealedBidRound()`로 분기한다. 공개 입찰의 기존 시작/입찰/낙찰 함수 본문은 공개 방식에서 그대로 유지한다.
- 비공개 제출은 RTDB 이벤트를 발행하지 않는다. 이벤트는 시작, 잠금, 점수공개, 확정, 재입찰 시작 단계에만 발행한다.
- `useAuctionControl()`의 공개 입찰 자동 낙찰 타이머는 비공개 입찰 방에서 실행되지 않도록 차단했다. 비공개 방의 만료는 `lockSealedBidRound()`와 `recoverExpiredAuction()`의 mode 분기가 담당한다.
- 검증 중 `npm run test` 전체 실행은 기존 공개 입찰 컨트롤 기대값 1건과 LotteryAnimation 텍스트 매칭 3건에서 실패했다. 이번 변경 파일이 아닌 `useBiddingControl.ts`와 `LotteryAnimation.tsx` 동작/테스트의 기존 불일치로 보이며, 관련 변경 범위의 `auctionRealtimeUtils`, `auctionActions`, `useAuctionControl` 테스트는 통과했다.
- 비공개 입찰 제출 문서는 Firestore rules에서 클라이언트 직접 read/write를 모두 차단한다. 제출과 집계는 Admin SDK Server Action만 담당한다.
- 방 생성 직후 주최자 입장에서는 RTDB presence write와 서버 draw 검증 사이의 전파 지연이 발생할 수 있다. 클라이언트 store에는 자기 presence를 snapshot과 병합하고, 서버 draw 검증은 짧은 재시도로 RTDB 전파 지연을 흡수한다.

## 팀장 탭 엑셀 업로드

- 사용자 요청은 방 생성 모달의 `팀장 등록` 탭에서도 엑셀 업로드 버튼을 표시하는 것이다. 현재 엑셀 업로드 파서는 `useCreateRoom.handleExcelUpload()` 하나이며 선수 목록을 덮어쓰는 용도로만 구현되어 있다.
- 1차 구현은 버튼 노출과 동일 파서 호출 연결로 제한한다. 팀장 데이터 자동 매핑은 제공 엑셀 구조를 확인한 뒤 별도 판단이 필요하다.
- 제공 파일 `철인3종 명단.xlsx`는 `Sheet1` 하나, 범위 `A1:O145`, 실제 닉네임이 있는 데이터 48행으로 확인했다. 헤더는 타임스탬프, 본인 이름, 롤닉네임#태그, 소환사의 협곡, 희망 라인 주/부라인, 무작위 총력전, 전략적 팀 전투, 팀장에게 하고 싶은 말 순서다.
- 기존 파서는 `롤닉네임#태그`는 닉네임으로 인식하지만, `소환사의 협곡` 티어명, 직접 입력된 주/부라인, `팀장에게 하고 싶은 말` 설명 컬럼은 인식하지 못했다. 이번 변경으로 해당 헤더를 선수 업로드에 반영하도록 보정했다.
- 팀장 등록 단계는 액션 버튼들이 헤더 row의 직접 자식으로 배치되어 팀원 등록 단계의 버튼 그룹 간격과 달랐다. 두 단계 모두 액션 버튼을 내부 `flex items-center gap-2` 그룹으로 묶어 동일한 간격을 쓰도록 맞춘다.
- 엑셀 파일의 실제 팀장 표시는 `롤닉네임#태그` 또는 `본인 이름`이 아니라 `팀장에게 하고 싶은 말` 컬럼 10행의 `팀장` 값으로 확인된다. 사용자 요청의 이름 칸 `팀장` 포함도 지원하되, 제공 파일을 살리기 위해 팀장 표시 컬럼도 팀장 행 판정에 포함한다.
- 비공개 입찰 이벤트용 추가 정보는 기존 `tier`를 소환사의 협곡 메인 티어로 유지하고, `무작위 총력전` 포함 헤더는 `aram_tier`, `전략적 팀 전투` 헤더는 `tft_tier`로 저장한다. 공개 입찰 UI에는 노출하지 않고 비공개 입찰 추첨 결과에서만 표시한다.
- 비공개 입찰 진행 중의 입찰 대상 정보 카드는 `SealedBidBoard`가 담당한다. 저장한 추가 티어 정보는 추첨 완료 후 이 카드에도 함께 보여야 한다.
- 비공개 입찰 시스템 채팅은 메시지 문자열의 선행 이모지를 `ChatPanel.getSystemMessageVisual()`에서 아이콘으로 치환한다. 시작/재입찰/마감은 `🔒`, 점수공개는 `🃏` 선행 문자열을 기준으로 별도 SVG 아이콘을 적용한다.
- 엑셀의 `팀장에게 하고 싶은 말` 헤더는 `useCreateRoom`에서 선수 `description`으로 저장된다. 비공개 입찰 진행 중에는 `SealedBidBoard`의 입찰 대상 카드가 이 값을 `한마디`로 표시한다.
- 엑셀 업로드에서 `닉네임` 열이 없고 `이름` 포함 헤더만 있는 파일은 해당 이름 열을 선수명 fallback으로 사용한다. 팀장 행 판정은 `이름` 포함 헤더 열의 값에 `팀장`이 포함되는 경우로 제한한다.
- 엑셀의 `소환사의 협곡` 헤더는 팀원 `tier`와 팀장 `leader_tier`의 원천 데이터로 사용한다. 티어 값은 정규화하지 않고 엑셀 셀 값을 그대로 저장한다.
- 엑셀의 `무작위 총력전`, `전략적 팀 전투` 헤더 값은 팀원 `aram_tier`, `tft_tier`로 저장하고 공개 입찰 선수 정보 카드와 비공개 입찰 대상 카드에 표시한다.
- 추첨 시작 전 참여 인원 검증은 RTDB `presence/{roomId}`를 Admin SDK로 읽는다. `room:{roomId}:ORGANIZER:none` 세션 키가 존재해도 값의 `role` 필드가 없으면 기존 로직은 주최자 0명으로 계산했기 때문에, 정식 `role` 값이 없을 때만 세션 키의 역할 부분을 보조 판정한다.
- 추첨 애니메이션의 티어 이미지는 `getTierImage()` 공통 유틸을 사용한다. 엑셀 원본값에 `플레티넘` 오타가 들어올 수 있으므로 이미지 매핑에서는 `플래티넘`과 동일하게 `Rank=Platinum.png`를 사용한다.
- 추첨 시작 전 검증에서 주최자 presence는 차단 조건으로 사용하지 않는다. 주최자 접속 여부는 Firebase Auth와 RTDB presence 동기화에 영향을 받기 쉬우므로, 추첨 차단은 최소 2명의 팀장 presence만 확인한다.
- 주최자 권한 검증은 `presence`가 아니라 서버가 읽는 `room_auth_{roomId}_ORGANIZER` 쿠키와 `room_auth_secrets/{roomId}.organizer_token` 비교로 처리한다. 이 헬퍼는 추첨, 경매 시작, 추첨 닫기, 일시정지/재개, 공개 낙찰 확정, 비공개 입찰 잠금/점수 공개/확정, 드래프트, 재경매, 결과 저장, 방 삭제에 적용한다.
- 비공개 입찰 대상 정보 카드는 각 티어/소개 정보를 한 줄 row로 표시한다. 소환사의 협곡과 전략적 팀 전투는 정확히 매칭되는 티어만 이미지로 표시하고, `마스터 이상`, `실버 이하`, 임의 텍스트 값은 텍스트로 유지한다. 무작위 총력전 값은 항상 텍스트로 표시한다.
- 비공개 입찰 대상 정보 카드의 각 row는 박스 내부에서 타이틀을 상단에, 값과 티어 이미지를 하단에 배치한다.
- 비공개 입찰 대상 정보 카드의 티어 3종은 데스크톱에서 한 줄 3열로 표시하고, 한마디는 그 하단에 별도 박스로 표시한다.
- 비공개 입찰 대상 정보 카드의 무작위 총력전 값은 말줄임을 쓰지 않고 줄바꿈을 허용한다. 텍스트 길이가 길수록 폰트 크기를 낮춰 박스 안에 최대한 표시한다.
- 비공개 입찰 제출 완료 후 점수 카드는 `LOCKED` 상태에서는 모든 팀 카드가 동일한 뒷면만 보여야 한다. 팀명, 점수, 포기 여부, 최고가 여부는 `REVEALING` 애니메이션으로 앞면이 열린 뒤에만 노출한다.
- 팀장 닉네임의 `#` 뒤 문자열은 라이엇 태그로 보고 표시명에서는 제거한다. 과거 저장 데이터 표시를 위해 공통 표시 유틸에서 제거하고, 새 엑셀 업로드로 팀장 기본값을 만들 때도 같은 표시명을 사용한다.
- 점수 공개 애니메이션 중에는 서버가 계산한 `is_highest`, `is_tied` 값을 UI 강조에 사용하지 않는다. 모든 카드가 공개된 뒤에만 최고점 카드와 재입찰 대상 카드를 강조하고, 그 전에는 팀명과 제출 점수만 기본 톤으로 표시한다.
- 점수 공개 카드 앞면은 `pixel-box` 유틸을 쓰지 않는다. `pixel-box`가 흰 배경과 검은 테두리를 직접 지정하므로, 최고점 카드는 앞면에서 명시 border/background/shadow 클래스로 구성한다. 최고점 강조는 과한 빨간 그림자 대신 기존 카드들과 같은 검은 픽셀 그림자를 유지하고, 은은한 노란 배경과 노란 테두리로만 구분한다.
- 최고점 점수 텍스트는 순수 검정보다 살짝 금색이 섞인 `#2f2600`을 사용한다. 배경과 테두리 강조를 해치지 않으면서 노란 계열 카드와 자연스럽게 연결하기 위한 선택이다.
- 재입찰 라운드는 별도 화면 상태가 아니라 `eligibleTeamIds`가 있는 새 비공개 입찰 라운드로 표현된다. 카드 목록은 `eligibleTeamIds`가 있을 때 해당 팀만 표시하고, 일반 라운드처럼 전체 팀 또는 비참여 팀의 빈/불가 카드를 섞지 않는다.
- 모달 외부 클릭 닫힘은 `click` 이벤트 기준으로 처리하지 않는다. 모달 내부에서 누른 뒤 외부에서 mouseup 되면 오버레이 click으로 닫힐 수 있으므로, 오버레이에서 mousedown이 시작되고 mouseup도 오버레이에서 끝난 경우에만 닫는다.
- 팀 로스터 확장은 중앙 경매 보드와 오른쪽 채팅/컨트롤 영역을 밀지 않는다. `RoomClient`의 12컬럼 grid 비율은 유지하고, 주최자/팀장 화면의 좌측 roster 카드만 기존 오른쪽 경계를 고정한 채 왼쪽으로 넓힌다. 넓은 화면에서만 `TeamList` 내부를 2열로 표시한다.
- 넓은 팀 로스터 모드에서는 8팀이 최대한 한 스크롤에 보이도록 카드 padding, 카드 간격, 헤더 여백, 게이지 높이, 선수 row 높이, badge 크기를 한 단계 줄인다. 정보 항목은 숨기지 않고 기존 말줄임 동작은 유지한다.
- 추가 조정으로 넓은 팀 로스터 모드의 `xl` 전용 카드 padding, 선수 row 높이, badge, 보조 폰트를 한 단계 더 줄였다. 관전자와 좁은 화면의 기본 로스터 크기는 변경하지 않는다.
- 팀 로스터 compact 모드에서는 팀원 이름의 `font-black`을 제거하고, 팀명/포인트/badge/티어/완료 리본 텍스트를 추가로 줄여 2x4 목록의 세로 밀도를 높인다.
- 팀 로스터 compact 모드의 전체 텍스트를 다시 한 단계 낮췄다. 팀명/포인트는 9px, 보조 버튼과 팀원명은 8px, 티어/배지/빈 자리/완료 리본은 7px 기준으로 맞춰 2x4 표시 밀도를 더 높인다.
- 방 종료 모달은 닫힌 상태에서 `useOverlayDismiss`를 건너뛰고 열린 상태에서만 호출해 React Hook 순서 오류가 발생했다. `useState` 다음에 항상 `handleClose`와 `useOverlayDismiss`를 구성한 뒤 `isOpen` 조기 반환을 실행하도록 수정한다.

## 홈 업데이트 공지 갱신

- 홈 화면 공지성 업데이트는 `src/content/updateFeed.ts`의 `updateFeedItems`를 기준으로 노출된다. 현재 가장 최신 항목은 2026-04-24 명예의 전당 개편 안내다.
- 2026-04-24 이후 실제 프로젝트 상태는 `progress.md`, `doc/ARCHITECTURE.md`, `doc/AUCTION_REALTIME_CONTRACT.md`, 최근 커밋 로그 기준으로 크게 일정 관리 안정화, 방 인증 토큰 분리와 rules 검증, 비공개 입찰 추가, 타이머 정책 8초 전환, 경매방 UI 안정화가 진행된 상태다.
- 공지 문구는 홈 ticker에 노출되는 짧은 문장이어야 하므로 구현 세부사항보다 사용자와 운영자가 체감할 변경을 우선한다. 단, 보안과 실시간 정합성처럼 운영 안정성에 직접 영향을 주는 변경은 별도 항목으로 남긴다.

## project-describer DESCRIPTION 갱신

- `project-describer` 스킬 입력이 추가로 제공되었으므로 기존 `DESCRIPTION.md`를 그대로 두지 않고 현재 코드베이스 기준으로 갱신한다.
- 기존 설명서에는 방 생성 시 팀 문서에 토큰을 포함한다는 식의 오래된 설명이 남아 있다. 현재는 신규 방의 organizer/viewer/team leader 토큰을 `room_auth_secrets/{roomId}`와 `team_tokens/{teamId}`에 저장하고, public room/team 문서는 legacy fallback만 남긴 구조다.
- 설명서에는 공개 입찰 hot path와 비공개 입찰 경로를 분리해 기록한다. 공개 입찰은 `placeBidDirect()`가 Firestore client transaction을 먼저 사용하고 실패 시 Server Action fallback을 탄다. 비공개 입찰은 제출, 잠금, 공개, 확정 모두 서버 액션 중심이다.
- 문서 목적은 포트폴리오/외부 참조용 상세 설명이므로, 단순 파일 나열보다 Firestore 정본, RTDB fanout, Server Action 경계, 일정 transaction, 명예의 전당 아카이브 연결 같은 설계 이유를 중심으로 작성한다.

## 팀 로스터 compact 재조정

- 대상은 `TeamList`의 `useWideRosterGrid` 분기다. 주최자/팀장 화면의 `xl` 이상 2열 로스터에서만 더 조밀하게 만들고, 관전자와 좁은 화면의 기본 로스터는 변경하지 않는다.
- 이번 조정은 정보 항목을 숨기지 않고 카드 간격, 카드 padding, 선수 row 높이, 헤더 여백, compact 폰트 크기만 낮추는 방식으로 제한한다.
- 작은 가격/팀장 배지는 `group-hover:scale-110`로 커질 때 좁은 row 안에서 겹침 가능성이 있으므로 compact 모드에서는 scale 확대 대신 색상 변화 정도로 유지한다.

## 팀명 편집 input 폭 보정

- `TeamList` 편집 상태는 input, 저장, 취소 버튼이 같은 flex row를 공유한다. compact 로스터에서는 input의 가변 폭이 버튼의 고정 폭보다 먼저 공간을 차지할 수 있으므로 input 래퍼에 `min-w-0`과 `max-w` 제약을 두고 버튼 묶음은 `shrink-0`으로 유지한다.

## 팀 로스터 compact 가독성 조정

- 로스터 전체 표시 요구사항을 유지하기 위해 카드 간격과 padding은 그대로 두고, 글자 가독성에 직접 영향을 주는 팀명/포인트/선수명 크기와 선수명 line-height만 조정한다.
- 선수명은 7px에서 8px로만 올리고 `leading-tight font-semibold`로 바꾼다. 팀명과 포인트는 9px 기준으로 올리되, 티어/가격/팀장 배지/완료 리본은 7px로 유지한다.
- 선수 row와 빈 슬롯 높이는 26px에서 28px로만 올려 텍스트가 눌려 보이지 않게 하되 2열 로스터의 전체 표시 밀도는 크게 되돌리지 않는다.

## 대기 선수 목록 패널

- 클라이언트가 확인하려는 남은 선수 목록은 `Player.status === "WAITING"`인 선수들이다. `RoomClient`가 이미 `bucketAuctionPlayers(players, currentPlayerId)`에서 `waitingPlayers`를 계산하므로 새 구독이나 서버 API를 추가하지 않는다.
- 오른쪽 컬럼에는 기존 유찰 목록과 채팅 사이에 대기 목록 패널을 배치한다. 유찰/대기 목록은 각각 내부 스크롤 패널로 유지하고 채팅은 남은 공간을 차지하게 한다.
- `TeamList.tsx`에 기존 미커밋 변경이 있으므로, 이번 구현은 별도 `WaitingPanel` 파일과 `RoomClient` 배치 수정으로 분리해 기존 변경을 덮어쓰지 않는다.

## 대기 선수 목록 compact grid

- 대기 목록은 남은 선수 확인이 목적이므로 티어와 포지션을 제거하고 닉네임만 표시한다. 오른쪽 컬럼 폭에서 많은 항목을 훑어볼 수 있도록 카드형 row 대신 작은 grid chip을 사용한다.
- grid는 기본 3열, 초광폭에서는 4열까지 늘려 한 줄에 3~4명을 볼 수 있게 한다. 각 chip은 `truncate`로 긴 닉네임이 컬럼을 밀지 않게 한다.

## 대기명단 우측 확장 패널

- 기존 12컬럼 레이아웃과 오른쪽 유찰/로그 컬럼은 유지한다. 대기명단은 오른쪽 컬럼 내부 흐름에서 빼고 `xl` 이상에서 `main`의 오른쪽 바깥에 absolute 패널로 이어 붙인다.
- 대기명단 패널은 `waitingPlayers`를 그대로 사용하고 데이터 계약은 변경하지 않는다. 패널 내부 목록은 한 줄에 한 선수씩 `닉네임 / 티어 / 포지션`으로 표시한다.
- 현재 `RoomClient`, `WaitingPanel`, `TeamList`에 기존 미커밋 변경이 있으므로, 사용자 변경을 보존하고 이번 변경은 필요한 부분에 덧붙인다. 커밋은 기존 미커밋 변경과 분리 가능할 때만 진행한다.
- 이번 변경은 기존 미커밋 변경과 같은 파일에 섞여 있으므로 커밋하지 않고 워킹트리에 둔다.

## 현재 상태 코드 리뷰

- 2026-05-18: 사용자는 현재 프로젝트 상태 파악과 코드 리뷰를 요청했다.
- 2026-05-18: 작업 트리에는 추적되지 않은 `event-miss-analysis.md`, `security-report.md`가 있으며 사용자 산출물로 간주하고 건드리지 않는다.
- 2026-05-18: `/api/room-auth/firebase-token`은 문서와 달리 room cookie 또는 역할 토큰 검증 없이 요청 본문만으로 Firebase custom token을 발급한다.
- 2026-05-18: `placeBid`, `submitSealedBid`, `broadcastBidEvent`, `sendNotice` 서버 액션에는 호출자 권한 검증이 없거나 부족하다.
- 2026-05-18: `npm run lint`는 38 errors, 24 warnings로 실패했고, `npm run test`는 2개 테스트 실패 상태다.

## 최소 보안선 구현 계획

- 2026-05-19: 사용자 요청에 따라 소규모 링크 공유 운영 모델을 유지하는 최소 권장 범위와 구현 계획을 `minimal-security-implementation-plan.md`로 분리해 작성했다.
- 2026-05-19: 최종 권장 범위는 custom token 발급 전 역할 token 대조, 공개 입찰 fallback leader token 대조, 비공개 입찰 제출 leader token 대조, 공지 organizer token 대조, `broadcastBidEvent` canonical room state 재검산이다.
- 2026-05-19: Firestore rules는 완화하지 않는 쪽을 계획의 기본값으로 둔다. direct bid rules는 보안이라기보다 경매 정합성 검증이므로 유지 대상이다.

## 최소 보안선 구현

- 2026-05-19: `roomAuthToken`을 store에 추가하고, 방 입장 URL의 `token` 또는 `authToken`을 room context와 Firebase custom token 요청에 전달하도록 수정했다.
- 2026-05-19: 팀장 링크 생성 경로에 leader token을 포함했다. 주최자 링크 모달의 `/api/room-links`는 organizer token 검증 후 private team token을 반환한다.
- 2026-05-19: `requireRoomLeader`와 `requireRoomViewer` 서버 헬퍼를 추가했다. 신규 private token 문서를 우선하고 legacy public token fallback을 유지한다.
- 2026-05-19: `placeBid`, `submitSealedBid`, `sendNotice`, `broadcastBidEvent`에 최소 권한 검증을 추가했다.
- 2026-05-19: `broadcastBidEvent`는 클라이언트가 보낸 revision과 timer 값을 그대로 쓰지 않고, room canonical `active_bid`, `auction_revision`, team name을 재조회해 일치할 때만 발행한다.
- 2026-05-19: 검증 결과 `npm run build`, `npx tsc --noEmit`, 핵심 Vitest 7개 파일, `npm run smoke:room-rules`는 통과했다. `npm run test` 전체는 기존 `useAuctionControl`, `LotteryAnimation` 2건 실패가 남아 있다.

## 기존 테스트 실패 2건 정리

- 2026-05-19: `useAuctionControl`의 기존 실패 테스트는 `lotteryPlayer`가 `null`인 상태에서 `IN_AUCTION` snapshot만으로 추첨 모달을 다시 열리길 기대한다. 현재 구현과 `auctionRealtime` 계약은 `LOTTERY_CLOSED`, `AUCTION_STARTED`, `AUCTION_RESUMED` 이후 stale lottery player를 null로 유지하는 쪽이므로 테스트 기대값을 그 계약에 맞춘다.
- 2026-05-19: `LotteryAnimation`은 무작위 총력전 라벨을 `무작위 총력전 : 아수라장`으로 표시한다. 테스트는 exact text로 `무작위 총력전`만 찾고 있어 현재 화면 문구와 맞지 않으므로 부분 매칭으로 바꾼다.
- 2026-05-19: 대상 검증 `npx vitest run src/features/auction/hooks/useAuctionControl.test.ts __tests__/LotteryAnimation.test.tsx`는 10개 테스트 통과, 전체 검증 `npm run test`는 27개 파일 192개 테스트 통과 상태다.

## 명예의 전당과 일정 관리 코드 리뷰

- 2026-05-19: 사용자 요청은 구현 변경이 아니라 명예의 전당과 일정 관리 기능의 정밀 코드 리뷰 및 안정성 검사다. 기능 파일 수정 없이 실제 라우트, 서버 액션, 컴포넌트, 테스트를 읽고 리스크를 심각도 순으로 보고한다.
- 2026-05-19: 작업 트리에는 기존 추적되지 않은 `event-miss-analysis.md`, `security-report.md`가 있으며 이번 리뷰와 무관한 사용자 산출물로 간주한다.
- 2026-05-19: 명예의 전당 수동 등록은 `registerHallOfFameEntry()`가 클라이언트 payload를 그대로 저장하고 `.add()`를 사용한다. 서버가 archive와 team을 재조회하지 않고 중복 방지도 transaction/document id로 보장하지 않는다.
- 2026-05-19: 일정 저장은 관리자 코드를 요구하지만 `saveLeagueScheduleDay()`가 팀 이름을 roster source와 대조하지 않고, schedule 시작/종료 날짜 범위도 서버에서 확인하지 않는다. `LeagueScheduleManager`는 일정 전환 시 기존 `selectedDateKey`를 유지할 수 있어 잘못된 날짜 저장 위험이 더 커진다.
- 2026-05-19: 검증은 `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts src/features/schedules/api/__tests__/scheduleActions.test.ts src/features/schedules/utils/leagueRecords.test.ts src/features/schedules/utils/leagueNextMatches.test.ts src/features/schedules/utils/leagueMatchTime.test.ts src/features/schedules/utils/leagueMatchRules.test.ts __tests__/ScheduleMatchDayEditor.test.tsx`와 `npm run build`가 통과했다.

## 명예의 전당과 일정 관리 안정화 전제

- 2026-05-19: 리뷰 결과를 바탕으로 `schedule-hof-stability-premises.md`를 작성한다. 문서는 구현 계획보다 앞선 전제로서 공개 읽기 경로 유지, 서버 액션 권위성, 클라이언트 payload 불신, roster/date 검증, 결정적 명예의 전당 문서 id, 최소 테스트 범위를 정의한다.
- 2026-05-19: 이번 문서 작업은 기능 파일을 수정하지 않는다. 기존 미추적 `event-miss-analysis.md`, `security-report.md`와 수정된 `DESCRIPTION.md`는 사용자 작업으로 간주하고 건드리지 않는다.

## 명예의 전당과 일정 관리 안정화 구현 계획

- 2026-05-19: `schedule-hof-stability-premises.md`를 기준으로 `schedule-hof-stability-implementation-plan.md`를 작성한다. 구현 순서는 명예의 전당 서버 권위성, 일정 서버 검증, 일정 전환 UI 상태, fixture/E2E 유지 순으로 둔다.
- 2026-05-19: 계획서의 기본 결정은 명예의 전당 수동 등록 문서 id를 `archive:{archiveId}`로 쓰고, 기존 `.add()` 문서는 조회와 제외 목록에서 계속 인정하는 것이다. 일정 저장은 date range와 roster team 검증을 서버에서 수행한다.

## 명예의 전당과 일정 관리 안정화 구현

- 2026-05-19: `registerHallOfFameEntry()`는 클라이언트가 보낸 room id, won at, 선수 목록을 저장하지 않고 `auction_archives/{archiveId}`를 transaction 안에서 재조회해 `hall_of_fame/archive:{archiveId}`에 저장한다. 기존 `.add()` 기반 문서는 조회와 archive 제외 목록에서 계속 인정한다.
- 2026-05-19: 명예의 전당 archive 제외 목록의 200개 제한을 제거했다. 수동 등록 중복은 deterministic id 존재 여부로 막는다.
- 2026-05-19: `saveLeagueScheduleDay()`는 저장 전 schedule을 로드해 date key가 `startsAt`과 `endsAt` 범위 안인지 확인하고, roster source에서 복원된 팀만 저장하도록 검증한다. 같은 날짜 payload 안 중복 팀 배정도 거부한다.
- 2026-05-19: `e2eScheduleFixture`도 운영 경로와 같은 date range, roster team, 같은 팀/중복 배정 검증을 적용한다.
- 2026-05-19: `LeagueScheduleManager`는 timeline이 바뀌면 첫 match day 또는 schedule 시작일로 `selectedDateKey`를 재설정한다. 다른 일정에서 선택한 날짜가 새 일정 저장 payload로 새는 문제를 막는다.
- 2026-05-19: 검증 결과 대상 Vitest 8개 파일 45개 테스트, `npm run build`, `npx playwright test playwright/league-schedule.spec.ts`가 통과했다.

## 명예의 전당과 일정 관리 안정화 후속 분석

- 2026-05-19: 현재 구현 기준 주요 안정성 리스크는 대부분 닫혔다. 남은 최소 필수 개선은 기존 `.add()` 기반 hall of fame 문서가 같은 `archive_id`를 이미 가진 경우에도 직접 `registerHallOfFameEntry()` 호출로 `archive:{archiveId}` 문서가 새로 생길 수 있는 호환성 중복 경계다.
- 2026-05-19: 후속 분석은 `schedule-hof-post-stability-analysis.md`로 작성한다. 필수 후속 전제는 UI 제외 목록뿐 아니라 서버 액션 자체가 legacy 문서와 deterministic 문서 모두를 같은 archive id 기준으로 중복 거부하는 것이다.

## 명예의 전당 legacy 중복 방지 구현 계획

- 2026-05-19: 후속 분석에서 남은 최소 필수 개선을 `schedule-hof-legacy-duplicate-implementation-plan.md`로 분리한다. 구현 범위는 `registerHallOfFameEntry()`의 같은 `archive_id` legacy 문서 중복 검사와 해당 Vitest 보강으로 제한한다.
- 2026-05-19: 계획상 구현은 `hall_of_fame.where('archive_id', '==', archiveId).limit(1).get()` 기반 중복 검사와 기존 deterministic transaction 중복 검사를 함께 사용한다. 별도 unique index 컬렉션은 이번 최소 범위에서 제외한다.

## 명예의 전당 legacy 중복 방지 구현

- 2026-05-19: `registerHallOfFameEntry()`에 `hasHallOfFameEntryForArchive()`를 추가해 deterministic id 문서뿐 아니라 같은 `archive_id`를 가진 legacy random id 문서도 중복으로 거부한다.
- 2026-05-19: hall of fame 액션 테스트 더블에 `where('archive_id', '==', archiveId).limit(1).get()` 흐름을 추가하고, legacy random id 문서가 있을 때 `archive:{archiveId}` 새 문서가 생성되지 않는 테스트를 추가했다.
- 2026-05-19: 검증 결과 `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts`, 통합 `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts src/features/schedules/api/__tests__/scheduleActions.test.ts __tests__/LeagueScheduleManager.test.tsx`, `npm run build`가 통과했다.

## 다수 PC 재현 테스트 환경 구성

- 2026-05-20: 목표는 한 로컬 PC에서 organizer, 두 leader, viewer를 서로 다른 브라우저 컨텍스트로 분리해 다수 PC 경매 상황을 자동 재현하는 것이다.
- 2026-05-20: 기존 `auction-realtime.spec.ts`와 fixture API가 이미 다중 컨텍스트, 독립 쿠키, 경매 fanout 검증을 지원하므로 데이터 계약이나 fixture shape는 변경하지 않는다.
- 2026-05-20: 구성 범위는 대표 다중 클라이언트 smoke spec, 실행 npm script, LAN 수동 접속 문서로 제한한다. Firebase rules나 실시간 이벤트 필드명은 변경하지 않는다.
- 2026-05-20: 검증 결과 `npm run test:e2e:multi-pc`가 통과했다. 첫 sandbox 실행은 `spawn EPERM`으로 실패했고 승인 후 sandbox 밖 실행에서 1개 테스트가 통과했다.

## 경매 E2E 실패 3건 정리

- 2026-05-20: `auction-realtime.spec.ts` 실패 3건은 `active-auction` fixture 타이머가 18초로 시작해 12초 안에 2.5초 이하가 될 수 없는 문제, `active-auction-expiring` fixture가 7초로 시작해 5초 유찰 기대와 맞지 않는 문제, `sendNotice()`가 fixture 분기 전에 Firestore organizer auth를 먼저 실행하는 문제로 분리된다.
- 2026-05-20: 수정 범위는 E2E fixture 초기 타이머와 fixture 전용 공지 전송 분기로 제한한다. 운영 타이밍 상수, RTDB event envelope, room canonical state 계약은 변경하지 않는다.
- 2026-05-20: `active-auction` fixture는 8초, `active-auction-expiring` fixture는 1.5초 남은 상태로 시작하도록 조정했다. `sendNotice()`는 fixture 환경에서 fixture 저장소로 먼저 분기하고, 운영 환경에서는 기존 organizer auth를 유지한다.
- 2026-05-20: 검증 결과 실패 3개만 재실행한 `npx playwright test playwright/auction-realtime.spec.ts --project=chromium -g "extends timer|marks the player unsold|syncs organizer notice"`가 통과했고, 전체 `npm run test:e2e:auction`도 14개 테스트 통과했다.

## 8팀장 직접 확인 테스트 계획

- 2026-05-20: 사용자는 예전에 발생한 "주최자 + 8팀장 경매에서 특정 팀장에게 입찰 권한이 부여되지 않음" 문제를 직접 화면으로 확인할 수 있는 테스트 진행안을 요청했다.
- 2026-05-20: 현재 `createRoom()`은 E2E fixture mode에서 전달된 captains 수만큼 팀과 leader token을 생성하므로, 8팀 테스트는 기존 fixture 생성 경로를 활용하는 것이 최소 변경이다.
- 2026-05-20: 전제 문서는 `eight-leader-visual-test-premises.md`, 구현 계획서는 `eight-leader-visual-test-implementation-plan.md`로 작성했다. Firebase Emulator 도입은 실제 Firebase 경계에서만 재현되는 문제가 확인된 뒤 후속 작업으로 분리한다.

## 8팀장 직접 확인 테스트 구현

- 2026-05-20: `POST /api/e2e/auction-fixture/create` route를 추가해 E2E fixture mode에서 임의 captains payload로 방과 8개 leader link를 생성할 수 있게 했다.
- 2026-05-20: `playwright/auction-eight-leaders-visual.spec.ts`는 organizer 1개와 leader 8개를 독립 browser context로 열고, 경매 시작 직후 모든 leader의 `입찰하기` 버튼과 number input 상태를 진단한다.
- 2026-05-20: `E2E_VISUAL_PAUSE=1`이면 검증 직후 `page.pause()`로 멈춰 사용자가 9개 화면을 직접 볼 수 있게 한다. 자동 실행은 경매 시작 직후 8팀장 모두의 입찰 버튼과 number input이 활성화되는지 확인하는 범위로 제한한다.
- 2026-05-20: 검증 결과 `npm run test:e2e:auction:8leaders`, `npm run test:e2e:multi-pc`, `npm run test:e2e:auction`이 통과했다. 전체 경매 E2E 첫 실행에서는 500ms 레이턴시 테스트가 529ms로 1회 실패했으나, 단독 재실행과 전체 재실행 모두 통과했다.

## 8팀장 visual 테스트 체감 개선

- 2026-05-20: 사용자가 headed 실행에서 모든 화면에 컴파일/렌더링 알림이 표시되고 타이머가 4분대부터 시작한다고 보고했다.
- 2026-05-20: 원인은 `test:e2e:auction:8leaders:headed`가 Playwright 기본 dev server를 사용해 9개 페이지에서 Turbopack dev overlay가 보이는 점, 그리고 테스트가 수동 확인 시간을 확보하려고 `durationMs: 300_000`으로 경매를 시작한 점이다.
- 2026-05-20: 수정 방향은 기존 `test:e2e:auction`처럼 production build/start 서버에서 visual 테스트를 실행하고, 페이지가 모두 로드된 뒤 60초 타이머로 경매를 시작하는 것이다.
- 2026-05-20: `scripts/run_auction_8leaders_visual.js`를 추가해 8팀장 visual 테스트를 `next build`와 `next start` 기반으로 실행하도록 변경했다. production 서버에서는 9개 화면의 fixture polling 중 command API를 호출하면 연결이 끊길 수 있어, fixture 경매 상태는 화면을 열기 전에 60초 타이머로 준비한다.
- 2026-05-20: 검증 결과 `npm run test:e2e:auction:8leaders`와 `npm run test:e2e:multi-pc`가 통과했다. 8팀장 테스트는 production runner에서 컴파일 오버레이 없이 실행되며, 타이머는 60초로 시작한다.

## Firebase 통합 환경 테스트 전제조건

- 2026-05-20: 사용자는 fixture가 아니라 Firebase까지 포함한 통합 환경 테스트가 필요하다고 요청했다.
- 2026-05-20: 현재 `src/lib/firebase.ts`에는 client SDK emulator 연결이 없고, `src/lib/firebaseAdmin.ts`는 `E2E_SCHEDULE_FIXTURE=1`이면 Admin 초기화를 스킵한다. 따라서 통합 테스트는 fixture runner와 별도 실행 경로가 필요하다.
- 2026-05-20: `firebase-integration-test-prerequisites.md`에 Emulator Suite 기반 1차 통합 테스트 전제, 운영 Firebase 수동 검증 전제, 성공 기준, 비범위, 구현 순서를 정리했다.

## Firebase 통합 환경 테스트 구현 계획

- 2026-05-20: 전제조건 문서를 바탕으로 `firebase-integration-test-implementation-plan.md`를 작성했다.
- 2026-05-20: 계획은 emulator 연결 기반, production runner, Firebase 통합 helper route, 8팀장 emulator Playwright spec, 진단 첨부, 문서화 순서로 나눴다.
- 2026-05-20: 핵심 결정은 fixture 플래그를 끄고 `USE_FIREBASE_EMULATOR=1`과 `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1`로 실제 Firebase SDK 경로를 emulator에 연결하는 것이다.

## Firebase 통합 환경 테스트 구현

- 2026-05-20: `firebase.json`에 Firestore, Realtime Database, Auth Emulator 포트를 고정했다. 테스트 runner는 운영 Firebase 환경 변수 대신 `minionsbid-e2e` 프로젝트와 임시 RSA private key를 주입해 Admin custom token 발급도 emulator 경로에서 수행한다.
- 2026-05-20: client SDK는 `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1`일 때 Firestore, Auth, RTDB emulator에 연결한다. Firebase Auth custom token sign-in 뒤에는 emulator 통합 테스트 진단을 위해 `window.__roomAuthDebug__`에 uid와 claim을 남긴다.
- 2026-05-20: Firebase 통합 helper route는 emulator 플래그가 켜진 경우에만 활성화한다. 방 생성, 첫 라운드 시작, 상태 조회, cleanup을 분리해 Playwright가 실제 Firestore와 RTDB 상태를 검증할 수 있게 했다.
- 2026-05-20: `playwright/auction-eight-leaders-emulator.spec.ts`는 주최자 1명과 팀장 8명을 독립 browser context로 열고, custom token claim, RTDB leader presence 8명, 모든 팀장 입찰 버튼 활성화, Firestore bid 8건 누적을 확인한다.
- 2026-05-20: Windows에서 Node가 `firebase.cmd`를 직접 spawn하면 `EINVAL`이 발생해 runner를 `cmd.exe /d /s /c firebase.cmd` 실행으로 변경했다. 임시 RSA private key는 Windows env 호환을 위해 `\n` 이스케이프 문자열로 주입한다.
- 2026-05-20: 현재 로컬 환경에는 Java가 PATH에 없어 Firebase Emulator Suite가 기동되지 않는다. runner는 `java -version` 사전 점검으로 이 조건을 명확히 실패 처리한다. `npm run build`, `npm run test:e2e:auction:8leaders`, `npm run test:e2e:multi-pc`는 통과했다.

## Firebase 통합 E2E 첫 실행 실패 정리

- 2026-05-21: 사용자 로컬 실행에서는 Java 설치 후 emulator가 기동됐지만, 방 화면에서 생성된 방 이름을 찾지 못해 실패했다. 현재 저장소에는 Playwright error context는 없고 `firebase-debug.log`, `firestore-debug.log`, `database-debug.log`가 남아 있다.
- 2026-05-21: 현재 Codex 세션의 PATH에는 `java`가 없지만 `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`이고, Adoptium JDK도 `C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot\bin\java.exe`에 설치되어 있다. runner가 `JAVA_HOME\bin`을 PATH에 보강하면 새 세션 없이도 emulator를 실행할 수 있다.
- 2026-05-21: Java 경로 문제는 runner에서 Adoptium JDK bin을 PATH 앞에 보강하는 방식으로 정리했다. Codex sandbox에서는 Java pipe spawn이 `EPERM`으로 막히므로 Firebase Emulator 검증은 sandbox 밖 일반 로컬 권한으로 실행했다.
- 2026-05-21: 방 이름 미렌더링 원인은 room 데이터가 없는 것이 아니라 CSP였다. production CSP가 `http://127.0.0.1:8080`, `ws://127.0.0.1:9000`, RTDB long-polling script를 막아 모든 클라이언트가 `ERROR: ROOM NOT FOUND`로 떨어졌다.
- 2026-05-21: `src/proxy.ts`는 emulator 플래그가 켜진 경우에만 Firestore, RTDB, Auth localhost 포트를 `connect-src`에 추가하고, RTDB long-polling용 `script-src`와 Firestore clear-dot용 `img-src`를 최소 허용한다. 운영 Firebase CSP는 유지한다.
- 2026-05-21: 검증 결과 `npm run test:e2e:auction:8leaders:emulator`, `npm run test:e2e:auction:8leaders`, `npm run test:e2e:multi-pc`, `npm run build`가 통과했다. emulator runner 종료 후 8080, 9000, 9099 LISTENING 프로세스가 남지 않는 것도 확인했다.

## Firebase 통합 E2E headed 입찰 안정화

- 2026-05-21: 사용자 headed 실행에서 마지막 입찰 단계가 `최고 입찰 유지 중` 버튼 라벨을 기다리다 실패했다. 같은 명령이 통과하는 경우도 있어 앱 기능의 고정 실패가 아니라 테스트가 UI 라벨과 클라이언트 동기화 타이밍에 과하게 의존한 문제로 판단했다.
- 2026-05-21: 라벨 대기는 제거하고, 각 입찰 전에 `/api/e2e/firebase-auction/state`로 Firestore 정본 `activeBid.amount`를 읽은 뒤 `+10` 금액을 명시적으로 입력하도록 변경했다. 실제 성공 판정은 Firestore bid count, active bid team, active bid amount로 한다.
- 2026-05-21: 검증 결과 `npm run test:e2e:auction:8leaders:emulator:headed`, `npm run test:e2e:auction:8leaders:emulator`, `npm run build`가 통과했다.

## 미니언즈 철인 3종 경기 아카이브 생성

- 2026-05-26: 사용자가 이미지의 팀 구성표를 기반으로 종료된 경매 결과를 `auction_archives`에 생성해 달라고 요청했다. 경매 이름은 `미니언즈 철인 3종 경기`, 진행 시즌은 `26년도 상반기 이벤트`다.
- 2026-05-26: 기존 `scripts/seed_archive_from_json.js`는 `auctionArchiveDraft` JSON을 받아 `auction_archives/{archive_id}`에 merge 저장한다. 운영 데이터 스크립트가 이미 있으므로 새 Firestore 쓰기 로직은 만들지 않는다.
- 2026-05-26: 현재 아카이브 문서에는 별도 `season_name` 필드가 없고 일정/명예의 전당 흐름은 `room_name`, `schedule_name`, `linked_league_name`을 사용한다. 이번 데이터는 `room_name`에 경매 이름, `schedule_name`과 `linked_league_name`에 시즌명을 저장한다.
- 2026-05-26: 이미지에는 티어, 포지션, 낙찰가가 없으므로 각 선수의 `tier`, `main_position`, `sub_position`은 빈 문자열, `sold_price`는 `null`로 둔다.
- 2026-05-26: `node scripts\seed_archive_from_json.js scripts\minions_triathlon_2026_h1_archive.json --dry-run` 결과 `archiveId=minions-triathlon-2026-h1-event`, 8팀, 32명으로 검증됐다.
- 2026-05-26: 첫 실제 저장 시도는 sandbox proxy `127.0.0.1:9` 연결 실패로 timeout 됐다. 사용자 승인 후 sandbox 밖에서 같은 명령을 재실행했고 `auction_archives/minions-triathlon-2026-h1-event` 저장이 성공했다.

## 문서화된 운영 결정 반영

- 2026-06-01: `/league-schedule`는 단일 라우트로 유지하고 public/admin 분리는 현재 범위에서 제외한다. `match_days.matches[]`도 유지해 경기 단위 문서 분해를 하지 않는다.
- 2026-06-01: room read rules는 현상 유지로 두고, token 분리와 write 보호로 현재 링크 공유 모델을 지킨다.
- 2026-06-01: 경매는 organizer와 모든 팀장이 연결된 상태에서만 진행한다. watchdog는 핵심 경매 상태를 자동 진행하지 않으며, 참가자 부재 상태에서는 입찰이나 타이머를 대신 밀어주지 않는다.
- 2026-06-01: 운영 latency 관측의 우선순위는 direct bid `eventId` marker 연쇄다. p95 관점에서 direct bid의 응답과 marker를 연결해 추적할 수 있게 문서를 맞췄다.

## 방 생성 후 Firebase presence auth 500 점검

- 2026-06-16: 사용자는 방 생성 뒤 브라우저 콘솔에 `[presence] anonymous auth failed Error: Firebase auth token request failed: 500`가 표시된다고 보고했다.
- 2026-06-16: 클라이언트 오류는 `usePresence.ts`가 `ensureRoomFirebaseAuth()`를 호출하고, `src/lib/firebase.ts`가 `POST /api/room-auth/firebase-token`의 비정상 응답을 `Firebase auth token request failed: 500`으로 throw하는 경로다.
- 2026-06-16: 서버 route handler는 입력 검증과 room token 검증 뒤 `getAuth().createCustomToken()`을 직접 호출한다. 현재 예외 처리 경계가 없어 Firebase Admin 미초기화, credential 오류, custom token 생성 실패가 모두 500으로만 드러난다.
- 2026-06-16: 수정 방향은 권한 계약이나 RTDB rules를 바꾸지 않고, route handler 안에서 예상 가능한 서버 설정 실패를 비밀값 없이 기록하고 클라이언트에는 일반화된 `firebase auth unavailable` 응답을 주는 것이다.
- 2026-06-16: 로컬 `.env.local` 기준 `FIREBASE_PRIVATE_KEY`로 `createCustomToken()` 단독 실행은 성공했다. 따라서 현재 로컬 private key 형식은 직접 원인으로 재현되지 않았고, 실제 500은 route의 Firestore 검증 경로, 배포 환경변수, 또는 Admin SDK 런타임 예외를 서버 로그로 확인해야 한다.
- 2026-06-16: 서버 route는 예외 발생 시 `[room-auth] firebase token request failed` 로그에 roomId, role, leader teamId, 일반 오류 메시지만 남기고 `{ error: 'firebase auth unavailable' }`을 반환하도록 보강했다. 클라이언트 `ensureRoomFirebaseAuth()`는 이 일반화된 error 필드를 기존 `Firebase auth token request failed: 500` 메시지 뒤에 붙인다.
- 2026-06-16: 검증 결과 `npx vitest run src/app/api/room-auth/firebase-token/__tests__/route.test.ts src/lib/firebase.test.ts`는 2개 파일 4개 테스트가 통과했고, `npm run build`도 통과했다. `next start -p 3016`으로 실제 API route에 잘못된 payload를 POST했을 때 `{ "error": "invalid request" }` 400 응답도 확인했다.

## 운영 room auth import-stage 500 후속 점검

- 2026-06-16: 운영 `https://minionsbid.vercel.app/api/room-auth/firebase-token`에 token 없는 invalid payload를 POST했을 때도 400 JSON이 아니라 Next 500 HTML이 반환됐다. 이는 `POST()` 본문 검증 전 route 모듈 import 단계에서 예외가 발생하는 증거다.
- 2026-06-16: import 단계에서 실행되는 `src/lib/firebaseAdmin.ts`의 `initializeFirebaseAdmin()`이 잘못된 credential을 만나면 예외가 전파될 수 있었다. 이 경우 presence auth route뿐 아니라 Admin SDK를 import하는 다른 route도 handler 진입 전에 500 페이지로 떨어질 수 있다.
- 2026-06-16: `initializeFirebaseAdmin()` 내부를 `try/catch`로 감싸 import 자체는 성공하게 하고, 실패 원인은 비밀값 없이 `[firebaseAdmin] 초기화 실패` 로그에 남기도록 변경했다. 실제 Admin 사용 시점의 `getAdminDb()`는 `Firebase Admin 초기화에 실패했습니다: ...`로 명확히 실패한다.
- 2026-06-16: `FIREBASE_PRIVATE_KEY=invalid-private-key`를 주입한 `next start -p 3017`에서 `[firebaseAdmin] 초기화 실패` 로그가 찍히고, token 없는 `/api/room-auth/firebase-token` 요청은 500 HTML이 아니라 `{ "error": "invalid request" }` 400 JSON으로 내려오는 것을 확인했다.
- 2026-06-16: Vercel 환경변수에 private key가 따옴표로 감싸져 저장된 경우도 고려해 Admin credential 생성 전 key를 trim하고 외곽 따옴표, escaped newline, CRLF를 정규화한다.
- 2026-06-16: 검증 결과 `npx vitest run src/lib/firebaseAdmin.test.ts src/app/api/room-auth/firebase-token/__tests__/route.test.ts src/lib/firebase.test.ts`는 3개 파일 6개 테스트가 통과했고, `npm run build`도 통과했다.

## 운영 firebase-token 라우트 import 크래시(ERR_REQUIRE_ESM) 수정

- 2026-06-16: 사용자가 방 생성 후 모든 팀장을 입장시켰는데도 연결된 팀장이 0명으로 보이고, organizer/leader 모두 콘솔에 presence 에러, network 탭에 `firebase-token` 500을 보고했다. `e7a4454`/`ca60e2b` 배포 이후에도 동일했다.
- 2026-06-16: `vercel logs https://minionsbid.vercel.app`로 실시간 호출을 잡아 실제 원인을 확인했다. `roomId` 없는 빈 payload(`{}`)나 GET 요청도 무조건 500이었고, 응답은 우리 JSON이 아니라 Next 기본 500 HTML(`X-Matched-Path: /500`)이며 우리 쪽 로그가 전혀 없었다 — 이는 `POST()` 핸들러 진입 전 모듈 import 단계의 크래시라는 뜻이다. 같은 배포의 `/api/room-links`, `/api/auction-watchdog`는 정상 응답해 이 문제가 해당 라우트에 한정됨을 확인했다.
- 2026-06-16: 잡힌 스택트레이스는 `Error [ERR_REQUIRE_ESM]: require() of ES Module .../node_modules/jose/dist/webapi/index.js from .../node_modules/jwks-rsa/src/utils.js not supported`였다. `npm ls`로 확인한 체인은 `firebase-admin@14.0.0 -> jwks-rsa@4.0.1 -> jose@6.2.3`. `jose` v6는 ESM-only인데 `jwks-rsa`가 CJS `require()`로 부르고, Turbopack이 `firebase-admin/auth`(route.ts의 `getAuth` import)를 서버리스 함수에 번들링하면서 이 require가 런타임에서 깨졌다. `e7a4454`/`ca60e2b`는 우리 코드 내부 예외 처리였을 뿐, 이 import-time 번들링 충돌은 잡지 못했다.
- 2026-06-16: organizer/leader 구분 없이 라우트 자체가 100% 죽어 있었으므로 `ensureRoomFirebaseAuth()`가 전원 실패하고, 누구도 RTDB `presence/{roomId}`에 기록을 남기지 못해 모두의 화면에 "연결된 팀장 없음"으로 보인 것이다. presence 훅·게이트 로직 자체에는 결함이 없었다.
- 2026-06-16: 해법은 `next.config.ts`에 `serverExternalPackages: ['firebase-admin']`을 추가해 Turbopack이 이 패키지를 번들링하지 않고 네이티브 `require`로 남기는 것이다(이 jose/ESM 충돌 클래스의 표준 해법).
- 2026-06-16: 로컬 `npm run build` 통과 후 `next start -p 3099`로 재검증했다. 빈 payload는 500이 아니라 `{"error":"invalid request"}` 400으로, 존재하지 않는 roomId+token은 `{"error":"forbidden"}` 403으로 정상 응답했다 — import 크래시가 사라지고 정상 핸들러 로직까지 도달함을 확인했다.
- 2026-06-16: 검증 결과 `npx vitest run src/app/api/room-auth/firebase-token/__tests__/route.test.ts src/lib/firebase.test.ts src/lib/firebaseAdmin.test.ts`는 3개 파일 6개 테스트가 통과했다.
- 2026-06-16: `serverExternalPackages` 배포(`52903ac`) 이후에도 운영에서 동일한 `ERR_REQUIRE_ESM`이 재현됐다. `vercel logs`로 다시 확인한 결과 에러 메시지가 "external module"로 바뀌었을 뿐 동일했다 — Turbopack이 번들링 대신 `externalImport`로 native `require()`를 쓰도록 바뀌었지만, 그 native `require()` 자체가 ESM-only `jose`를 못 읽는 건 동일했다. 즉 번들링 방식 문제가 아니라 **`jwks-rsa@4.0.1`이 자기 `package.json`에 `"jose": "^6.1.3"`를 선언해놓고 내부 코드는 여전히 `require('jose')`(CJS)로 부르는 업스트림 버그**였다. `jose`는 v4·v5까지는 `./dist/node/cjs/index.js` CJS 빌드를 제공했지만 v6부터 `type: module` ESM-only로 전환됐다.
- 2026-06-16: 해법을 `package.json`의 `"overrides": { "jose": "5.10.0" }`로 교체했다. v4까지 내리지 않고 v6에 가장 가까운 마지막 CJS 지원 버전(v5.10.0)을 선택해 API 차이 위험을 최소화했다. `npm install` 후 `node_modules/jwks-rsa/node_modules/jose`가 실제로 5.10.0(CJS `main`)으로 바뀐 것을 확인했다. `serverExternalPackages` 설정은 firebase-admin 계열 SDK 번들링 회피라는 별개의 정당한 이유로 유지했다.
- 2026-06-16: `npm run build` + `next start -p 3098`로 재검증했다. GET은 이제 500이 아니라 405(Method Not Allowed), 빈 payload는 400, 존재하지 않는 roomId+token은 403으로 정상 응답했다. `npx vitest run`(관련 3개 파일 6개 테스트)과 `npm test`(전체 38개 파일 231개 테스트) 모두 통과했다.

## Presence와 custom token 설계 점검 문서화

- 2026-06-16: 사용자는 이 프로젝트가 presence와 custom token을 필수적으로 사용해야 하는 환경인지 재점검하고, 유사 시스템의 운영 또는 설계 사례까지 조사해 문서로 저장해 달라고 요청했다.
- 2026-06-16: 결론은 direct bid에는 Firebase custom token 또는 동등한 Firebase Auth claim 전달 수단이 필요하다는 것이다. 현재 Firestore rules가 `request.auth.token.role`, `roomId`, `teamId`로 팀장 입찰 권한을 검증하기 때문이다.
- 2026-06-16: presence는 개념적으로 custom token이 필수는 아니지만, 현재 RTDB rules가 `auth != null && auth.uid === $sessionId`를 요구하고 `usePresence.ts`가 `signInWithCustomToken()` 뒤 `onDisconnect()`를 쓰므로 현 구현에서는 실질적으로 custom token에 묶여 있다.
- 2026-06-16: Firebase, Supabase Realtime, Ably, Pusher 공식 문서를 비교했다. 공통 패턴은 신뢰 가능한 presence에 서버가 검증한 identity와 채널 권한이 필요하다는 점이다. 인증 endpoint는 형태만 다를 뿐 대부분 존재한다.
- 2026-06-16: 문서는 `doc/PRESENCE_CUSTOM_TOKEN_REVIEW.md`로 저장했다. 단기 권고는 custom token 구조 유지와 smoke test, 장애 UI 분리, 운영 로그 강화다. 장기적으로는 “팀장 미접속”과 “presence 인증 장애”를 경매 차단 사유에서 분리해 보여주는 방향을 권고했다.

## Presence와 custom token 확정 결정 반영

- 2026-06-17: 사용자는 결정값을 `1-A, 2-A, 3-C, 4-A, 5-A`로 확정했다. 즉 Firestore client direct bid와 Firebase RTDB custom token 기반 presence는 유지한다.
- 2026-06-17: `3-C`는 경매 시작 전에는 모든 팀장 연결을 필수로 하되, 진행 중 disconnect는 즉시 자동 중단하지 않고 grace time 뒤 주최자에게 일시정지/계속 진행/대기 선택지를 주는 정책이다.
- 2026-06-17: `4-A`와 `5-A`에 따라 팀장 미접속과 presence 인증 장애를 UI에서 분리하고, `/api/room-auth/firebase-token` smoke test 및 Vercel log 확인을 배포 절차에 강제하는 방향으로 문서를 갱신했다.

## Presence token 없는 선행 요청 제거

- 2026-06-17: 사용자는 `firebase-token` 요청이 400 이후 200으로 총 2번씩 반복된다고 보고했다.
- 2026-06-17: 원인은 `RoomClient`에서 `useRoomAuth()`가 `setRoomContext()`를 effect로 수행하고, 같은 렌더의 `usePresence()`가 아직 store의 `roomAuthToken`이 null인 상태로 먼저 실행되는 순서다. ORGANIZER는 teamId가 필요 없기 때문에 token 없는 요청을 바로 보내 400을 만들고, 다음 렌더에서 token이 들어와 200을 만든다.
- 2026-06-17: VIEWER는 self presence write를 하지 않으므로 Firebase Auth custom token 요청이 필요 없다. RTDB `presence/{roomId}` read는 현재 rules상 공개 read다.
- 2026-06-17: `usePresence`는 LEADER/ORGANIZER처럼 self presence write가 필요한 역할만 `ensureRoomFirebaseAuth()`를 호출하고, 해당 역할은 token이 준비되기 전에는 호출하지 않도록 변경했다.
- 2026-06-17: RED 증거는 `npx vitest run src/features/auction/hooks/usePresence.test.ts -t "wait for organizer token|viewer without requesting"`가 2개 테스트 실패였고, GREEN 증거는 같은 명령 통과다. 추가로 `npx vitest run src/features/auction/hooks/usePresence.test.ts`, `npm run build`, 운영 malformed HTTP `POST /api/room-auth/firebase-token {}` 400 JSON 응답을 확인했다.

## 추첨 후 경매 시작 전 접속 종료 알림 보강

- 2026-06-17: 사용자는 추첨 이후 경매 시작 전 사이에 접속이 끊긴 팀장이 있을 때 접속종료 알림이 표시되지 않는다고 보고했다.
- 2026-06-17: 원인은 `AuctionBoard`의 접속 이탈 오버레이 조건이 `isAuctionStarted`를 요구하는 점이다. 추첨 화면에서는 `useAuctionBoard`가 `currentPlayer`를 숨기므로 `soldPlayers.length > 0 || !!currentPlayer`가 거짓이 될 수 있고, `lotteryPlayer`가 있어도 오버레이가 뜨지 않는다.
- 2026-06-17: `useAuctionPresenceGuard`의 자동 pause/resume은 실행 중 경매에만 적용해야 하므로 변경하지 않는다. 이번 범위는 시작 전 표시 알림만 보강한다.
- 2026-06-17: `AuctionBoard`는 추첨 대상이 있고 아직 타이머가 없는 시작 전 구간에서도 팀장 이탈 오버레이를 표시한다. 이때 문구는 경매 일시정지가 아니라 경매 시작 대기로 분리한다.
- 2026-06-17: 검증 결과 `npx vitest run __tests__/AuctionBoard.test.tsx`, `npx vitest run src/features/auction/hooks/usePresence.test.ts src/features/auction/hooks/useAuctionPresenceGuard.test.ts __tests__/useAuctionBoard.test.tsx`, `npm run build`가 통과했다.

## 비공개입찰 presence pause currentPlayerId 전달 보정

- 2026-06-17: 사용자는 이미 생성된 비공개입찰 방에서 팀장 한 명이 접속 종료해도 경매가 일시정지되지 않는다고 보고했다.
- 2026-06-17: 접속 상태 자체는 `presence/{roomId}` 구독 결과를 `presences`와 `allConnected`로 관리하고 있다. 문제는 `RoomClient`가 `useAuctionPresenceGuard`에 room 정본 `currentPlayerId`가 아니라 `currentPlayer?.id`를 넘겨, players snapshot이나 파생 currentPlayer가 아직 비어 있는 순간 guard에 `null`이 전달될 수 있는 경로였다.
- 2026-06-17: `RoomClient`는 presence guard에 `currentPlayerId ?? currentPlayer?.id ?? null`을 전달한다. 따라서 room 정본에 현재 선수 id가 있으면 비공개입찰 ACTIVE 라운드에서도 null로 빠지지 않는다.
- 2026-06-17: 검증 결과 `npx vitest run __tests__/RoomClientPresenceGuard.test.tsx`, `npx vitest run __tests__/RoomClientPresenceGuard.test.tsx src/features/auction/hooks/useAuctionPresenceGuard.test.ts src/features/auction/hooks/usePresence.test.ts`, `npm run build`가 통과했다.
## 2026-06-18 리그일정관리 날짜 고정

- 요구사항은 리그일정관리의 선택 날짜 초기값을 오늘 날짜로 통일하고, 경기 입력/수정 후 타임라인을 다시 불러와도 사용자가 선택한 날짜를 바꾸지 않는 것이다.
- 원인 후보를 확인한 결과 `LeagueScheduleManager`의 timeline effect가 일정 데이터 로드마다 `timeline.days[0]` 또는 `schedule.startsAt`으로 `selectedDateKey`를 덮어쓰고 있었다. 이 effect가 저장 후 날짜 이동을 유발한다.
- 일정 생성 payload는 클라이언트에서 이미 `startOfSelectedDay`를 적용하지만, 서버 액션도 외부 호출 경계이므로 `createLeagueSchedule`에서 시작일과 종료일을 자정으로 정규화하는 편이 요구사항 3에 직접 맞다.
- 구현은 일정 id가 바뀔 때만 `selectedDateKey`를 오늘 날짜로 초기화하고, 같은 일정의 timeline 재로드에서는 기존 선택 날짜를 보존하도록 제한했다.
- 검증 결과 `npx vitest run __tests__/LeagueScheduleManager.test.tsx`, `npx vitest run src/features/schedules/api/__tests__/scheduleActions.test.ts`, `npx playwright test playwright/league-schedule.spec.ts --project=chromium --workers=1`, 변경 파일 대상 `npx eslint ...`가 통과했다. `npx tsc --noEmit`은 이번 변경과 무관한 `__tests__/AuctionBoard.test.tsx`의 기존 타입 오류에서 실패했다.

## 2026-06-23 동시 입장 presence/custom token 검증

- 요청은 첫 방 생성 직후 주최자와 팀장들이 동시에 입장할 때 Firebase custom token, RTDB presence, 권한 부여가 각 사용자별로 맞는지 검증하는 것이다.
- 관련 E2E 표면은 `playwright/auction-eight-leaders-emulator.spec.ts`이며, 이미 organizer + 8 leaders, Firebase Auth, RTDB presence, Firestore bid 흐름을 Emulator로 검증한다.
- 관련 클라이언트 인증 표면은 `src/lib/firebase.ts`의 `ensureRoomFirebaseAuth`이고, presence 등록 표면은 `src/features/auction/hooks/usePresence.ts`다.
- 관련 서버 토큰 발급 표면은 `src/app/api/room-auth/firebase-token/route.ts`이며, role/teamId/token 검증 후 Firebase custom token claims를 발급한다.
- 현재 작업트리에는 `src/features/schedules/api/scheduleActions.ts`에 기존 변경이 있어 이번 검증 작업에서는 건드리지 않는다.
- E2E 보강은 `playwright/auction-eight-leaders-emulator.spec.ts`에 한정한다. 동시 입장은 이미 `Promise.all`로 organizer와 8 leader page를 동시에 `goto`하는 구조라 이 흐름 위에 claims/presence/권한 거부 assertions를 추가했다.
- 검증 결과 `npx tsc --noEmit --pretty false`와 `npm run test:e2e:auction:8leaders:emulator`가 통과했다. 증거 파일은 `.omo/ulw-loop/evidence/G001-C001-browser-e2e.txt`, `.omo/ulw-loop/evidence/G001-C002-http-forbidden.json`, `.omo/ulw-loop/evidence/G001-C003-browser-bids.txt`, `.omo/ulw-loop/evidence/G001-emulator-run-output.txt`다.

## 2026-06-23 전체 npm test 회귀 실패 확인

- `npm test` 전체 실행에서 `__tests__/LeagueScheduleManager.test.tsx`의 `keeps the selected date after saving a match day`가 실패했다. 단일 테스트와 파일 단독 실행은 통과해 컴포넌트 동작 자체보다 병렬 전체 실행의 fake timer/user-event race로 판단했다.
- 실패 증거는 `.omo/ulw-loop/evidence/G002-npm-test-rerun.txt`이고, 단독 통과 증거는 `.omo/ulw-loop/evidence/G002-league-manager-file-before.txt`다.
- 테스트는 초기 timeline 렌더가 끝나 캘린더가 `2026-06-18`을 표시한 뒤 mock 캘린더 날짜 변경을 직접 발생시키고, `2026-06-19` 표시를 확인한 다음 저장하도록 안정화한다.
- 검증 결과 `npx vitest run __tests__/LeagueScheduleManager.test.tsx`, `npm test`, `npx eslint __tests__/LeagueScheduleManager.test.tsx`, `npx tsc --noEmit --pretty false`가 통과했다. 증거 파일은 `.omo/ulw-loop/evidence/G002-league-manager-green.txt`, `.omo/ulw-loop/evidence/G002-npm-test-green.txt`, `.omo/ulw-loop/evidence/G002-tsc-green.txt`다.

## 2026-06-23 리그전 일정 최신순 정렬

- 요청 문구에는 오름차순과 최근 경기 상단이 함께 있었지만, 표시 의도는 "최근 경기가 위"로 해석한다. 따라서 catalog 조회는 `starts_at` 내림차순, 즉 최신순으로 유지한다.
- 일정관리 좌측 목록은 `getLeagueScheduleCatalog()`가 반환한 `schedules` 순서를 그대로 렌더링하므로 서버 액션 query 정렬을 테스트로 고정하면 UI 정렬 계약도 함께 고정된다.
- 검증 결과 `npx vitest run src/features/schedules/api/__tests__/scheduleActions.test.ts`와 `npx eslint src/features/schedules/api/scheduleActions.ts src/features/schedules/api/__tests__/scheduleActions.test.ts`가 통과했다.

## 2026-06-24 엑셀 업로드 시트 선택

- 요청은 엑셀 파일 선택 직후 파일 안의 시트 이름을 먼저 보여주고, 사용자가 선택한 시트의 데이터만 기존 방 생성 목록에 반영하는 것이다.
- 현재 구현은 `src/features/auction/hooks/useCreateRoom.ts`의 `handleExcelUpload`에서 파일을 읽자마자 `DB` 시트 우선, 없으면 첫 시트를 자동 선택해 즉시 파싱한다.
- `CaptainRegistrationStep`과 `PlayerRegistrationStep`은 같은 `fileInputRef`와 `handleExcelUpload`를 공유하므로 시트 선택 UI는 부모 `CreateRoomModal`에 한 번만 두고 현재 단계 위에 표시하는 방식이 가장 작은 변경이다.
- 적용 스킬은 `omo:ulw-loop`다. `spawn_agent` 도구는 현재 세션에 제공되지 않아 위임 요구는 실행할 수 없고, 직접 RED/GREEN 테스트와 브라우저 QA evidence를 기록한다.
- RED 증거는 `npx vitest run __tests__/CreateRoomModal.test.tsx -t "show workbook sheets|warn when the selected sheet"`가 `사용할 시트를 선택해주세요`를 찾지 못해 실패한 것이다.
- GREEN 검증은 `npx vitest run __tests__/CreateRoomModal.test.tsx`, `npx eslint src/features/auction/hooks/useCreateRoom.ts src/components/CreateRoomModal.tsx __tests__/CreateRoomModal.test.tsx`, `npx tsc --noEmit --pretty false` 통과다.
- 브라우저 QA는 기존 dev 서버 `http://localhost:3001`에서 Playwright로 `sheet-select-manual.xlsx`를 업로드하고 `참가자` 시트를 클릭해 `SelectedPlayer` 입력값을 확인했다. 증거는 `.omo/ulw-loop/evidence/sheet-select-browser-actions.txt`와 `.omo/ulw-loop/evidence/sheet-select-browser-pass.png`다.

## 2026-06-24 추첨 후 티어와 희망 팀 표시

- 요청은 선수 추첨 후 입찰 대상 정보에서 포지션만 보이고 티어 정보와 티어 이미지가 보이지 않는 문제를 고치고, 엑셀에 `희망 팀` 정보가 있으면 입찰 대상 정보에도 보여주는 것이다.
- 관련 표시 표면은 추첨 중 `LotteryAnimation`과 경매 시작 후 `board/PlayerInAuction`이다. `PlayerInAuction`은 기본 티어 UI가 있으므로 데이터가 빈 값으로 들어오는 경로와 희망 팀 필드 부재를 함께 확인한다.
- 관련 데이터 경로는 `useCreateRoom` 엑셀 파싱, `roomActions.createRoom` Firestore 저장, `useAuctionRealtime` players snapshot 매핑, `auctionDrawActions.drawNextPlayer`의 `lotteryPlayer` 이벤트 payload다.
- 구현은 `desired_team` 필드를 선수 타입, 방 생성 payload, Firestore 저장, realtime snapshot, 추첨 이벤트 payload에 추가했다.
- 엑셀 헤더 파싱은 `무작위 총력전`, `전략적 팀 전투`을 일반 `티어`보다 먼저 판정해 소환사의 협곡 티어가 다른 게임 티어로 덮이지 않게 했다.
- 입찰 대상 카드의 티어 이미지는 alt를 실제 티어명으로 바꾸고, `desired_team`이 있으면 `희망 팀` 박스를 표시한다.
- 검증 결과 `npx vitest run __tests__/PlayerInAuction.test.tsx __tests__/CreateRoomModal.test.tsx __tests__/LotteryAnimation.test.tsx`, 대상 파일 `npx eslint ...`, `npx tsc --noEmit --pretty false`가 통과했다.
- 브라우저 fixture API는 현재 실행 중인 `http://localhost:3001`에서 `fixture disabled` 404를 반환해 실제 경매 카드 브라우저 QA는 수행하지 못했다.

## 2026-06-24 비공개 입찰 대상 카드 보정

- 사용자 이미지의 `입찰 대상` 카드는 일반 공개 입찰 카드가 아니라 `src/features/auction/components/board/SealedBidBoard.tsx`의 비공개 입찰 대상 카드다.
- 기존 비공개 카드는 `getExactTierImage()`를 사용해 `골드 4`, `골드 IV`처럼 세부 티어 문자열이 들어오면 이미지 경로가 null이 되고, 그 조건 안에 티어 텍스트도 묶여 있어 티어 정보 전체가 빠질 수 있었다.
- 이번 보정은 비공개 카드의 티어 이미지 선택을 `getTierImage()`로 바꿔 공개 입찰 카드와 같은 부분 매칭을 쓰고, `desired_team` 표시를 같은 카드에 추가하는 최소 변경으로 제한한다.
- RED 검증은 `npx vitest run __tests__/SealedBidBoard.test.tsx -t "세부 티어 이미지"`가 `Unable to find an element with the alt text: 골드 IV`로 실패했다.
- GREEN 검증은 `npx vitest run __tests__/SealedBidBoard.test.tsx __tests__/PlayerInAuction.test.tsx __tests__/CreateRoomModal.test.tsx __tests__/LotteryAnimation.test.tsx`, 대상 파일 `npx eslint ...`, `npx tsc --noEmit --pretty false`가 모두 통과했다.

## 2026-06-24 희망 팀 엑셀 헤더 변형 보정

- 사용자가 희망 팀 정보가 여전히 표시되지 않는다고 보고했다. UI는 `desired_team`이 있으면 표시하도록 되어 있어, 엑셀 헤더가 `희망 팀`과 정확히 일치하지 않아 파싱되지 않는 경로를 우선 의심한다.
- 엑셀 헤더는 셀 안 줄바꿈이나 여러 공백을 포함할 수 있으므로, `희망\n팀`, `희망  팀` 같은 값을 `희망팀`으로 정규화한 뒤 컬럼을 탐지한다.
- RED 검증은 `npx vitest run __tests__/CreateRoomModal.test.tsx -t "desired team"`가 `desiredTeam: ""`로 실패했다.
- GREEN 검증은 `npx vitest run __tests__/CreateRoomModal.test.tsx __tests__/SealedBidBoard.test.tsx __tests__/PlayerInAuction.test.tsx`, 대상 파일 `npx eslint ...`, `npx tsc --noEmit --pretty false`가 모두 통과했다.

## 2026-06-25 엑셀 시트 미리보기와 사용자 지정 열 매핑

- 요청은 시트 선택 시 어떤 데이터가 포함되어 있는지 먼저 표시하고, 사용자가 직접 사용할 헤더 열 범위나 분리된 열을 선택한 뒤 매핑해서 시트를 적용하는 것이다.
- 현재 구현은 `useCreateRoom.selectExcelSheet()`가 선택 즉시 `applyExcelSheet()`를 호출해 자동 파싱한다. 이번 변경은 `selectExcelSheet()`가 sheet rows를 preview state로 보관하고, 별도 `applyExcelPreview()`가 선택된 헤더 행과 컬럼 매핑으로 기존 파서 흐름을 실행하는 구조가 가장 작다.
- 사용 컬럼 선택은 연속 범위와 분리 선택을 모두 만족시키기 위해 각 열의 체크박스를 둔다. 연속 범위 입력은 빠른 선택 도구로 제공하고, 최종 source of truth는 `selectedColumnIndexes` 배열로 둔다.
- 자동 헤더 탐지는 기본값으로 유지한다. 사용자가 헤더 행을 바꾸거나 열 선택을 바꾸면 자동 매핑을 다시 계산하되, 필드별 select에서 직접 override할 수 있게 한다.
- UI는 기존 Cyber-Pixel 모달 내부에 데이터 밀도가 높은 설정 패널로 추가한다. 별도 랜딩형 설명이나 새로운 디자인 시스템 파일은 만들지 않는다.
- RED 검증은 `npx vitest run __tests__/CreateRoomModal.test.tsx -t "preview sheet data|omit player name|workbook sheets"`가 `시트 데이터 미리보기`를 찾지 못해 실패한 것이다.
- GREEN 검증은 `npx vitest run __tests__/CreateRoomModal.test.tsx -t "preview sheet data|omit player name|workbook sheets"`, `npx vitest run __tests__/CreateRoomModal.test.tsx`, 대상 파일 `npx eslint ...`, `npx tsc --noEmit --pretty false`, `npm test`가 모두 통과했다.
- 브라우저 QA는 `http://localhost:3016` dev 서버에서 실제 xlsx를 업로드하고 `DB` 시트를 선택한 뒤 미리보기, 분리 열 선택, 필드 매핑, 적용 후 선수명 반영까지 확인했다. 증거는 `.omo/ulw-loop/evidence/excel-mapping-browser-qa.txt`와 `.omo/ulw-loop/evidence/excel-mapping-browser-pass.png`다.
- Playwright QA 후 포트 `3016` 리스너가 남지 않았음을 확인했다.

## 2026-06-25 비공개 입찰 공개 전 점수 카드 스타일

- 요청은 비공개 입찰 제출 후 점수 공개 전 카드가 성의 없어 보이는 문제를 개선하는 것이다.
- 관련 표면은 `src/features/auction/components/board/SealedBidBoard.tsx`의 `SealedCard` 뒷면이다. `LOCKED` 상태와 `REVEALING`에서 아직 공개되지 않은 카드는 같은 뒷면을 보여준다.
- 범위는 공개 전 뒷면 카드로 제한한다. 공개 완료 후 앞면의 최고점, 재입찰, 포기 상태 색상은 기존 공개 결과 계약이므로 유지한다.
- 디자인은 기존 Cyber-Pixel 토큰을 따라 minion blue 테두리, 중앙 `?` 텍스트, 느린 pulse 애니메이션으로 처리한다. `SEALED BID` 문구와 작은 내부 박스는 제거한다.
- 검증은 `npx vitest run __tests__/SealedBidBoard.test.tsx`, 변경 TS 테스트 파일 대상 ESLint, `npm run build`, Playwright 브라우저 `setContent` 렌더에서 `?` 텍스트와 `sealed-bid-card-pulse` animationName 및 테두리 색 변화 확인으로 진행했다.
- PowerShell에서 Bash식 `E2E_AUCTION_FIXTURE=1 ...` 명령은 실행 문법 오류로 실패했고, 직접 Playwright 실행은 기존 3000번 Next dev 서버 때문에 webServer 시작이 막혔다. 최종 검증은 프로젝트 runner인 `npm run test:e2e:auction`으로 실행했으며 production build 후 chromium 14개 경매 회귀 테스트가 통과했다.
- 후속 요청으로 공개 전 카드의 대각선 줄무늬를 제거하고 배경을 흰색으로 변경했다. 점멸 대상은 기존처럼 minion blue 테두리와 `?` 텍스트만 유지한다.
- 후속 검증은 `npx vitest run __tests__/SealedBidBoard.test.tsx`, 변경 TS 파일 ESLint, `npm run build`, Playwright `setContent` 계산 스타일 확인으로 진행했다. 브라우저에서 공개 전 카드의 `backgroundColor`는 `rgb(255, 255, 255)`, `backgroundImage`는 `none`, 내부 자식은 `?` 하나로 확인됐다.
- 사용자가 실제 화면에서 테두리 색상과 점멸 효과가 반영되지 않는 것 같다고 보고했다. 카드에 `border-minion-blue`와 `text-minion-blue`를 직접 추가하고, 기존 색상 hover 계열 전환보다 더 눈에 띄도록 테두리 alpha와 `?` opacity가 함께 변하는 별도 keyframes로 보강한다.
- 브라우저 계산값으로 확인하니 `?`는 점멸했지만 `.sealed-bid-card-back`의 base `border-color: ... !important`가 animated border color를 막고 있었다. `!important`를 제거해 테두리 keyframes가 실제 계산값에 반영되도록 수정한다.
- 재검증에서 공개 전 카드의 `animationName`은 `sealed-bid-card-pulse`, `?`는 `sealed-bid-mark-pulse`로 확인됐다. 1.5초 뒤 테두리는 `oklab(... / 0.28)`로, `?`는 opacity 약 `0.45`와 alpha 색상으로 변해 둘 다 점멸이 실제 계산값에 반영됐다.

## 2026-06-25 비공개 입찰 점수공개 페이즈 대상 정보 compact 조정

- 요청은 입찰 이후 점수공개 페이즈에서 입찰 대상 정보 박스가 공개 카드보다 크게 보이는 문제를 줄이고, 하단에 `입찰가격공개` 문구를 표시하는 것이다.
- 적용 상태는 `sealedBid.phase === "LOCKED" || sealedBid.phase === "REVEALING"`로 본다. 이 구간은 비공개 입찰 제출 이후 공개 카드가 화면의 주 콘텐츠가 되는 구간이기 때문이다.
- 스타일 점검 결과, 현재 대상 정보 박스는 점수공개 중에도 `p-5`, 큰 티어 이미지, `text-fluid-lg` 선수명을 유지해 공개 카드 그리드와 시각적 우선순위가 충돌한다. compact 상태에서는 이미지와 padding, gap, 폰트를 줄이고 상태 문구를 박스 내부 하단에 배치하는 것이 적절하다.
- 구현은 `isScoreRevealPhase` 조건으로 기존 ACTIVE 레이아웃은 유지하고, `LOCKED`/`REVEALING`에서 대상 정보 박스 padding, title size, image width/gap, player name size, desired/comment padding만 줄였다. 공개 카드 그리드와 공개 완료 강조 스타일은 변경하지 않았다.
- `입찰가격공개` 문구는 compact 대상 정보 박스 하단에 minion blue 상단 구분선과 함께 표시한다. 사용자가 붙여 쓴 문구를 요청했으므로 UI 텍스트도 그대로 유지한다.
- 검증 결과 `npx vitest run __tests__/SealedBidBoard.test.tsx`, 변경 TS 파일 ESLint, `npm run build`, Playwright 대표 마크업 브라우저 렌더, `npm run test:e2e:auction`이 통과했다. 브라우저 계산값은 compact box padding 12px, label text `입찰가격공개`, label/border color minion blue로 확인됐다.
- 후속 요청에 따라 `입찰가격공개` 문구는 입찰 대상 `pixel-box` 내부가 아니라 박스 외부 하단에 독립 상태 라벨로 표시한다. 박스 내부 구분선은 제거해 compact 대상 정보와 공개 상태 안내가 분리되도록 한다.

## 2026-06-25 비공개 입찰 점수 카드 박스와 바운스 효과

- 요청은 `입찰가격공개` 텍스트를 더 크게 만들고, 아래 점수 카드들을 입찰 대상 박스처럼 별도 박스 내부에 표시하며, 현재 점멸 효과를 유지한 채 2~3px 정도 상하 바운스 느낌을 추가하는 것이다.
- 현재 카드 flip은 `motion.div`가 `rotateY` transform을 제어한다. 같은 DOM에 CSS `transform` bounce를 주면 Framer Motion transform과 충돌하므로, 회전 wrapper 안쪽에 별도 `sealed-bid-card-bounce` 래퍼를 두고 그 래퍼에 `translateY` 애니메이션을 적용한다.
- 점수 카드 영역은 `pixel-box` 기반의 별도 섹션으로 감싸고, `입찰가격공개`는 그 섹션 제목으로 이동한다. 이렇게 하면 공개 카드와 상태 문구가 한 덩어리로 읽히고, 입찰 대상 compact 박스와 시각 구조가 맞는다.
- 구현 후 브라우저 계산값에서 `입찰가격공개` 제목이 점수 카드 박스 내부에 있고, `.sealed-bid-card-back`도 같은 박스 내부에 있음을 확인했다. `sealed-bid-card-bounce` transform은 1.5초 뒤 `translateY` 약 `-2.99px`로 변해 요청한 2~3px 바운스 범위에 맞는다.
- 검증 결과 `npx vitest run __tests__/SealedBidBoard.test.tsx`, 변경 TS 파일 ESLint, `npm run build`, Playwright 대표 마크업 브라우저 렌더, `npm run test:e2e:auction`이 통과했다.
- 후속 요청에 따라 `입찰가격공개` 제목은 박스 내부 일반 첫 줄이 아니라 박스 상단 중앙에 걸친 제목 배지로 조정한다. 제목은 minion blue 테두리, 흰 배경, pixel shadow를 사용해 하단 카드 박스의 헤더로 읽히게 한다.
- 브라우저 계산값에서 제목은 `position: absolute`, 흰 배경, minion blue 테두리로 확인됐고, 제목 rect가 박스 상단 경계와 겹쳐 박스 제목 배지처럼 렌더링됨을 확인했다.
- 후속 요청에 따라 입찰 대상 정보 박스와 점수공개 박스 사이 간격을 `mt-2`에서 `mt-8`로 늘리고, 제목 배지와 카드 grid가 겹쳐 보이지 않도록 내부 상단 padding을 `pt-6`에서 `pt-14`로 늘린다. 1차 `pt-10` 확인에서 제목과 카드 간격이 약 1.5px에 그쳐 추가 확대했다.
