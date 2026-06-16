// 방 Firebase custom token route의 권한 검증과 서버 오류 응답을 검증한다.
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createCustomTokenMock,
  firestoreCollectionMock,
  roomGetMock,
  roomAuthGetMock,
  teamGetMock,
  teamTokenGetMock,
} = vi.hoisted(() => ({
  createCustomTokenMock: vi.fn(),
  firestoreCollectionMock: vi.fn(),
  roomGetMock: vi.fn(),
  roomAuthGetMock: vi.fn(),
  teamGetMock: vi.fn(),
  teamTokenGetMock: vi.fn(),
}))

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    createCustomToken: createCustomTokenMock,
  }),
}))

vi.mock('@/lib/firebaseAdmin', () => ({}))

vi.mock('@/features/auction/realtime/serverAdapter', () => ({
  getAuctionServerServices: () => ({
    firestore: {
      collection: firestoreCollectionMock,
    },
  }),
}))

vi.mock('@/features/auction/api/e2eAuctionFixture', () => ({
  isE2EAuctionFixtureEnabled: () => false,
  verifyE2EAuctionFixtureAccess: () => false,
}))

const { POST } = await import('../route')

const ORIGIN = 'https://example.com'

function makeRequest(body: unknown) {
  return new NextRequest(`${ORIGIN}/api/room-auth/firebase-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()

  const teamRef = {
    get: teamGetMock,
  }
  const teamTokensRef = {
    get: teamTokenGetMock,
  }
  const roomRef = {
    get: roomGetMock,
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(teamRef),
    }),
  }
  const roomAuthRef = {
    get: roomAuthGetMock,
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(teamTokensRef),
    }),
  }

  firestoreCollectionMock.mockImplementation((collectionName: string) => ({
    doc: vi.fn().mockReturnValue(collectionName === 'rooms' ? roomRef : roomAuthRef),
  }))

  roomGetMock.mockResolvedValue({ data: () => ({}) })
  roomAuthGetMock.mockResolvedValue({ data: () => ({ organizer_token: 'organizer-token' }) })
  teamGetMock.mockResolvedValue({ data: () => ({}) })
  teamTokenGetMock.mockResolvedValue({ data: () => ({ leader_token: 'leader-token' }) })
  createCustomTokenMock.mockResolvedValue('firebase-custom-token')
})

describe('POST /api/room-auth/firebase-token', () => {
  it('검증된 organizer token으로 Firebase custom token을 반환한다', async () => {
    const res = await POST(makeRequest({
      roomId: 'room-1',
      role: 'ORGANIZER',
      token: 'organizer-token',
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(createCustomTokenMock).toHaveBeenCalledWith(
      'room:room-1:ORGANIZER:none',
      { roomId: 'room-1', role: 'ORGANIZER', teamId: null },
    )
    expect(body.token).toBe('firebase-custom-token')
  })

  it('room token이 맞지 않으면 Firebase custom token을 만들지 않는다', async () => {
    const res = await POST(makeRequest({
      roomId: 'room-1',
      role: 'ORGANIZER',
      token: 'wrong-token',
    }))

    expect(res.status).toBe(403)
    expect(createCustomTokenMock).not.toHaveBeenCalled()
  })

  it('Firebase Admin 실패는 비밀값 없는 일반 오류로 반환한다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    createCustomTokenMock.mockRejectedValueOnce(new Error('private key invalid'))

    const res = await POST(makeRequest({
      roomId: 'room-1',
      role: 'ORGANIZER',
      token: 'organizer-token',
    }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ error: 'firebase auth unavailable' })
    expect(consoleError).toHaveBeenCalledWith(
      '[room-auth] firebase token request failed',
      {
        roomId: 'room-1',
        role: 'ORGANIZER',
        teamId: null,
        message: 'private key invalid',
      },
    )

    consoleError.mockRestore()
  })
})
