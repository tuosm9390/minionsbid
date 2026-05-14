// 주최자 서버 인증 헬퍼의 쿠키 및 토큰 검증을 테스트한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ORGANIZER_AUTH_ERROR, requireRoomOrganizer } from '@/features/auction/api/organizerAuth'

const { mockCookieGet, mockRoomGet, mockRoomAuthGet } = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockRoomGet: vi.fn(),
  mockRoomAuthGet: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: mockCookieGet,
  })),
}))

vi.mock('@/features/auction/api/e2eAuctionFixture', () => ({
  isE2EAuctionFixtureEnabled: vi.fn(() => false),
  verifyE2EAuctionFixtureAccess: vi.fn(() => false),
}))

vi.mock('@/features/auction/realtime/serverAdapter', () => ({
  getAuctionServerServices: vi.fn(() => ({
    firestore: {
      collection: vi.fn((collectionName: string) => ({
        doc: vi.fn(() => ({
          get: collectionName === 'rooms' ? mockRoomGet : mockRoomAuthGet,
        })),
      })),
    },
  })),
}))

describe('requireRoomOrganizer', () => {
  beforeEach(() => {
    mockCookieGet.mockReset()
    mockRoomGet.mockReset()
    mockRoomAuthGet.mockReset()
  })

  it('주최자 쿠키가 없으면 권한 오류를 반환한다', async () => {
    mockCookieGet.mockReturnValue(undefined)

    await expect(requireRoomOrganizer('room-1')).resolves.toBe(ORGANIZER_AUTH_ERROR)
    expect(mockRoomGet).not.toHaveBeenCalled()
    expect(mockRoomAuthGet).not.toHaveBeenCalled()
  })

  it('주최자 쿠키 토큰이 저장된 토큰과 일치하면 통과한다', async () => {
    mockCookieGet.mockReturnValue({
      value: JSON.stringify({
        role: 'ORGANIZER',
        teamId: null,
        token: 'organizer-token',
      }),
    })
    mockRoomGet.mockResolvedValue({
      exists: true,
      data: () => ({}),
    })
    mockRoomAuthGet.mockResolvedValue({
      exists: true,
      data: () => ({ organizer_token: 'organizer-token' }),
    })

    await expect(requireRoomOrganizer('room-1')).resolves.toBeNull()
  })

  it('주최자 쿠키 토큰이 저장된 토큰과 다르면 권한 오류를 반환한다', async () => {
    mockCookieGet.mockReturnValue({
      value: JSON.stringify({
        role: 'ORGANIZER',
        teamId: null,
        token: 'wrong-token',
      }),
    })
    mockRoomGet.mockResolvedValue({
      exists: true,
      data: () => ({}),
    })
    mockRoomAuthGet.mockResolvedValue({
      exists: true,
      data: () => ({ organizer_token: 'organizer-token' }),
    })

    await expect(requireRoomOrganizer('room-1')).resolves.toBe(ORGANIZER_AUTH_ERROR)
  })
})
