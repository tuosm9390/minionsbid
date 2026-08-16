import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const firestoreState = vi.hoisted(() => ({
  sets: [] as Array<{ path: string; data: Record<string, unknown>; options?: { merge?: boolean } }>,
  commits: 0,
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
  },
}))

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    batch: () => ({
      set(ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) {
        firestoreState.sets.push({ path: ref.path, data, options })
        return this
      },
      async commit() {
        firestoreState.commits += 1
      },
    }),
    collection: (collectionName: string) => ({
      doc: (scheduleId: string) => ({
        collection: (subCollectionName: string) => ({
          doc: (participantId: string) => ({
            path: `${collectionName}/${scheduleId}/${subCollectionName}/${participantId}`,
          }),
        }),
      }),
    }),
  },
}))

function makePost(body: unknown, adminCode?: string) {
  return new NextRequest('http://localhost/api/league-schedules/schedule-1/deeplol/participants', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(adminCode ? { 'x-admin-code': adminCode } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('Deeplol participants API integration', () => {
  beforeEach(() => {
    firestoreState.sets.length = 0
    firestoreState.commits = 0
    vi.stubEnv('HALL_OF_FAME_ADMIN_CODE', 'secret-code')
  })

  it('rejects an unauthenticated Firestore write', async () => {
    const response = await POST(
      makePost({ members: [{ puuId: 'puu-1' }] }),
      { params: Promise.resolve({ scheduleId: 'schedule-1' }) },
    )

    expect(response.status).toBe(403)
    expect(firestoreState.sets).toHaveLength(0)
    expect(firestoreState.commits).toBe(0)
  })

  it('persists encoded PUUID documents and normalized fields in Firestore batch', async () => {
    const response = await POST(
      makePost({
        members: [
          {
            puuId: 'puu/player 1',
            riotName: ' player-one ',
            riotTag: ' KR1 ',
            teamId: 'team-blue',
            teamName: ' Blue ',
            position: ' Jungle ',
          },
        ],
      }, 'secret-code'),
      { params: Promise.resolve({ scheduleId: 'schedule-1' }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, count: 1 })
    expect(firestoreState.commits).toBe(1)
    expect(firestoreState.sets).toHaveLength(1)
    expect(firestoreState.sets[0]).toEqual({
      path: 'league_schedules/schedule-1/deeplol_participants/puu%2Fplayer%201',
      data: {
        puu_id: 'puu/player 1',
        riot_name: 'player-one',
        riot_tag: 'KR1',
        team_id: 'team-blue',
        team_name: 'Blue',
        position: 'Jungle',
        status: 'ACTIVE',
        updated_at: 'SERVER_TIMESTAMP',
      },
      options: { merge: true },
    })
  })
})
