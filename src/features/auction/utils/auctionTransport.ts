// 경매 realtime transport 모드의 정규화와 분기 기준을 제공한다.
export type AuctionTransport =
  | 'FIREBASE'
  | 'SOCKET_SHADOW'
  | 'SOCKET_CANARY'
  | 'SOCKET'

const AUCTION_TRANSPORTS: AuctionTransport[] = [
  'FIREBASE',
  'SOCKET_SHADOW',
  'SOCKET_CANARY',
  'SOCKET',
]

export function normalizeAuctionTransport(value: unknown): AuctionTransport {
  return AUCTION_TRANSPORTS.includes(value as AuctionTransport)
    ? (value as AuctionTransport)
    : 'FIREBASE'
}

export function isSocketPrimaryTransport(value: unknown): boolean {
  const transport = normalizeAuctionTransport(value)
  return transport === 'SOCKET_CANARY' || transport === 'SOCKET'
}
