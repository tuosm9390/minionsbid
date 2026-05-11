# Implementation Plan: 003 Timer Offset & Sync

## Phase 1: RTDB Server Time Offset 도입
1. **Hook 생성**: `useServerTimeOffset.ts`를 생성하거나 기존 realtime hook에 병합합니다.
   - `firebase.database().ref('.info/serverTimeOffset')` 구독.
   - 로컬 상태로 `offset` (ms) 저장 및 제공.
   - 클라이언트에서 서버 시간 계산 시 `getServerTime = () => Date.now() + offset` 유틸리티 제공.

## Phase 2: 트랜잭션 로직 개선 (placeBidClient.ts)
1. **서버 시간 기준 타이머 갱신**
   - 트랜잭션 내부에서 클라이언트의 `getServerTime()`을 호출하여 처리 시점의 서버 추정 시간을 구합니다.
   - 새로 설정될 타겟 종료 시간 = `estimatedServerTime + 5000ms`.
2. **Max Extend 방어 (시간 역행 방지)**
   - `const finalTimerEndsAt = Math.max(existingTimerEndsAt, targetEndsAt)` 적용.
3. **Grace Period 적용**
   - 만료 검증 로직 변경: `if (estimatedServerTime > existingTimerEndsAt + 500)` 만료 처리. (500ms 여유)

## Phase 3: 낙관적 UI 및 Anti-Jitter 처리 (useBiddingControl.ts)
1. **낙관적 UI 반영**
   - 유저 클릭 시 `setOptimisticTimerEndsAt(new Date(getServerTime() + 5000).toISOString())` 즉각 반영.
2. **서버 스냅샷 수신 시 Anti-Jitter 적용**
   - 서버에서 새로운 `timerEndsAt` 수신 시, 현재 UI에 표시중인 `optimisticTimerEndsAt`과 서버의 `timerEndsAt` 값 차이를 계산.
   - 오차가 `300ms` 미만이라면 덮어쓰지 않고 낙관적 UI 값을 그대로 유지 (부드러운 애니메이션 유지).

## Phase 4: 보안 규칙 검토 (Firestore Rules)
1. **악의적 시간 갱신 방어**
   - Firestore Security Rules에 `request.resource.data.timerEndsAt`이 `request.time`을 기준으로 비정상적으로 큰 값(예: +10초 이상)을 가질 수 없도록 방어하는 규칙 작성 및 적용.

## Phase 5: 타이머 렌더링 최적화
1. **렌더링 점검**
   - `useAuctionRealtime` 또는 개별 컴포넌트에서 타이머 렌더링 시 `setInterval`이 아닌 `requestAnimationFrame`과 `getServerTime()` 기반 절대 시간 차분 연산이 잘 적용되어 있는지 검증.
