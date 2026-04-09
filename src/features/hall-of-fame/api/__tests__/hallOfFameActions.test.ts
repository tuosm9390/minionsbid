import { describe, it, expect, vi, beforeEach } from 'vitest'

// Firebase Admin mock
const mockAdd = vi.fn()
const mockGet = vi.fn()
const mockDelete = vi.fn()
const mockOrderBy = vi.fn()
const mockLimit = vi.fn()
const mockDoc = vi.fn()

const mockDocRef = () => ({ delete: mockDelete })
mockDoc.mockImplementation(mockDocRef)

const mockCollection = vi.fn(() => ({
  add: mockAdd,
  orderBy: mockOrderBy,
  get: mockGet,
  doc: mockDoc,
}))

mockOrderBy.mockReturnValue({ limit: mockLimit, get: mockGet })
mockLimit.mockReturnValue({ get: mockGet })

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: mockCollection,
  },
}))

vi.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: vi.fn(() => ({ _seconds: 0 })),
    },
  },
}))

// 'use server' 지시어가 있는 모듈은 직접 import
// Next.js 서버 액션 환경 외부에서 테스트하기 위해 vi.importActual 사용
const VALID_CODE = 'secret-code-123'

describe('hallOfFameActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('HALL_OF_FAME_ADMIN_CODE', VALID_CODE)
    mockOrderBy.mockReturnValue({ limit: mockLimit, get: mockGet })
    mockLimit.mockReturnValue({ get: mockGet })
    mockDoc.mockImplementation(mockDocRef)
    mockCollection.mockReturnValue({
      add: mockAdd,
      orderBy: mockOrderBy,
      get: mockGet,
      doc: mockDoc,
    })
  })

  describe('registerHallOfFameEntry', () => {
    it('잘못된 관리자 코드 → error 반환', async () => {
      const { registerHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await registerHallOfFameEntry(
        {
          archive_id: 'arc1',
          room_id: 'room1',
          season_name: '제1회 리그',
          winning_team_name: '팀A',
          winning_team_leader: '홍길동',
          winning_team_players: [],
          won_at: '2025-01-01T00:00:00Z',
        },
        'wrong-code'
      )
      expect(result.error).toBe('관리자 코드가 올바르지 않습니다.')
      expect(mockAdd).not.toHaveBeenCalled()
    })

    it('올바른 관리자 코드 → hall_of_fame에 저장', async () => {
      mockAdd.mockResolvedValue({ id: 'new-entry-id' })

      const { registerHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await registerHallOfFameEntry(
        {
          archive_id: 'arc1',
          room_id: 'room1',
          season_name: '제1회 리그',
          winning_team_name: '팀A',
          winning_team_leader: '홍길동',
          winning_team_players: [{ name: '선수1', sold_price: 100 }],
          won_at: '2025-01-01T00:00:00Z',
        },
        VALID_CODE
      )
      expect(result.error).toBeUndefined()
      expect(mockAdd).toHaveBeenCalledOnce()
    })
  })

  describe('deleteHallOfFameEntry', () => {
    it('잘못된 관리자 코드 → error 반환', async () => {
      const { deleteHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await deleteHallOfFameEntry('entry1', 'wrong-code')
      expect(result.error).toBe('관리자 코드가 올바르지 않습니다.')
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('올바른 관리자 코드 → 문서 삭제', async () => {
      mockDelete.mockResolvedValue(undefined)

      const { deleteHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await deleteHallOfFameEntry('entry1', VALID_CODE)
      expect(result.error).toBeUndefined()
      expect(mockDelete).toHaveBeenCalledOnce()
    })
  })
})
