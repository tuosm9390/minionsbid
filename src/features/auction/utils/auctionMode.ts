// 경매방의 입찰 방식을 정의하는 공통 타입과 정규화 헬퍼
export type AuctionMode = 'OPEN_ASCENDING' | 'SEALED_BID'

export function normalizeAuctionMode(value: unknown): AuctionMode {
  return value === 'SEALED_BID' ? 'SEALED_BID' : 'OPEN_ASCENDING'
}

export const AUCTION_MODE_LABEL: Record<AuctionMode, string> = {
  OPEN_ASCENDING: '실시간 공개 입찰',
  SEALED_BID: '비공개 입찰',
}
