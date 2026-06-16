// Firebase Admin 초기화 실패가 모듈 로딩을 막지 않는지 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  certMock,
  getAppMock,
  getAppsMock,
  getFirestoreMock,
  initializeAppMock,
} = vi.hoisted(() => ({
  certMock: vi.fn(),
  getAppMock: vi.fn(),
  getAppsMock: vi.fn(),
  getFirestoreMock: vi.fn(),
  initializeAppMock: vi.fn(),
}))

vi.mock('firebase-admin/app', () => ({
  cert: certMock,
  getApp: getAppMock,
  getApps: getAppsMock,
  initializeApp: initializeAppMock,
}))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: getFirestoreMock,
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('firebaseAdmin', () => {
  it('따옴표로 감싼 escaped private key를 Firebase credential 형식으로 정규화한다', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'project-1')
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'firebase-admin@example.test')
    vi.stubEnv('FIREBASE_PRIVATE_KEY', '"-----BEGIN PRIVATE KEY-----\\nkey-body\\n-----END PRIVATE KEY-----\\n"')
    getAppsMock.mockReturnValue([])
    certMock.mockReturnValue({ credential: true })

    await import('./firebaseAdmin')

    expect(certMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      clientEmail: 'firebase-admin@example.test',
      privateKey: '-----BEGIN PRIVATE KEY-----\nkey-body\n-----END PRIVATE KEY-----\n',
    })
    expect(initializeAppMock).toHaveBeenCalledWith({
      credential: { credential: true },
      databaseURL: undefined,
    })
  })

  it('credential 초기화 실패 시 import는 성공하고 getAdminDb에서 설정 오류를 반환한다', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'project-1')
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'firebase-admin@example.test')
    vi.stubEnv('FIREBASE_PRIVATE_KEY', 'invalid-private-key')
    getAppsMock.mockReturnValue([])
    certMock.mockImplementation(() => {
      throw new Error('Failed to parse private key')
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { getAdminDb } = await import('./firebaseAdmin')

    expect(() => getAdminDb()).toThrow('Firebase Admin 초기화에 실패했습니다: Failed to parse private key')
    expect(consoleError).toHaveBeenCalledWith('[firebaseAdmin] 초기화 실패:', {
      FIREBASE_PROJECT_ID: 'SET',
      FIREBASE_CLIENT_EMAIL: 'SET',
      FIREBASE_PRIVATE_KEY: 'SET (length: 19)',
      message: 'Failed to parse private key',
    })
  })
})
