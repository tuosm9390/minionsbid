# 비공개 입찰 구현 컨텍스트 노트

- 공개 입찰 기능은 기존 계약을 유지한다. `active_bid`, `BID_PLACED`, `placeBidDirect`, 공개 입찰 `placeBid`, 공개 입찰 `awardPlayer` 기본 동작은 수정하지 않고, `auction_mode === "SEALED_BID"`일 때만 별도 경로를 탄다.
- 비공개 입찰 제출 금액과 제출 여부는 타이머 중 주최자와 다른 팀장에게 노출하지 않는다. 클라이언트 전체 구독 컬렉션에 제출 문서를 그대로 추가하지 않고 서버 액션에서 집계한다.
- 점수공개 시점에는 공개 결과만 확정한다. 선수 SOLD 처리와 팀 포인트 차감은 카드 애니메이션 완료 후 호출되는 별도 확정 액션에서 수행한다.
- 최고가 동점이면 같은 선수에 대해 동점 팀만 재입찰한다. 재입찰 최소 금액은 직전 최고 동점 금액이며 재입찰 횟수 제한은 두지 않는다.
- `startAuction()`은 `auction_mode === "SEALED_BID"`일 때 `startSealedBidRound()`로 분기한다. 공개 입찰의 기존 시작/입찰/낙찰 함수 본문은 공개 방식에서 그대로 유지한다.
- 비공개 제출은 RTDB 이벤트를 발행하지 않는다. 이벤트는 시작, 잠금, 점수공개, 확정, 재입찰 시작 단계에만 발행한다.
- `useAuctionControl()`의 공개 입찰 자동 낙찰 타이머는 비공개 입찰 방에서 실행되지 않도록 차단했다. 비공개 방의 만료는 `lockSealedBidRound()`와 `recoverExpiredAuction()`의 mode 분기가 담당한다.
- 검증 중 `npm run test` 전체 실행은 기존 공개 입찰 컨트롤 기대값 1건과 LotteryAnimation 텍스트 매칭 3건에서 실패했다. 이번 변경 파일이 아닌 `useBiddingControl.ts`와 `LotteryAnimation.tsx` 동작/테스트의 기존 불일치로 보이며, 관련 변경 범위의 `auctionRealtimeUtils`, `auctionActions`, `useAuctionControl` 테스트는 통과했다.
