import { beforeEach, describe, expect, it, vi } from 'vitest'

type DocData = Record<string, unknown>

const serverTimestampValue = { _methodName: 'serverTimestamp' }

const dbState = vi.hoisted(() => ({
  leagueSchedules: new Map<string, DocData>(),
  matchDays: new Map<string, Map<string, DocData>>(),
  deeplolParticipants: new Map<string, Map<string, DocData>>(),
  auctionArchives: new Map<string, DocData>(),
  hallOfFame: new Map<string, DocData>(),
  recursiveDeleteCalls: [] as string[],
  orderByCalls: [] as Array<{ collectionName: string; field: string; direction?: string }>,
}))

const resetState = () => {
  dbState.leagueSchedules.clear()
  dbState.matchDays.clear()
  dbState.deeplolParticipants.clear()
  dbState.auctionArchives.clear()
  dbState.hallOfFame.clear()
  dbState.recursiveDeleteCalls.length = 0
  dbState.orderByCalls.length = 0
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
  if (Array.isArray(value)) {
    return value.map(materialize)
  }
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
    ref: { id: doc.id },
  })),
})

const getDeeplolParticipantMap = (scheduleId: string) => {
  let map = dbState.deeplolParticipants.get(scheduleId)
  if (!map) {
    map = new Map<string, DocData>()
    dbState.deeplolParticipants.set(scheduleId, map)
  }
  return map
}

const getMatchDayMap = (scheduleId: string) => {
  let map = dbState.matchDays.get(scheduleId)
  if (!map) {
    map = new Map<string, DocData>()
    dbState.matchDays.set(scheduleId, map)
  }
  return map
}

const mergeDocData = (current: DocData | undefined, patch: DocData) => ({
  ...(current ?? {}),
  ...(materialize(patch) as DocData),
})

function buildDocRef(
  collectionName: string,
  docId: string,
  parentId?: string,
): Record<string, unknown> {
  const docRef = {
    id: docId,
    async get() {
      if (collectionName === 'league_schedules') {
        return createDocSnapshot(docId, dbState.leagueSchedules.get(docId))
      }
      if (collectionName === 'auction_archives') {
        return createDocSnapshot(docId, dbState.auctionArchives.get(docId))
      }
      if (collectionName === 'hall_of_fame') {
        return createDocSnapshot(docId, dbState.hallOfFame.get(docId))
      }
      if (collectionName === 'match_days' && parentId) {
        return createDocSnapshot(docId, getMatchDayMap(parentId).get(docId))
      }
      if (collectionName === 'deeplol_participants' && parentId) {
        return createDocSnapshot(docId, getDeeplolParticipantMap(parentId).get(docId))
      }
      return createDocSnapshot(docId, null)
    },
    async set(data: DocData, options?: { merge?: boolean }) {
      if (collectionName === 'league_schedules') {
        const current = dbState.leagueSchedules.get(docId)
        dbState.leagueSchedules.set(
          docId,
          options?.merge ? mergeDocData(current, data) : (materialize(data) as DocData),
        )
      }
      if (collectionName === 'hall_of_fame') {
        const current = dbState.hallOfFame.get(docId)
        dbState.hallOfFame.set(
          docId,
          options?.merge ? mergeDocData(current, data) : (materialize(data) as DocData),
        )
      }
      if (collectionName === 'match_days' && parentId) {
        const map = getMatchDayMap(parentId)
        const current = map.get(docId)
        map.set(
          docId,
          options?.merge ? mergeDocData(current, data) : (materialize(data) as DocData),
        )
      }
      if (collectionName === 'deeplol_participants' && parentId) {
        const map = getDeeplolParticipantMap(parentId)
        const current = map.get(docId)
        map.set(
          docId,
          options?.merge ? mergeDocData(current, data) : (materialize(data) as DocData),
        )
      }
    },
    async update(data: DocData) {
      await docRef.set(data, { merge: true })
    },
    async delete() {
      if (collectionName === 'hall_of_fame') dbState.hallOfFame.delete(docId)
      if (collectionName === 'league_schedules') dbState.leagueSchedules.delete(docId)
      if (collectionName === 'match_days' && parentId) {
        getMatchDayMap(parentId).delete(docId)
      }
      if (collectionName === 'deeplol_participants' && parentId) {
        getDeeplolParticipantMap(parentId).delete(docId)
      }
    },
    collection(subCollectionName: string) {
      if (collectionName === 'league_schedules' && subCollectionName === 'match_days') {
        return buildCollectionRef('match_days', docId)
      }
      if (collectionName === 'league_schedules' && subCollectionName === 'deeplol_participants') {
        return buildCollectionRef('deeplol_participants', docId)
      }
      return buildCollectionRef(subCollectionName, docId)
    },
  }

  return docRef
}

function buildCollectionRef(collectionName: string, parentId?: string) {
  return {
    doc(docId?: string) {
      return buildDocRef(collectionName, docId ?? crypto.randomUUID(), parentId)
    },
    async add(data: DocData) {
      const id =
        collectionName === 'league_schedules'
          ? 'schedule-created'
          : collectionName === 'hall_of_fame'
            ? 'hof-created'
            : 'doc-created'
      const ref = buildDocRef(collectionName, id, parentId) as {
        set: (data: DocData) => Promise<void>
      }
      await ref.set(data)
      return { id, ...ref }
    },
    orderBy(field: string, direction?: string) {
      dbState.orderByCalls.push({ collectionName, field, direction })
      return this
    },
    where() {
      return this
    },
    limit() {
      return this
    },
    async get() {
      if (collectionName === 'league_schedules') {
        return createQuerySnapshot(
          Array.from(dbState.leagueSchedules.entries()).map(([id, data]) => ({
            id,
            data,
          })),
        )
      }
      if (collectionName === 'auction_archives') {
        return createQuerySnapshot(
          Array.from(dbState.auctionArchives.entries()).map(([id, data]) => ({
            id,
            data,
          })),
        )
      }
      if (collectionName === 'hall_of_fame') {
        return createQuerySnapshot(
          Array.from(dbState.hallOfFame.entries()).map(([id, data]) => ({
            id,
            data,
          })),
        )
      }
      if (collectionName === 'match_days' && parentId) {
        return createQuerySnapshot(
          Array.from(getMatchDayMap(parentId).entries()).map(([id, data]) => ({
            id,
            data,
          })),
        )
      }
      if (collectionName === 'deeplol_participants' && parentId) {
        return createQuerySnapshot(
          Array.from(getDeeplolParticipantMap(parentId).entries()).map(([id, data]) => ({
            id,
            data,
          })),
        )
      }
      return createQuerySnapshot([])
    },
  }
}

type MockTransaction = {
  get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>
  set: (
    ref: { set: (data: DocData, options?: { merge?: boolean }) => Promise<void> },
    data: DocData,
    options?: { merge?: boolean },
  ) => Promise<void>
  update: (
    ref: { update: (data: DocData) => Promise<void> },
    data: DocData,
  ) => Promise<void>
}

const mockBatch = () => {
  const operations: Array<{
    ref: { set: (data: DocData, options?: { merge?: boolean }) => Promise<void> }
    data: DocData
    options?: { merge?: boolean }
  }> = []
  return {
    set(ref: { set: (data: DocData, options?: { merge?: boolean }) => Promise<void> }, data: DocData, options?: { merge?: boolean }) {
      operations.push({ ref, data, options })
      return this
    },
    async commit() {
      for (const operation of operations) await operation.ref.set(operation.data, operation.options)
    },
  }
}

const mockRunTransaction = vi.fn(async (fn: (tx: MockTransaction) => Promise<unknown>) => {
  const tx = {
    get: (ref: { get: () => Promise<unknown> }) => ref.get(),
    set: (ref: { set: (data: DocData, options?: { merge?: boolean }) => Promise<void> }, data: DocData, options?: { merge?: boolean }) =>
      ref.set(data, options),
    update: (ref: { update: (data: DocData) => Promise<void> }, data: DocData) =>
      ref.update(data),
  }

  return fn(tx)
})

const mockRecursiveDelete = vi.fn(async (ref: { id: string }) => {
  dbState.recursiveDeleteCalls.push(ref.id)
  dbState.leagueSchedules.delete(ref.id)
  dbState.matchDays.delete(ref.id)
})

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: (name: string) => buildCollectionRef(name),
    runTransaction: mockRunTransaction,
    recursiveDelete: mockRecursiveDelete,
    batch: mockBatch,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => createTimestamp(new Date('2026-04-27T12:00:00.000Z')),
    fromDate: (date: Date) => createTimestamp(date),
  },
  FieldValue: {
    serverTimestamp: () => serverTimestampValue,
  },
}))

describe('scheduleActions', () => {
  beforeEach(() => {
    resetState()
    mockRunTransaction.mockClear()
    mockRecursiveDelete.mockClear()
    vi.resetModules()
    vi.stubEnv('HALL_OF_FAME_ADMIN_CODE', 'secret-code')
  })

  it('verifyScheduleAdminCode returns false for wrong code and true for valid code', async () => {
    const { verifyScheduleAdminCode } = await import('../scheduleActions')

    await expect(verifyScheduleAdminCode('wrong')).resolves.toEqual({ valid: false })
    await expect(verifyScheduleAdminCode('secret-code')).resolves.toEqual({ valid: true })
  })

  it('getLeagueScheduleCatalog requests recent schedules first', async () => {
    dbState.leagueSchedules.set('schedule-old', {
      name: 'Spring Split',
      starts_at: createTimestamp('2026-04-01T00:00:00.000Z'),
      ends_at: createTimestamp('2026-04-10T00:00:00.000Z'),
      status: 'ACTIVE',
    })
    dbState.leagueSchedules.set('schedule-new', {
      name: 'Summer Split',
      starts_at: createTimestamp('2026-05-01T00:00:00.000Z'),
      ends_at: createTimestamp('2026-05-10T00:00:00.000Z'),
      status: 'ACTIVE',
    })

    const { getLeagueScheduleCatalog } = await import('../scheduleActions')

    const result = await getLeagueScheduleCatalog()

    expect(result.schedules).toHaveLength(2)
    expect(dbState.orderByCalls).toContainEqual({
      collectionName: 'league_schedules',
      field: 'starts_at',
      direction: 'desc',
    })
  })

  it('createLeagueSchedule rejects requests without admin code', async () => {
    const { createLeagueSchedule } = await import('../scheduleActions')

    const result = await createLeagueSchedule({
      name: 'Spring Split',
      startsAt: '2026-04-01T00:00:00.000Z',
      endsAt: '2026-04-10T00:00:00.000Z',
    })

    expect(result.error).toBe('일정을 생성하려면 관리자 코드가 필요합니다.')
    expect(dbState.leagueSchedules.size).toBe(0)
  })

  it('createLeagueSchedule stores roster source metadata when admin code is valid', async () => {
    dbState.auctionArchives.set('archive-1', {
      room_name: '2026 스프링 경매',
      team_assignment: {
        status: 'CONFIRMED',
        assignments: [
          { auction_team_id: 'team-blue', assigned_team_id: 1 },
          { auction_team_id: 'team-red', assigned_team_id: 2 },
        ],
      },
      result_snapshot: [
        { id: 'team-blue', name: 'Blue', leader_name: 'Blue Captain', players: [] },
        { id: 'team-red', name: 'Red', leader_name: 'Red Captain', players: [] },
      ],
    })
    const { createLeagueSchedule } = await import('../scheduleActions')
    const expectedStart = new Date(2026, 3, 1, 0, 0, 0, 0).toISOString()
    const expectedEnd = new Date(2026, 3, 10, 0, 0, 0, 0).toISOString()

    const result = await createLeagueSchedule(
      {
        name: 'Spring Split',
        linkedAuctionId: 'archive-1',
        linkedLeagueName: '2026 스프링',
        rosterSourceType: 'archive',
        rosterSourceId: 'archive-1',
        startsAt: new Date(2026, 3, 1, 13, 30, 0, 0).toISOString(),
        endsAt: new Date(2026, 3, 10, 22, 15, 0, 0).toISOString(),
      },
      'secret-code',
    )

    expect(result.error).toBeUndefined()
    expect(result.schedule?.rosterSourceType).toBe('archive')
    expect(result.schedule?.rosterSourceId).toBe('archive-1')
    expect(result.schedule?.startsAt).toBe(expectedStart)
    expect(result.schedule?.endsAt).toBe(expectedEnd)
    expect(dbState.leagueSchedules.get('schedule-created')?.roster_source_id).toBe('archive-1')
    expect(
      (
        dbState.leagueSchedules.get('schedule-created')?.starts_at as {
          toDate: () => Date
        }
      ).toDate().toISOString(),
    ).toBe(expectedStart)
    expect(
      (
        dbState.leagueSchedules.get('schedule-created')?.ends_at as {
          toDate: () => Date
        }
      ).toDate().toISOString(),
    ).toBe(expectedEnd)
  })

  it('createLeagueSchedule rejects linked auction archives without confirmed team assignment', async () => {
    dbState.auctionArchives.set('archive-1', {
      room_name: '2026 스프링 경매',
      result_snapshot: [],
    })

    const { createLeagueSchedule } = await import('../scheduleActions')

    const result = await createLeagueSchedule(
      {
        name: 'Spring Split',
        linkedAuctionId: 'archive-1',
        rosterSourceType: 'archive',
        rosterSourceId: 'archive-1',
        startsAt: new Date(2026, 3, 1).toISOString(),
      },
      'secret-code',
    )

    expect(result.error).toBe('일정 생성 전 최종 팀 배정을 확정해주세요.')
    expect(dbState.leagueSchedules.size).toBe(0)
  })

  it('saveDeeplolParticipants rejects requests without admin code', async () => {
    const { saveDeeplolParticipants } = await import('../scheduleActions')

    const result = await saveDeeplolParticipants('schedule-1', [
      { puuId: 'puu-1', riotName: 'player', teamId: 'team-blue', teamName: 'Blue' },
    ])

    expect(result.error).toBe('Deeplol 구성원을 저장하려면 관리자 코드가 필요합니다.')
  })

  it('saveDeeplolParticipants stores normalized team mappings and member puuids', async () => {
    dbState.leagueSchedules.set('schedule-1', {
      name: 'Spring Split',
      roster_source_type: 'archive',
      roster_source_id: 'archive-1',
      starts_at: createTimestamp('2026-04-01T00:00:00.000Z'),
      ends_at: createTimestamp('2026-04-10T00:00:00.000Z'),
      status: 'ACTIVE',
    })
    dbState.auctionArchives.set('archive-1', {
      room_name: '2026 스프링 경매',
      result_snapshot: [
        { id: 'team-blue', name: 'Blue', leader_name: 'Blue Captain', players: [] },
      ],
    })

    const { saveDeeplolParticipants } = await import('../scheduleActions')
    const result = await saveDeeplolParticipants(
      'schedule-1',
      [
        {
          puuId: ' puu-1 ',
          riotName: 'player',
          riotTag: 'KR1',
          teamId: 'team-blue',
          teamName: '잘못된 표시 이름',
          position: 'Jungle',
        },
      ],
      'secret-code',
    )

    expect(result).toEqual({ savedCount: 1 })
    expect(dbState.leagueSchedules.get('schedule-1')?.deeplol_member_puu_ids).toEqual(['puu-1'])
    const saved = dbState.deeplolParticipants.get('schedule-1')
    expect(saved).toHaveLength(1)
    expect(Array.from(saved?.values() ?? [])[0]).toMatchObject({
      puu_id: 'puu-1',
      team_id: 'team-blue',
      team_name: 'Blue',
      status: 'ACTIVE',
    })
  })

  it('saveLeagueScheduleDay requires admin code and persists through a transaction', async () => {
    dbState.leagueSchedules.set('schedule-1', {
      name: 'Spring Split',
      roster_source_type: 'archive',
      roster_source_id: 'archive-1',
      starts_at: createTimestamp('2026-04-01T00:00:00.000Z'),
      ends_at: createTimestamp('2026-04-10T00:00:00.000Z'),
      status: 'ACTIVE',
    })
    dbState.auctionArchives.set('archive-1', {
      room_name: '2026 스프링 경매',
      result_snapshot: [
        { id: 'team-blue', name: 'Blue', leader_name: 'Blue Captain', players: [] },
        { id: 'team-red', name: 'Red', leader_name: 'Red Captain', players: [] },
      ],
    })
    getMatchDayMap('schedule-1').set('2026-04-03', {
      date_key: '2026-04-03',
      matches: [
        {
          id: 'match-1',
          starts_at: '19:00',
          home_team_name: 'Blue',
          away_team_name: 'Red',
          wins_to_clinch: 2,
          max_games: 3,
          set_logs: [
            { set_number: 1, winner: 'HOME', note: '1세트' },
            { set_number: 2, winner: 'AWAY', note: '2세트' },
            { set_number: 3, winner: 'HOME', note: '3세트' },
          ],
          home_score: 2,
          away_score: 1,
          winner: 'HOME',
          is_completed: true,
          note: '기존 결과',
          created_at: createTimestamp('2026-04-03T10:00:00.000Z'),
        },
      ],
      revision: 3,
    })

    const { saveLeagueScheduleDay } = await import('../scheduleActions')

    const denied = await saveLeagueScheduleDay(
      'schedule-1',
      {
        dateKey: '2026-04-03',
        matches: [
          {
            id: 'match-1',
            startsAt: '19:00',
            homeTeamName: 'Blue',
            awayTeamName: 'Red',
            winsToClinch: 2,
            maxGames: 3,
          },
        ],
      },
      undefined,
    )
    expect(denied.error).toBe('일정을 저장하려면 관리자 코드가 필요합니다.')

    const allowed = await saveLeagueScheduleDay(
      'schedule-1',
      {
        dateKey: '2026-04-03',
        matches: [
          {
            id: 'match-1',
            startsAt: '19:00',
            homeTeamName: 'Blue',
            awayTeamName: 'Red',
            winsToClinch: 2,
            maxGames: 3,
          },
        ],
      },
      'secret-code',
    )

    expect(allowed.error).toBeUndefined()
    expect(mockRunTransaction).toHaveBeenCalled()
    const saved = getMatchDayMap('schedule-1').get('2026-04-03')
    expect(saved?.revision).toBe(4)
    expect((saved?.matches as Array<Record<string, unknown>>)[0].winner).toBe('HOME')
    expect((saved?.matches as Array<Record<string, unknown>>)[0].note).toBe('기존 결과')
  })

  it('saveLeagueScheduleDay rejects dates outside the schedule range', async () => {
    dbState.leagueSchedules.set('schedule-1', {
      name: 'Spring Split',
      roster_source_type: 'archive',
      roster_source_id: 'archive-1',
      starts_at: createTimestamp('2026-04-01T00:00:00.000Z'),
      ends_at: createTimestamp('2026-04-10T00:00:00.000Z'),
      status: 'ACTIVE',
    })
    dbState.auctionArchives.set('archive-1', {
      room_name: '2026 스프링 경매',
      result_snapshot: [
        { id: 'team-blue', name: 'Blue', leader_name: 'Blue Captain', players: [] },
        { id: 'team-red', name: 'Red', leader_name: 'Red Captain', players: [] },
      ],
    })

    const { saveLeagueScheduleDay } = await import('../scheduleActions')
    const result = await saveLeagueScheduleDay(
      'schedule-1',
      {
        dateKey: '2026-04-11',
        matches: [
          {
            startsAt: '19:00',
            homeTeamName: 'Blue',
            awayTeamName: 'Red',
            winsToClinch: 2,
            maxGames: 3,
          },
        ],
      },
      'secret-code',
    )

    expect(result.error).toBe('일정 기간 안의 날짜만 저장할 수 있습니다.')
    expect(getMatchDayMap('schedule-1').has('2026-04-11')).toBe(false)
  })

  it('saveLeagueScheduleDay rejects teams outside the roster source and duplicate assignments', async () => {
    dbState.leagueSchedules.set('schedule-1', {
      name: 'Spring Split',
      roster_source_type: 'archive',
      roster_source_id: 'archive-1',
      starts_at: createTimestamp('2026-04-01T00:00:00.000Z'),
      status: 'ACTIVE',
    })
    dbState.auctionArchives.set('archive-1', {
      room_name: '2026 스프링 경매',
      result_snapshot: [
        { id: 'team-blue', name: 'Blue', leader_name: 'Blue Captain', players: [] },
        { id: 'team-red', name: 'Red', leader_name: 'Red Captain', players: [] },
      ],
    })

    const { saveLeagueScheduleDay } = await import('../scheduleActions')
    const unknownTeam = await saveLeagueScheduleDay(
      'schedule-1',
      {
        dateKey: '2026-04-03',
        matches: [
          {
            startsAt: '19:00',
            homeTeamName: 'Blue',
            awayTeamName: 'Green',
            winsToClinch: 2,
            maxGames: 3,
          },
        ],
      },
      'secret-code',
    )
    const duplicateTeam = await saveLeagueScheduleDay(
      'schedule-1',
      {
        dateKey: '2026-04-03',
        matches: [
          {
            startsAt: '19:00',
            homeTeamName: 'Blue',
            awayTeamName: 'Red',
            winsToClinch: 2,
            maxGames: 3,
          },
          {
            startsAt: '20:00',
            homeTeamName: 'Blue',
            awayTeamName: 'Red',
            winsToClinch: 2,
            maxGames: 3,
          },
        ],
      },
      'secret-code',
    )

    expect(unknownTeam.error).toBe('일정 로스터에 없는 팀은 저장할 수 없습니다.')
    expect(duplicateTeam.error).toBe('같은 날짜에 같은 팀을 여러 경기에 배정할 수 없습니다.')
  })

  it('registerLeagueMatchResult writes completed results through a transaction', async () => {
    dbState.leagueSchedules.set('schedule-1', {
      name: 'Spring Split',
      starts_at: createTimestamp('2026-04-01T00:00:00.000Z'),
      status: 'ACTIVE',
    })
    getMatchDayMap('schedule-1').set('2026-04-03', {
      date_key: '2026-04-03',
      matches: [
        {
          id: 'match-1',
          starts_at: '19:00',
          home_team_name: 'Blue',
          away_team_name: 'Red',
          wins_to_clinch: 2,
          max_games: 3,
          set_logs: [],
          home_score: 0,
          away_score: 0,
          winner: 'PENDING',
          is_completed: false,
          note: '',
        },
      ],
      revision: 1,
    })

    const { registerLeagueMatchResult } = await import('../scheduleActions')

    const result = await registerLeagueMatchResult({
      scheduleId: 'schedule-1',
      dateKey: '2026-04-03',
      matchId: 'match-1',
      homeScore: 2,
      awayScore: 1,
      note: '세트 스코어 확정',
      adminCode: 'secret-code',
    })

    expect(result.error).toBeUndefined()
    expect(mockRunTransaction).toHaveBeenCalled()
    const saved = getMatchDayMap('schedule-1').get('2026-04-03')
    const savedMatch = (saved?.matches as Array<Record<string, unknown>>)[0]
    expect(saved?.revision).toBe(2)
    expect(savedMatch.home_score).toBe(2)
    expect(savedMatch.away_score).toBe(1)
    expect(savedMatch.winner).toBe('HOME')
    expect(savedMatch.note).toBe('세트 스코어 확정')
  })

  it('completeLeagueSchedule uses roster source archive and creates deterministic hall of fame entry', async () => {
    dbState.leagueSchedules.set('schedule-1', {
      name: 'Spring Split',
      linked_auction_id: 'archive-1',
      roster_source_type: 'archive',
      roster_source_id: 'archive-1',
      starts_at: createTimestamp('2026-04-01T00:00:00.000Z'),
      status: 'ACTIVE',
    })
    dbState.auctionArchives.set('archive-1', {
      room_name: '2026 스프링 경매',
      result_snapshot: [
        {
          id: 'team-1',
          name: 'Blue',
          leader_name: 'Captain Blue',
          captain_mode: 'IN_ROSTER',
          point_balance: 10,
          players: [
            {
              name: 'Captain Blue',
              tier: '팀장',
              main_position: 'TOP',
              sub_position: '',
              sold_price: null,
            },
            {
              name: 'Player One',
              tier: 'S',
              main_position: 'TOP',
              sub_position: 'MID',
              sold_price: 100,
            },
          ],
        },
      ],
    })

    const { completeLeagueSchedule } = await import('../scheduleActions')

    const result = await completeLeagueSchedule({
      scheduleId: 'schedule-1',
      championTeamName: 'Blue',
      adminCode: 'secret-code',
    })

    expect(result.error).toBeUndefined()
    expect(mockRunTransaction).toHaveBeenCalled()
    expect(dbState.hallOfFame.has('schedule:schedule-1')).toBe(true)
    expect(dbState.leagueSchedules.get('schedule-1')?.status).toBe('COMPLETED')
    expect(dbState.leagueSchedules.get('schedule-1')?.champion_team_name).toBe('Blue')
    expect(
      (
        dbState.hallOfFame.get('schedule:schedule-1')?.winning_team_players as Array<{
          name: string
        }>
      )[0]?.name,
    ).toBe('Captain Blue')
  })

  it('legacy archive without captain_mode keeps captain out when roster did not include leader', async () => {
    dbState.leagueSchedules.set('schedule-legacy', {
      name: 'Legacy Split',
      linked_auction_id: 'archive-legacy',
      roster_source_type: 'archive',
      roster_source_id: 'archive-legacy',
      starts_at: createTimestamp('2026-04-01T00:00:00.000Z'),
      status: 'ACTIVE',
    })
    dbState.auctionArchives.set('archive-legacy', {
      room_name: '레거시 경매',
      result_snapshot: [
        {
          id: 'team-legacy',
          name: 'Legacy Blue',
          leader_name: 'Captain Legacy',
          point_balance: 20,
          players: [
            {
              name: 'Legacy Player',
              tier: 'A',
              main_position: 'MID',
              sub_position: '',
              sold_price: 120,
            },
          ],
        },
      ],
    })

    const { getLeagueScheduleTimeline } = await import('../scheduleActions')
    const timeline = await getLeagueScheduleTimeline('schedule-legacy')

    expect(timeline.rosterTeams[0]?.captainMode).toBe('COACH_ONLY')
    expect(timeline.rosterTeams[0]?.players.map((player) => player.name)).toEqual([
      'Legacy Player',
    ])
  })

  it('deleteLeagueSchedule removes schedule tree and linked hall of fame entry', async () => {
    dbState.leagueSchedules.set('schedule-1', {
      name: 'Spring Split',
      starts_at: createTimestamp('2026-04-01T00:00:00.000Z'),
      status: 'COMPLETED',
    })
    dbState.hallOfFame.set('schedule:schedule-1', {
      archive_id: 'schedule:schedule-1',
    })

    const { deleteLeagueSchedule } = await import('../scheduleActions')

    const result = await deleteLeagueSchedule('schedule-1', 'secret-code')

    expect(result.error).toBeUndefined()
    expect(mockRecursiveDelete).toHaveBeenCalled()
    expect(dbState.recursiveDeleteCalls).toContain('schedule-1')
    expect(dbState.hallOfFame.has('schedule:schedule-1')).toBe(false)
  })
})
