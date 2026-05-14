# Realtime Auction Timer Implementation Plan

## 목적

이 문서는 단일 아이템 경매 타이머를 서버 기준으로 처리하고, 모든 참여자 화면에 동일한 경매 상태를 송출하기 위한 구현 계획이다. 현재 저장소 계약에 맞춰 Firestore를 정본 상태로 두고, Realtime Database는 저지연 fanout 버스로 사용한다.

## 확정 정책

- 일반 경매 시작 타이머는 10초다.
- 최초 최소 입찰가는 10이다.
- 주최자는 입찰할 수 없다.
- 별도 입찰 자격 조건은 두지 않는다.
- 입찰 단위는 10이다.
- 다음 최소 입찰가는 항상 현재 최고 입찰가 + 10이다.
- 남은 시간이 정확히 8초인 상태에서 입찰이 성공하면 타이머를 갱신한다.
- 남은 시간이 8초 초과이면 입찰 성공 시 타이머를 갱신하지 않는다.
- 남은 시간이 0초 초과, 8초 이하이면 입찰 성공 시 종료 시각을 서버 현재 시각 + 8초로 갱신한다.
- 남은 시간이 0초 이하이면 입찰은 실패하고 입찰 기능을 사용할 수 없다.
- 클라이언트 타이머 표시는 floor 방식이다.
- 화면이 0초를 표시하면 입찰 버튼을 비활성화한다.
- 종료 알림은 클라이언트 타이머가 아니라 정본 상태의 `auction_closed` 수신 기준으로 표시한다.
- 동시 입찰은 서버 transaction에서 먼저 성공한 요청을 우선한다.
- 입찰과 종료가 충돌하면 종료를 우선한다.
- 낙찰 알림은 입찰자 닉네임, 아이템, 낙찰가격을 표시한다.
- Firestore 기록 실패는 성공한 입찰을 되돌리지 않고 재시도 대상으로 처리한다.

## 상태 모델

내부 상태값은 영문 enum을 사용하고 화면에서 한글 라벨로 매핑한다.

| 내부 값 | 화면 라벨 |
| --- | --- |
| `draw_waiting` | 추첨 대기 |
| `draw_completed` | 추첨 완료 |
| `auction_waiting` | 경매 대기 |
| `auction_active` | 경매 중 |
| `auction_closed` | 경매 완료(낙찰) |

## 저장소 역할

Firestore는 정본 상태다.

- `rooms/{roomId}`.
  - `current_player_id`.
  - `active_bid`.
  - `timer_ends_at`.
  - `auction_revision`.
  - `last_auction_event`.
- `rooms/{roomId}/bids`.
  - 입찰 감사 이력.
- `rooms/{roomId}/messages`.
  - 시스템 메시지와 낙찰 알림.

Realtime Database는 fanout 버스다.

- `signals/{roomId}/auctionEvent`.
  - `BID_PLACED`, `AUCTION_STARTED`, `PLAYER_AWARDED` 등의 저지연 이벤트.
- `signals/{roomId}/latestMessage`.
  - 낙찰 및 시스템 알림의 저지연 표시.

## 경매 시작 흐름

1. 서버 액션이 주최자 권한을 확인한다.
2. Firestore transaction에서 현재 아이템이 `auction_waiting`인지 확인한다.
3. 서버 현재 시각 기준으로 `timer_ends_at = now + 10000ms`를 저장한다.
4. `auction_revision`을 1 증가시킨다.
5. `AUCTION_STARTED` 이벤트를 RTDB에 발행한다.
6. 종료 확정 작업을 `timer_ends_at` 기준으로 예약한다.

## 입찰 처리 흐름

입찰은 클라이언트 직접 쓰기가 아니라 서버 경계에서 처리한다.

1. 서버 액션이 요청자, 방, 팀, 금액을 검증한다.
2. 주최자 요청이면 실패한다.
3. Firestore transaction에서 현재 경매 상태를 읽는다.
4. `remainingMs = timer_ends_at - serverNow`를 계산한다.
5. `remainingMs <= 0`이면 실패한다.
6. `amount < nextMinBidAmount`이면 실패한다.
7. 성공하면 `active_bid`, 최고 입찰자 닉네임, 최고가, 다음 최소 입찰가를 갱신한다.
8. `0 < remainingMs <= 8000`이면 `timer_ends_at = serverNow + 8000ms`로 갱신한다.
9. `remainingMs > 8000`이면 `timer_ends_at`은 유지한다.
10. `auction_revision`을 1 증가시킨다.
11. RTDB에 `BID_PLACED` 이벤트를 발행한다.
12. Firestore 입찰 이력 기록이 실패하면 재시도 대상으로 남기고 입찰 성공은 유지한다.

사용자에게 노출하는 실패 문구는 `입찰에 실패하였습니다.`로 통일한다.

## 종료 확정 흐름

메인 종료 확정은 Cloud Tasks 또는 Firebase Task Queue Functions를 사용한다. Scheduled Function은 누락 종료 보정용으로만 둔다.

1. 경매 시작 또는 8초 이하 입찰 갱신 시 종료 작업을 예약한다.
2. 종료 작업 payload에는 `roomId`, `itemId`, `timerEndsAt`, `auctionRevision` 또는 별도 `closeVersion`을 포함한다.
3. 작업 실행 시 Firestore transaction으로 현재 상태를 다시 확인한다.
4. `auction_active`가 아니면 무시한다.
5. 현재 `timer_ends_at`이 payload보다 늦거나 `serverNow`보다 미래이면 무시한다.
6. 조건이 맞으면 `auction_closed`로 확정한다.
7. 낙찰자 닉네임, 아이템, 낙찰가격을 종료 결과와 메시지에 저장한다.
8. RTDB에 `PLAYER_AWARDED` 또는 종료 이벤트를 발행한다.

## Cloud Tasks와 Scheduled Functions 비교

Cloud Tasks는 경매별 종료 시각에 작업을 예약할 수 있어 10초 시작, 8초 갱신 정책에 적합하다. 작업 재시도, rate limit, dispatch deadline을 설정할 수 있고, 오래된 작업은 revision 검증으로 무시할 수 있다. 단점은 queue, IAM, region 설정이 필요하고 구현이 더 복잡하다는 점이다.

Scheduled Functions는 구현이 단순하지만 주기 실행 모델이다. 초 단위 실시간 종료에는 맞지 않고, 경매가 없을 때도 실행되며, 경매가 많아질수록 스캔 비용이 늘어난다. 따라서 메인 종료 경로가 아니라 `timer_ends_at < now - 30s` 같은 누락 상태를 보정하는 backup sweep에 적합하다.

권장 구성은 Cloud Tasks를 메인 종료 경로로 사용하고, Scheduled Functions를 1분 단위 누락 보정으로 사용하는 것이다.

## 클라이언트 표시 규칙

- 모든 클라이언트는 Firestore room hot state와 RTDB event를 구독한다.
- 화면 타이머는 `Math.floor((timerEndsAt - estimatedServerNow) / 1000)`으로 표시한다.
- 표시값은 0 미만으로 내려가지 않게 clamp한다.
- 표시값이 0이면 입찰 버튼을 비활성화한다.
- 최종 종료 알림은 `auction_closed` 상태를 받은 뒤 표시한다.
- 새로고침 또는 늦은 입장 사용자는 Firestore 정본 상태를 읽어 복구한다.

## 테스트 계획

- 단위 테스트.
  - 시작 시 10초 타이머 생성.
  - 남은 시간 > 8초 입찰은 타이머 유지.
  - 남은 시간 = 8초 입찰은 서버 현재 시각 + 8초로 갱신.
  - 남은 시간 < 8초 입찰은 서버 현재 시각 + 8초로 갱신.
  - 남은 시간 <= 0 입찰 실패.
  - 주최자 입찰 실패.
  - 최소 입찰가 미만 실패.
  - 동시 입찰에서 한 transaction만 성공.
- 통합 테스트.
  - RTDB `BID_PLACED` 이벤트 수신 후 모든 화면의 최고가와 타이머가 일치.
  - Firestore snapshot이 늦게 도착해도 revision 기준으로 수렴.
  - 종료 작업과 막판 입찰 충돌 시 종료 우선.
- E2E 테스트.
  - 두 개 이상의 브라우저에서 같은 `timer_ends_at`, 최고 입찰자, 최고가 표시.
  - 0초 표시 시 입찰 버튼 비활성화.
  - 종료 알림에 입찰자 닉네임, 아이템, 낙찰가격 표시.

## 이번 테스트 페이지 범위

`/auction-timer-lab` 페이지는 배포 환경에서 `timerLabs/{labId}`와 `timerLabSignals/{labId}`를 사용하는 전용 테스트 랩이다. 운영 `rooms/{roomId}`와 `signals/{roomId}` 경로는 사용하지 않는다. 쓰기는 서버 액션만 수행하고 클라이언트는 Firestore/RTDB를 구독한다.
