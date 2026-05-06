/**
 * TDD Test Suite — auctionActions.ts (Firebase 버전)
 *
 * Firebase Admin SDK를 vi.mock()으로 대체합니다.
 * 테스트 대상: placeBid · awardPlayer · draftPlayer · deleteRoom · saveAuctionArchive
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  placeBid,
  awardPlayer,
  recoverExpiredAuction,
  startAuction,
  pauseAuction,
  resumeAuction,
  draftPlayer,
  deleteRoom,
  saveAuctionArchive,
} from '@/features/auction/api/auctionActions'

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

const makeTimestamp = (ms: number) => ({
  toMillis: () => ms,
  toDate: () => new Date(ms),
})

const makeSnap = (data: unknown, exists = data !== null) => ({
  exists,
  data: () => data,
  id: 'mock-id',
  ref: { update: vi.fn(), set: vi.fn(), id: 'mock-ref-id' },
})

const makeQuerySnap = (items: unknown[]) => ({
  empty: items.length === 0,
  size: items.length,
  docs: items.map((d, i) => ({
    data: () => d,
    id: `doc-${i}`,
    ref: { update: vi.fn() },
  })),
})

// ─────────────────────────────────────────────────────────────
// Firebase Admin 모의 구현 — vi.hoisted() 사용 (Vitest v2 필수)
// ─────────────────────────────────────────────────────────────

const {
  mockDocGet,
  mockQueryGet,
  mockDocUpdate,
  mockCollectionAdd,
  mockBatchUpdate,
  mockBatchCommit,
  mockRecursiveDelete,
  mockRunTransaction,
} = vi.hoisted(() => {
  const mockDocGet = vi.fn()
  const mockQueryGet = vi.fn()
  const mockDocUpdate = vi.fn()
  const mockCollectionAdd = vi.fn()
  const mockBatchUpdate = vi.fn()
  const mockBatchCommit = vi.fn()
  const mockRecursiveDelete = vi.fn()
  const mockRunTransaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      get: vi.fn().mockImplementation((ref: { get: () => unknown }) => ref.get()),
      update: vi.fn(),
      set: vi.fn(),
    }
    return fn(tx)
  })
  return { mockDocGet, mockQueryGet, mockDocUpdate, mockCollectionAdd, mockBatchUpdate, mockBatchCommit, mockRecursiveDelete, mockRunTransaction }
})

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: mockDocGet,
        update: mockDocUpdate,
        set: vi.fn(),
        id: 'mock-doc-id',
        ref: {},
        collection: vi.fn().mockReturnValue({
          add: mockCollectionAdd,
          doc: vi.fn().mockReturnValue({
            get: mockDocGet,
            update: mockDocUpdate,
            set: vi.fn(),
            ref: {},
            id: 'sub-doc-id',
          }),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: mockQueryGet,
        }),
      }),
      add: mockCollectionAdd,
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: mockQueryGet,
    }),
    runTransaction: mockRunTransaction,
    batch: vi.fn().mockReturnValue({ update: mockBatchUpdate, commit: mockBatchCommit }),
    recursiveDelete: mockRecursiveDelete,
  },
}))

vi.mock('firebase-admin', () => ({
  firestore: {
    Timestamp: {
      fromDate: (d: Date) => ({ toMillis: () => d.getTime(), toDate: () => d }),
    },
    FieldValue: {
      serverTimestamp: () => ({ _methodName: 'serverTimestamp' }),
    },
  },
  database: vi.fn().mockReturnValue({
    ref: vi.fn().mockReturnValue({ set: vi.fn().mockResolvedValue(undefined) }),
  }),
  apps: [true],
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn() })),
}))

// ─────────────────────────────────────────────────────────────
// 공통 beforeEach
// ─────────────────────────────────────────────────────────────

function resetMocks() {
  mockDocGet.mockReset()
  mockQueryGet.mockReset()
  mockDocUpdate.mockReset()
  mockDocUpdate.mockResolvedValue(undefined)
  mockCollectionAdd.mockReset()
  mockCollectionAdd.mockResolvedValue({ id: 'new-doc-id' })
  mockBatchUpdate.mockReset()
  mockBatchCommit.mockReset()
  mockBatchCommit.mockResolvedValue(undefined)
  mockRecursiveDelete.mockReset()
  mockRecursiveDelete.mockResolvedValue(undefined)
  mockRunTransaction.mockClear()
}

// ═════════════════════════════════════════════════════════════
// 1. placeBid
// ═════════════════════════════════════════════════════════════
describe('placeBid', () => {
  const roomId = 'room-1'
  const playerId = 'player-1'
  const teamId = 'team-1'

  beforeEach(resetMocks)

  // ── 입력 유효성 (DB 미조회) ──────────────────────────────────

  it('amount가 0이면 에러 — DB 미조회', async () => {
    const result = await placeBid(roomId, playerId, teamId, 0)
    expect(result.error).toMatch(/양의 정수/)
    expect(mockDocGet).not.toHaveBeenCalled()
  })

  it('amount가 음수이면 에러 — DB 미조회', async () => {
    const result = await placeBid(roomId, playerId, teamId, -10)
    expect(result.error).toMatch(/양의 정수/)
    expect(mockDocGet).not.toHaveBeenCalled()
  })

  it('amount가 소수(비정수)이면 에러 — DB 미조회', async () => {
    const result = await placeBid(roomId, playerId, teamId, 10.5)
    expect(result.error).toBeDefined()
    expect(mockDocGet).not.toHaveBeenCalled()
  })

  it('amount가 10P 단위 아니면 에러 — DB 미조회', async () => {
    const result = await placeBid(roomId, playerId, teamId, 15)
    expect(result.error).toMatch(/10P/)
    expect(mockDocGet).not.toHaveBeenCalled()
  })

  // ── 경매 진행 상태 ────────────────────────────────────────────

  it('timer_ends_at null → 경매 미진행 에러', async () => {
    mockDocGet.mockResolvedValueOnce(
      makeSnap({ timer_ends_at: null, current_player_id: null })
    )
    const result = await placeBid(roomId, playerId, teamId, 10)
    expect(result.error).toMatch(/경매가 진행 중이지 않습니다/)
  })

  it('타이머가 1.5초 전에 만료 → 에러', async () => {
    mockDocGet.mockResolvedValueOnce(
      makeSnap({
        timer_ends_at: makeTimestamp(Date.now() - 1500),
        current_player_id: playerId,
      })
    )
    const result = await placeBid(roomId, playerId, teamId, 10)
    expect(result.error).toMatch(/경매 시간이 종료/)
  })

  it('current_player_id가 다른 선수이면 에러', async () => {
    mockDocGet.mockResolvedValueOnce(
      makeSnap({
        timer_ends_at: makeTimestamp(Date.now() + 10000),
        current_player_id: 'other-player',
      })
    )
    const result = await placeBid(roomId, playerId, teamId, 10)
    expect(result.error).toMatch(/현재 경매 중인 선수가 아닙니다/)
  })

  // ── 입찰 제약 ─────────────────────────────────────────────────

  it('현재 최고 입찰자가 내 팀이면 에러', async () => {
    mockDocGet.mockResolvedValueOnce(
      makeSnap({
        timer_ends_at: makeTimestamp(Date.now() + 10000),
        current_player_id: playerId,
        active_bid: { team_id: teamId, amount: 100 },
      })
    )
    mockDocGet.mockResolvedValueOnce(makeSnap({ point_balance: 1000, name: '팀A' }))
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap([]))
    const result = await placeBid(roomId, playerId, teamId, 110)
    expect(result.error).toMatch(/현재 최고 입찰자/)
  })

  it('최소 입찰액 미만이면 에러', async () => {
    mockDocGet.mockResolvedValueOnce(
      makeSnap({
        timer_ends_at: makeTimestamp(Date.now() + 10000),
        current_player_id: playerId,
        active_bid: { team_id: 'other-team', amount: 100 },
      })
    )
    mockDocGet.mockResolvedValueOnce(makeSnap({ point_balance: 1000, name: '팀A' }))
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap([]))
    const result = await placeBid(roomId, playerId, teamId, 100)
    expect(result.error).toMatch(/최소 입찰액/)
  })

  it('포인트 부족이면 에러', async () => {
    mockDocGet
      .mockResolvedValueOnce(
        makeSnap({
          timer_ends_at: makeTimestamp(Date.now() + 10000),
          current_player_id: playerId,
          members_per_team: 5,
          captain_mode: 'IN_ROSTER',
        })
      )
      .mockResolvedValueOnce(makeSnap({ point_balance: 5, name: '팀A' })) // team
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap([])) // soldCount=0
    const result = await placeBid(roomId, playerId, teamId, 10)
    expect(result.error).toMatch(/포인트 부족/)
  })

  it('팀 정원 가득 참 → 에러', async () => {
    mockDocGet
      .mockResolvedValueOnce(
        makeSnap({
          timer_ends_at: makeTimestamp(Date.now() + 10000),
          current_player_id: playerId,
          members_per_team: 4,
          captain_mode: 'IN_ROSTER',
        })
      )
      .mockResolvedValueOnce(makeSnap({ point_balance: 1000, name: '팀A' })) // team
    mockQueryGet
      .mockResolvedValueOnce(makeQuerySnap(new Array(4).fill({ status: 'SOLD' }))) // soldCount=4
    const result = await placeBid(roomId, playerId, teamId, 10)
    expect(result.error).toMatch(/팀 인원이 가득/)
  })

  // ── 성공 케이스 ───────────────────────────────────────────────

  it('GREEN: 유효한 입찰 → {} 반환', async () => {
    mockDocGet
      .mockResolvedValueOnce(makeSnap({
        timer_ends_at: makeTimestamp(Date.now() + 10000),
        current_player_id: playerId,
        members_per_team: 5,
        captain_mode: 'IN_ROSTER',
      }))
      .mockResolvedValueOnce(makeSnap({ point_balance: 1000, name: '팀A' })) // team
    mockQueryGet
      .mockResolvedValueOnce(makeQuerySnap([])) // soldCount=0
    const result = await placeBid(roomId, playerId, teamId, 10)
    expect(result.error).toBeUndefined()
    expect(mockRunTransaction).toHaveBeenCalled()
  })

  it('GREEN: 남은 시간 ≤ 5초이면 타이머 연장', async () => {
    mockDocGet
      .mockResolvedValueOnce(makeSnap({
        timer_ends_at: makeTimestamp(Date.now() + 3000),
        current_player_id: playerId,
        members_per_team: 5,
        captain_mode: 'IN_ROSTER',
      }))
      .mockResolvedValueOnce(makeSnap({ point_balance: 1000, name: '팀A' }))
    mockQueryGet
      .mockResolvedValueOnce(makeQuerySnap([]))
    const result = await placeBid(roomId, playerId, teamId, 10)
    expect(result.error).toBeUndefined()
    expect(result.timerEndsAt).toBeDefined()
  })

  it('GREEN: 남은 시간 > 5초이면 타이머 연장 미실행', async () => {
    mockDocGet
      .mockResolvedValueOnce(makeSnap({
        timer_ends_at: makeTimestamp(Date.now() + 10000),
        current_player_id: playerId,
        members_per_team: 5,
        captain_mode: 'IN_ROSTER',
      }))
      .mockResolvedValueOnce(makeSnap({ point_balance: 1000, name: '팀A' }))
    mockQueryGet
      .mockResolvedValueOnce(makeQuerySnap([]))
    const result = await placeBid(roomId, playerId, teamId, 10)
    expect(result.error).toBeUndefined()
    expect(result.timerEndsAt).toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════
// 2. awardPlayer
// ═════════════════════════════════════════════════════════════
describe('awardPlayer', () => {
  const roomId = 'room-1'
  const playerId = 'player-1'

  beforeEach(resetMocks)

  it('타이머가 미래(살아있음) → 레이스 컨디션 방어, 아무것도 하지 않음', async () => {
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap([])) // bids query
    mockDocGet
      .mockResolvedValueOnce(makeSnap({ timer_ends_at: makeTimestamp(Date.now() + 5000) })) // room (in tx)
      .mockResolvedValueOnce(makeSnap({ status: 'IN_AUCTION', name: '홍길동' })) // player (in tx)
    const result = await awardPlayer(roomId, playerId)
    expect(result.error).toBeUndefined()
  })

  it('선수 status가 SOLD → 멱등성 보장', async () => {
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap([]))
    mockDocGet
      .mockResolvedValueOnce(makeSnap({ timer_ends_at: makeTimestamp(Date.now() - 2000) }))
      .mockResolvedValueOnce(makeSnap({ status: 'SOLD', name: '홍길동' }))
    const result = await awardPlayer(roomId, playerId)
    expect(result.error).toBeUndefined()
  })

  it('GREEN: 입찰 없음 → UNSOLD 처리', async () => {
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap([]))
    mockDocGet
      .mockResolvedValueOnce(makeSnap({ timer_ends_at: makeTimestamp(Date.now() - 2000) }))
      .mockResolvedValueOnce(makeSnap({ status: 'IN_AUCTION', name: '홍길동' }))
    const result = await awardPlayer(roomId, playerId)
    expect(result.error).toBeUndefined()
  })

  it('GREEN: 최고 입찰 존재 → SOLD 처리, 팀 포인트 차감', async () => {
    mockQueryGet.mockResolvedValueOnce(
      makeQuerySnap([{ team_id: 'team-1', amount: 100 }])
    )
    mockDocGet
      .mockResolvedValueOnce(makeSnap({ timer_ends_at: makeTimestamp(Date.now() - 2000) }))
      .mockResolvedValueOnce(makeSnap({ status: 'IN_AUCTION', name: '홍길동' }))
      .mockResolvedValueOnce(makeSnap({ point_balance: 500, name: '팀A' })) // team in tx
    const result = await awardPlayer(roomId, playerId)
    expect(result.error).toBeUndefined()
  })
})

describe('recoverExpiredAuction', () => {
  const roomId = 'room-1'

  beforeEach(resetMocks)

  it('current_player_id가 없으면 복구하지 않는다', async () => {
    mockDocGet.mockResolvedValueOnce(
      makeSnap({ current_player_id: null, timer_ends_at: null }),
    )

    const result = await recoverExpiredAuction(roomId)

    expect(result.recovered).toBe(false)
  })

  it('타이머가 아직 남아있으면 복구하지 않는다', async () => {
    mockDocGet.mockResolvedValueOnce(
      makeSnap({
        current_player_id: 'player-1',
        timer_ends_at: makeTimestamp(Date.now() + 5000),
      }),
    )

    const result = await recoverExpiredAuction(roomId)

    expect(result.recovered).toBe(false)
  })

  it('만료된 경매면 awardPlayer 경로를 타서 복구한다', async () => {
    mockDocGet
      .mockResolvedValueOnce(
        makeSnap({
          current_player_id: 'player-1',
          timer_ends_at: makeTimestamp(Date.now() - 1000),
        }),
      )
      .mockResolvedValueOnce(makeSnap({ timer_ends_at: makeTimestamp(Date.now() - 2000) }))
      .mockResolvedValueOnce(makeSnap({ status: 'IN_AUCTION', name: '홍길동' }))
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap([]))

    const result = await recoverExpiredAuction(roomId)

    expect(result.error).toBeUndefined()
    expect(result.recovered).toBe(true)
  })
})

describe('pauseAuction/resumeAuction', () => {
  const roomId = 'room-1'

  beforeEach(resetMocks)

  it('pause 시 남은 시간을 기록하고 resume 시 5초로 줄이지 않는다', async () => {
    const pausedAt = Date.now()
    mockDocGet.mockResolvedValueOnce(
      makeSnap({
        current_player_id: 'player-1',
        timer_ends_at: makeTimestamp(pausedAt + 9000),
      }),
    )

    const pauseResult = await pauseAuction(roomId)
    expect(pauseResult.error).toBeUndefined()

    mockDocGet.mockResolvedValueOnce(
      makeSnap({
        current_player_id: 'player-1',
        paused_remaining_ms: 9000,
      }),
    )

    const resumeResult = await resumeAuction(roomId)
    expect(resumeResult.error).toBeUndefined()
    expect(resumeResult.timerEndsAt).toBeDefined()
    const remainingMs = new Date(resumeResult.timerEndsAt as string).getTime() - Date.now()
    expect(remainingMs).toBeGreaterThan(8000)
  })
})

describe('startAuction', () => {
  const roomId = 'room-1'

  beforeEach(resetMocks)

  it('기본 경매 시작은 10초 타이머를 사용한다', async () => {
    mockDocGet
      .mockResolvedValueOnce(
        makeSnap({
          current_player_id: 'player-1',
        }),
      )
      .mockResolvedValueOnce(
        makeSnap({
          current_player_id: 'player-1',
          next_auction_duration_ms: null,
          active_bid: null,
        }),
      )

    const result = await startAuction(roomId)

    expect(result.error).toBeUndefined()
    expect(result.timerEndsAt).toBeDefined()
    const remainingMs = new Date(result.timerEndsAt as string).getTime() - Date.now()
    expect(remainingMs).toBeGreaterThan(8_500)
  })

  it('재경매 직후에는 room 정본의 다음 시작 5초 규칙을 사용한다', async () => {
    mockDocGet
      .mockResolvedValueOnce(
        makeSnap({
          current_player_id: 'player-1',
        }),
      )
      .mockResolvedValueOnce(
        makeSnap({
          current_player_id: 'player-1',
          next_auction_duration_ms: 5_000,
          active_bid: null,
        }),
      )

    const result = await startAuction(roomId)

    expect(result.error).toBeUndefined()
    expect(result.timerEndsAt).toBeDefined()
    const remainingMs = new Date(result.timerEndsAt as string).getTime() - Date.now()
    expect(remainingMs).toBeLessThanOrEqual(5_000)
    expect(remainingMs).toBeGreaterThan(3_500)
  })
})

// ═════════════════════════════════════════════════════════════
// 3. draftPlayer
// ═════════════════════════════════════════════════════════════
describe('draftPlayer', () => {
  const roomId = 'room-1'
  const playerId = 'player-1'
  const teamId = 'team-1'

  beforeEach(resetMocks)

  it('선수가 SOLD 상태이면 에러', async () => {
    mockDocGet.mockResolvedValueOnce(makeSnap({ name: '홍길동', status: 'SOLD', room_id: roomId }))
    const result = await draftPlayer(roomId, playerId, teamId)
    expect(result.error).toMatch(/영입 요청/)
  })

  it('선수가 IN_AUCTION 상태이면 에러', async () => {
    mockDocGet.mockResolvedValueOnce(makeSnap({ name: '홍길동', status: 'IN_AUCTION', room_id: roomId }))
    const result = await draftPlayer(roomId, playerId, teamId)
    expect(result.error).toMatch(/영입 요청/)
  })

  it('player.room_id가 다른 방이면 에러', async () => {
    mockDocGet.mockResolvedValueOnce(makeSnap({ name: '홍길동', status: 'UNSOLD', room_id: 'other-room' }))
    const result = await draftPlayer(roomId, playerId, teamId)
    expect(result.error).toMatch(/속하지 않습니다/)
  })

  it('팀 정원이 가득 찼으면 에러', async () => {
    mockDocGet
      .mockResolvedValueOnce(makeSnap({ name: '홍길동', status: 'UNSOLD', room_id: roomId }))
      .mockResolvedValueOnce(makeSnap({ name: '팀A' })) // team
      .mockResolvedValueOnce(makeSnap({ members_per_team: 4, captain_mode: 'IN_ROSTER' })) // room
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap(new Array(4).fill({ status: 'SOLD' })))
    const result = await draftPlayer(roomId, playerId, teamId)
    expect(result.error).toMatch(/팀 인원이 가득/)
  })

  it('GREEN: UNSOLD 선수를 0P로 팀에 영입', async () => {
    mockDocGet
      .mockResolvedValueOnce(makeSnap({ name: '홍길동', status: 'UNSOLD', room_id: roomId }))
      .mockResolvedValueOnce(makeSnap({ name: '팀A', point_balance: 1000 }))
      .mockResolvedValueOnce(makeSnap({ members_per_team: 5, captain_mode: 'IN_ROSTER' }))
      .mockResolvedValueOnce(makeSnap({ name: '팀A', point_balance: 1000 }))
      .mockResolvedValueOnce(makeSnap({ name: '홍길동', status: 'UNSOLD', room_id: roomId }))
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap(new Array(2).fill({ status: 'SOLD' })))
    const result = await draftPlayer(roomId, playerId, teamId)
    expect(result.error).toBeUndefined()
  })

  it('GREEN: WAITING 선수도 0P 영입 가능 (자유계약)', async () => {
    mockDocGet
      .mockResolvedValueOnce(makeSnap({ name: '홍길동', status: 'WAITING', room_id: roomId }))
      .mockResolvedValueOnce(makeSnap({ name: '팀A', point_balance: 1000 }))
      .mockResolvedValueOnce(makeSnap({ members_per_team: 5, captain_mode: 'IN_ROSTER' }))
      .mockResolvedValueOnce(makeSnap({ name: '팀A', point_balance: 1000 }))
      .mockResolvedValueOnce(makeSnap({ name: '홍길동', status: 'WAITING', room_id: roomId }))
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap([]))
    const result = await draftPlayer(roomId, playerId, teamId)
    expect(result.error).toBeUndefined()
  })

  it('GREEN: 마지막 슬롯 드래프트면 남은 포인트 전액을 사용한다', async () => {
    mockDocGet
      .mockResolvedValueOnce(
        makeSnap({ name: '홍길동', status: 'UNSOLD', room_id: roomId }),
      )
      .mockResolvedValueOnce(makeSnap({ name: '팀A', point_balance: 100 }))
      .mockResolvedValueOnce(
        makeSnap({ members_per_team: 5, captain_mode: 'COACH_ONLY' }),
      )
      .mockResolvedValueOnce(makeSnap({ name: '팀A', point_balance: 100 }))
      .mockResolvedValueOnce(
        makeSnap({ name: '홍길동', status: 'UNSOLD', room_id: roomId }),
      )
    mockQueryGet.mockResolvedValueOnce(
      makeQuerySnap(new Array(4).fill({ status: 'SOLD' })),
    )

    const result = await draftPlayer(roomId, playerId, teamId)

    expect(result.error).toBeUndefined()
    expect(mockRunTransaction).toHaveBeenCalled()
  })

  it('COACH_ONLY면 팀장이 슬롯을 차지하지 않는다', async () => {
    mockDocGet
      .mockResolvedValueOnce(makeSnap({ name: '홍길동', status: 'WAITING', room_id: roomId }))
      .mockResolvedValueOnce(makeSnap({ name: '팀A', point_balance: 1000 }))
      .mockResolvedValueOnce(makeSnap({ members_per_team: 5, captain_mode: 'COACH_ONLY' }))
      .mockResolvedValueOnce(makeSnap({ name: '팀A', point_balance: 1000 }))
      .mockResolvedValueOnce(makeSnap({ name: '홍길동', status: 'WAITING', room_id: roomId }))
    mockQueryGet.mockResolvedValueOnce(makeQuerySnap(new Array(4).fill({ status: 'SOLD' })))
    const result = await draftPlayer(roomId, playerId, teamId)
    expect(result.error).toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════
// 4. deleteRoom
// ═════════════════════════════════════════════════════════════
describe('deleteRoom', () => {
  const roomId = 'room-1'

  beforeEach(resetMocks)

  it('GREEN: 정상 삭제 → {} 반환', async () => {
    mockDocGet.mockResolvedValueOnce(makeSnap({ name: '테스트방' }))
    const result = await deleteRoom(roomId)
    expect(result.error).toBeUndefined()
    expect(mockRecursiveDelete).toHaveBeenCalled()
  })

  it('RED: recursiveDelete 실패 → 에러 반환', async () => {
    mockDocGet.mockResolvedValueOnce(makeSnap({ name: '테스트방' }))
    mockRecursiveDelete.mockRejectedValueOnce(new Error('delete failed'))
    const result = await deleteRoom(roomId)
    expect(result.error).toBeDefined()
  })
})

// ═════════════════════════════════════════════════════════════
// 5. saveAuctionArchive
// ═════════════════════════════════════════════════════════════
describe('saveAuctionArchive', () => {
  const payload = {
    roomId: 'room-1',
    roomName: '2025 시즌 경매',
    roomCreatedAt: new Date().toISOString(),
    teams: [
      {
        id: 'team-1',
        name: '팀A',
        leader_name: '홍길동',
        point_balance: 900,
        players: [
          {
            name: '선수1',
            tier: '골드',
            main_position: '탑',
            sub_position: '정글',
            sold_price: 100,
          },
        ],
      },
    ],
  }

  beforeEach(resetMocks)

  it('GREEN: 성공 → {} 반환, auction_archives add 호출', async () => {
    const result = await saveAuctionArchive(payload)
    expect(result.error).toBeUndefined()
    expect(mockCollectionAdd).toHaveBeenCalled()
  })

  it('RED: DB add 실패 → { error } 반환', async () => {
    mockCollectionAdd.mockRejectedValueOnce(new Error('duplicate key value'))
    const result = await saveAuctionArchive(payload)
    expect(result.error).toMatch(/duplicate key value/)
  })
})
