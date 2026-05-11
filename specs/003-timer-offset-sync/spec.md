# Specification: 003 Timer Offset & Sync

## 개요 (Overview)
경매 입찰 시 타이머가 남은 시간에 단순히 5초를 더하는 것이 아니라, "서버에서 입찰 이벤트가 발생한 (처리된) 시점을 기준으로 5초 뒤"로 타이머를 갱신하여 경매의 긴박감을 유지하는 기능입니다. 이를 위해 클라이언트와 Firebase 서버 간의 시간 차이(Offset)를 동기화하고, 네트워크 지연 및 동시 입찰로 인한 사이드 이펙트를 방어합니다.

## 핵심 전제 (Core Premises)
1. **타이머 갱신 기준**: 입찰 발생 시점의 남은 시간이 아닌, **서버에서 이벤트가 발생한 시간(Server Now) + 5초**로 만료 시간을 덮어씁니다.
2. **Server Time Offset 사용**: 모든 클라이언트는 자신의 로컬 시스템 시간이 아닌, Firebase RTDB에서 제공하는 `/.info/serverTimeOffset` 값을 이용해 추정한 **서버 시간(`Date.now() + offset`)**을 기준으로 타이머를 계산하고 보여줍니다. 방장(주최자)의 로컬 시계를 기준으로 삼지 않아, 방장의 환경(렉, 튕김 등)에 타이머가 종속되는 문제를 방지합니다.

## 해결해야 할 맹점 및 방어 로직 (Blind Spots & Mitigation)

1. **억울한 실패 방지 (Grace Period)**
   - 네트워크 핑 지연으로 인해 화면상 타이머를 보고 입찰을 눌렀으나 서버 도달 시 만료 처리되는 억울함을 막기 위해, 서버 만료 검사 시 `500ms`의 유예 시간(Grace Period)을 부여합니다.
2. **시간 역행 방지 (Max Extend 연산)**
   - 동시에 입찰이 발생할 경우, 뒤늦게 처리된 입찰 트랜잭션이 이미 늘어난 타이머를 깎아먹지 않도록 `Math.max(기존 만료시간, 새로운 만료시간)`을 적용합니다.
3. **낙관적 UI 타이머 덜컹거림 방지 (Anti-Jitter)**
   - 클라이언트에서 낙관적으로 UI를 먼저 5초로 갱신한 후, 서버에서 응답이 왔을 때 오차가 `300ms` 이내라면 타이머 애니메이션을 억지로 갱신(점프)하지 않고 스무스하게 진행되도록 무시합니다.
4. **보안 및 클라이언트 조작 방어 (중요!)**
   - 현재 입찰 트랜잭션(`placeBidClient.ts`)이 클라이언트 환경에서 실행됩니다. 악의적인 유저가 `Date.now() + offset` 값을 조작하여 `timerEndsAt`을 무한정 늘릴 수 있습니다.
   - 따라서, Firestore 보안 규칙(Security Rules)에서 `request.time`을 기준으로 `timerEndsAt`이 일정 범위(예: `request.time + 5000ms + 약간의 지연오차`)를 초과하지 못하도록 강력하게 검증해야 합니다.
5. **백그라운드 스로틀링 방어**
   - `setInterval`에 의존하여 초를 깎지 않고, 브라우저가 화면을 그릴 때마다 항상 `종료 시간 - 추정 서버 시간`을 동적으로 계산하도록 구현하여 앱이 백그라운드에 다녀와도 시간이 정확하도록 합니다.

## 스펙 범위 (Scope)
- `useServerTimeOffset.ts` (또는 기존 realtime hook) 내에 RTDB 기반 offset 계산 로직 추가
- `useBiddingControl.ts`의 낙관적 업데이트 로직 (Anti-Jitter 포함) 개선
- `placeBidClient.ts` 내 트랜잭션 로직 개선 (Max Extend 연산, Grace Period 적용)
- Firestore Database Rules 검증 로직 추가 검토
