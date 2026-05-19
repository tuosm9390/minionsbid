import { beforeEach, describe, expect, it, vi } from 'vitest'

type DocData = Record<string, unknown>

const serverTimestampValue = { _methodName: 'serverTimestamp' }

const dbState = vi.hoisted(() => ({
  auctionArchives: new Map<string, DocData>(),
  hallOfFame: new Map<string, DocData>(),
}))

const resetState = () => {
  dbState.auctionArchives.clear()
  dbState.hallOfFame.clear()
}

const createTimestamp = (value: Date | number | string) => {
  const date = value instanceof Date ? value : new Date(value)
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  }
}

const materialize = (value: unknown): unknown => {
  if (value === serverTimestampValue) {
    return createTimestamp(new Date('2026-04-27T12:00:00.000Z'))
  }
  if (Array.isArray(value)) return value.map(materialize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        materialize(entry),
      ]),
    )
  }
  return value
}

const createDocSnapshot = (id: string, data?: DocData | null) => ({
  id,
  exists: Boolean(data),
  data: () => (data ? data : undefined),
})

const createQuerySnapshot = (docs: Array<{ id: string; data: DocData }>) => ({
  empty: docs.length === 0,
  size: docs.length,
  docs: docs.map((doc) => ({
    id: doc.id,
    data: () => doc.data,
  })),
})

function buildDocRef(collectionName: string, docId: string) {
  return {
    id: docId,
    async get() {
      if (collectionName === 'auction_archives') {
        return createDocSnapshot(docId, dbState.auctionArchives.get(docId))
      }
      if (collectionName === 'hall_of_fame') {
        return createDocSnapshot(docId, dbState.hallOfFame.get(docId))
      }
      return createDocSnapshot(docId, null)
    },
    async set(data: DocData) {
      if (collectionName === 'hall_of_fame') {
        dbState.hallOfFame.set(docId, materialize(data) as DocData)
      }
    },
    async delete() {
      if (collectionName === 'hall_of_fame') dbState.hallOfFame.delete(docId)
    },
  }
}

function buildCollectionRef(
  collectionName: string,
  filters: Array<{ field: string; op: string; value: unknown }> = [],
  resultLimit?: number,
) {
  return {
    doc(docId: string) {
      return buildDocRef(collectionName, docId)
    },
    orderBy() {
      return this
    },
    where(field: string, op: string, value: unknown) {
      return buildCollectionRef(collectionName, [...filters, { field, op, value }], resultLimit)
    },
    limit(limitValue: number) {
      return buildCollectionRef(collectionName, filters, limitValue)
    },
    async get() {
      if (collectionName === 'auction_archives') {
        const docs = Array.from(dbState.auctionArchives.entries()).map(([id, data]) => ({
          id,
          data,
        }))
        return createQuerySnapshot(
          typeof resultLimit === 'number' ? docs.slice(0, resultLimit) : docs,
        )
      }
      if (collectionName === 'hall_of_fame') {
        const docs = Array.from(dbState.hallOfFame.entries())
          .map(([id, data]) => ({
            id,
            data,
          }))
          .filter((doc) =>
            filters.every((filter) => {
              if (filter.op !== '==') return false
              return doc.data[filter.field] === filter.value
            }),
          )
        return createQuerySnapshot(
          typeof resultLimit === 'number' ? docs.slice(0, resultLimit) : docs,
        )
      }
      return createQuerySnapshot([])
    },
  }
}

type MockTransaction = {
  get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>
  set: (ref: { set: (data: DocData) => Promise<void> }, data: DocData) => Promise<void>
}

const mockRunTransaction = vi.fn(async (fn: (tx: MockTransaction) => Promise<unknown>) => {
  const tx = {
    get: (ref: { get: () => Promise<unknown> }) => ref.get(),
    set: (ref: { set: (data: DocData) => Promise<void> }, data: DocData) =>
      ref.set(data),
  }
  return fn(tx)
})

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: (name: string) => buildCollectionRef(name),
    runTransaction: mockRunTransaction,
  },
}))

vi.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => serverTimestampValue,
    },
  },
}))

const VALID_CODE = 'secret-code-123'

const seedArchive = () => {
  dbState.auctionArchives.set('arc1', {
    room_id: 'room1',
    room_name: '제1회 리그',
    closed_at: createTimestamp('2025-01-01T00:00:00.000Z'),
    result_snapshot: [
      {
        id: 'team-a',
        name: '팀A',
        leader_name: '홍길동',
        players: [{ name: '선수1', sold_price: 100 }],
      },
    ],
  })
}

describe('hallOfFameActions', () => {
  beforeEach(() => {
    resetState()
    mockRunTransaction.mockClear()
    vi.resetModules()
    vi.stubEnv('HALL_OF_FAME_ADMIN_CODE', VALID_CODE)
  })

  describe('registerHallOfFameEntry', () => {
    it('잘못된 관리자 코드 → error 반환', async () => {
      seedArchive()
      const { registerHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await registerHallOfFameEntry(
        {
          archiveId: 'arc1',
          teamId: 'team-a',
          seasonName: '제1회 리그',
        },
        'wrong-code',
      )

      expect(result.error).toBe('관리자 코드가 올바르지 않습니다.')
      expect(dbState.hallOfFame.size).toBe(0)
    })

    it('올바른 관리자 코드 → 서버 archive 값으로 deterministic 문서 저장', async () => {
      seedArchive()

      const { registerHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await registerHallOfFameEntry(
        {
          archiveId: 'arc1',
          teamId: 'team-a',
          seasonName: '조작된 시즌명',
          seasonLabel: '26년 상반기',
        },
        VALID_CODE,
      )

      expect(result.error).toBeUndefined()
      expect(mockRunTransaction).toHaveBeenCalledOnce()
      expect(dbState.hallOfFame.has('archive:arc1')).toBe(true)
      expect(dbState.hallOfFame.get('archive:arc1')).toMatchObject({
        archive_id: 'arc1',
        room_id: 'room1',
        season_name: '조작된 시즌명',
        season_label: '26년 상반기',
        winning_team_name: '팀A',
        winning_team_leader: '홍길동',
        won_at: '2025-01-01T00:00:00.000Z',
        winning_team_players: [{ name: '선수1', sold_price: 100 }],
      })
    })

    it('존재하지 않는 archive는 저장하지 않는다', async () => {
      const { registerHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await registerHallOfFameEntry(
        {
          archiveId: 'missing-archive',
          teamId: 'team-a',
          seasonName: '제1회 리그',
        },
        VALID_CODE,
      )

      expect(result.error).toBe('등록할 경매 기록을 찾을 수 없습니다.')
      expect(dbState.hallOfFame.size).toBe(0)
    })

    it('archive에 없는 팀은 저장하지 않는다', async () => {
      seedArchive()

      const { registerHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await registerHallOfFameEntry(
        {
          archiveId: 'arc1',
          teamId: 'team-b',
          teamName: '팀B',
          seasonName: '제1회 리그',
        },
        VALID_CODE,
      )

      expect(result.error).toBe('우승팀 정보를 찾을 수 없습니다.')
      expect(dbState.hallOfFame.size).toBe(0)
    })

    it('같은 archive 중복 등록을 거부한다', async () => {
      seedArchive()
      dbState.hallOfFame.set('archive:arc1', {
        archive_id: 'arc1',
        winning_team_name: '팀A',
      })

      const { registerHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await registerHallOfFameEntry(
        {
          archiveId: 'arc1',
          teamId: 'team-a',
          seasonName: '제1회 리그',
        },
        VALID_CODE,
      )

      expect(result.error).toBe('이미 명예의 전당에 등록된 경매입니다.')
    })

    it('legacy random id 문서가 같은 archive_id를 가진 경우에도 중복 등록을 거부한다', async () => {
      seedArchive()
      dbState.hallOfFame.set('legacy-random-id', {
        archive_id: 'arc1',
        winning_team_name: '팀A',
      })

      const { registerHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await registerHallOfFameEntry(
        {
          archiveId: 'arc1',
          teamId: 'team-a',
          seasonName: '제1회 리그',
        },
        VALID_CODE,
      )

      expect(result.error).toBe('이미 명예의 전당에 등록된 경매입니다.')
      expect(dbState.hallOfFame.has('archive:arc1')).toBe(false)
    })
  })

  it('getAuctionArchivesForHof excludes all registered archives without a 200 item cutoff', async () => {
    seedArchive()
    dbState.auctionArchives.set('arc-visible', {
      room_id: 'room-visible',
      room_name: '표시 리그',
      closed_at: createTimestamp('2025-02-01T00:00:00.000Z'),
      result_snapshot: [],
    })
    Array.from({ length: 201 }).forEach((_, index) => {
      dbState.hallOfFame.set(`legacy-${index}`, {
        archive_id: index === 200 ? 'arc1' : `old-${index}`,
      })
    })

    const { getAuctionArchivesForHof } = await import('../hallOfFameActions')
    const result = await getAuctionArchivesForHof()

    expect(result.map((archive) => archive.id)).toEqual(['arc-visible'])
  })

  describe('deleteHallOfFameEntry', () => {
    it('잘못된 관리자 코드 → error 반환', async () => {
      dbState.hallOfFame.set('entry1', { archive_id: 'arc1' })
      const { deleteHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await deleteHallOfFameEntry('entry1', 'wrong-code')

      expect(result.error).toBe('관리자 코드가 올바르지 않습니다.')
      expect(dbState.hallOfFame.has('entry1')).toBe(true)
    })

    it('올바른 관리자 코드 → 문서 삭제', async () => {
      dbState.hallOfFame.set('entry1', { archive_id: 'arc1' })
      const { deleteHallOfFameEntry } = await import('../hallOfFameActions')
      const result = await deleteHallOfFameEntry('entry1', VALID_CODE)

      expect(result.error).toBeUndefined()
      expect(dbState.hallOfFame.has('entry1')).toBe(false)
    })
  })
})
