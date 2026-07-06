// 경매 realtime transport 모드 정규화 계약을 검증한다.
import { describe, expect, it } from 'vitest'
import {
  isSocketPrimaryTransport,
  normalizeAuctionTransport,
} from '@/features/auction/utils/auctionTransport'

describe('auctionTransport', () => {
  it('빈 값과 알 수 없는 값은 Firebase transport로 정규화한다', () => {
    expect(normalizeAuctionTransport(undefined)).toBe('FIREBASE')
    expect(normalizeAuctionTransport(null)).toBe('FIREBASE')
    expect(normalizeAuctionTransport('redis')).toBe('FIREBASE')
  })

  it('Socket shadow와 primary transport를 구분한다', () => {
    expect(normalizeAuctionTransport('SOCKET_SHADOW')).toBe('SOCKET_SHADOW')
    expect(isSocketPrimaryTransport('SOCKET_SHADOW')).toBe(false)
    expect(isSocketPrimaryTransport('SOCKET_CANARY')).toBe(true)
    expect(isSocketPrimaryTransport('SOCKET')).toBe(true)
  })
})
