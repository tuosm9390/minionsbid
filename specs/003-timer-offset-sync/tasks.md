# Tasks: 003 Timer Offset & Sync

- [ ] `useServerTimeOffset.ts` 훅(또는 기능) 구현
  - Firebase RTDB `.info/serverTimeOffset` 구독 및 `offset` 상태 노출.
  - 전역 상태 관리 혹은 Provider 형태로 앱 전반에 걸쳐 공유하는 방안 고려.
- [ ] `placeBidClient.ts`의 입찰 트랜잭션 로직 업데이트
  - [ ] 트랜잭션 진입 시 추정 서버 시간(`estimatedServerNow`) 캡처.
  - [ ] `Grace Period(500ms)`를 반영한 만료 시간 비교 구문 수정.
  - [ ] `Math.max()`를 활용하여 `targetEndTime`과 `existingEndTime` 중 큰 값으로 갱신하는 로직 추가.
- [ ] `useBiddingControl.ts` (또는 낙관적 업데이트 부분) 수정
  - [ ] `getServerTime()`을 통해 클릭 시점의 추정 서버 시간으로 `optimisticTimer` +5초 설정.
  - [ ] 서버에서 갱신된 타이머 수신 시 300ms 오차 이내면 무시하는 `Anti-Jitter` 적용 로직 추가.
- [ ] 타이머 디스플레이 컴포넌트(`LotteryAnimation.tsx` 또는 `AuctionBoard.tsx` 등) 검토
  - `requestAnimationFrame`과 `getServerTime()`을 이용해 부드러운 카운트다운을 그리고 있는지 확인.
- [ ] (선택) Firestore Database Rules (`firestore.rules`) 보안 규칙 업데이트
  - 타이머 조작 방어를 위한 규칙 (`request.time` 기준 +5초 초과 방지) 작성.
