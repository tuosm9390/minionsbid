/** 경매 타이머 및 입찰 연장에 사용되는 서버/클라이언트 공유 타이밍 상수 */
export const AUCTION_DURATION_MS = 10_000;
export const RE_AUCTION_DURATION_MS = 5_000;
export const EXTEND_THRESHOLD_MS = 5_000;
/** 클라이언트 표시 5초 경계에서 네트워크 지연을 보정하는 grace window */
export const EXTEND_THRESHOLD_GRACE_MS = 750;
export const EXTEND_DURATION_MS = 5_000;
