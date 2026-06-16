// Firebase 클라이언트 인증 헬퍼의 실패 메시지를 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authMock,
  fetchMock,
  signInWithCustomTokenMock,
} = vi.hoisted(() => ({
  authMock: {
    currentUser: null,
  },
  fetchMock: vi.fn(),
  signInWithCustomTokenMock: vi.fn(),
}))

vi.mock('firebase/app', () => ({
  getApps: () => [],
  getApp: () => ({}),
  initializeApp: () => ({}),
}))

vi.mock('firebase/auth', () => ({
  connectAuthEmulator: vi.fn(),
  getAuth: () => authMock,
  getIdTokenResult: vi.fn(),
  signInWithCustomToken: signInWithCustomTokenMock,
}))

vi.mock('firebase/firestore', () => ({
  connectFirestoreEmulator: vi.fn(),
  getFirestore: () => ({}),
}))

const { ensureRoomFirebaseAuth } = await import('./firebase')

beforeEach(() => {
  vi.clearAllMocks()
  authMock.currentUser = null
  vi.stubGlobal('fetch', fetchMock)
})

describe('ensureRoomFirebaseAuth', () => {
  it('서버가 반환한 일반화된 오류 메시지를 token 요청 실패에 포함한다', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'firebase auth unavailable' }),
    })

    await expect(ensureRoomFirebaseAuth({
      roomId: 'room-1',
      role: 'ORGANIZER',
      token: 'organizer-token',
    })).rejects.toThrow('Firebase auth token request failed: 500: firebase auth unavailable')
    expect(signInWithCustomTokenMock).not.toHaveBeenCalled()
  })
})
