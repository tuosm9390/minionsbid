// latency-report API 라우트의 payload 검증·rate limit·Firestore 적재를 검증한다.
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { addMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
}))

vi.mock('@/lib/firebaseAdmin', () => ({
  getAdminDb: vi.fn().mockReturnValue({
    collection: vi.fn().mockReturnValue({ add: addMock }),
  }),
}))

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
  },
}))

const { POST } = await import('../route')

const ORIGIN = 'https://example.com'

function makeRequest(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}/api/latency-report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  })
}

const validReport = {
  roomId: 'room-1',
  sampleCount: 3,
  p50EndToEndMs: 120,
  p95EndToEndMs: 340,
  maxEndToEndMs: 360,
  sourceCounts: { rtdb: 2, 'room-fallback': 1 },
  fallbackCount: 1,
  fallbackReasons: ['timeout'],
}

beforeEach(() => {
  vi.clearAllMocks()
  addMock.mockResolvedValue({ id: 'doc-1' })
})

describe('POST /api/latency-report', () => {
  it('정상 리포트를 latency_reports에 저장한다', async () => {
    const res = await POST(
      makeRequest(validReport, { 'x-forwarded-for': '10.1.0.1' }),
    )
    expect(res.status).toBe(200)
    expect(addMock).toHaveBeenCalledOnce()
    const doc = addMock.mock.calls[0][0]
    expect(doc.room_id).toBe('room-1')
    expect(doc.sample_count).toBe(3)
    expect(doc.p95_end_to_end_ms).toBe(340)
    expect(doc.source_counts).toEqual({ rtdb: 2, 'room-fallback': 1 })
    expect(doc.fallback_count).toBe(1)
    expect(doc.fallback_reasons).toEqual(['timeout'])
    expect(doc.expires_at.toMillis()).toBeGreaterThan(doc.created_at.toMillis())
  })

  it('roomId가 없으면 400을 반환한다', async () => {
    const res = await POST(
      makeRequest({ ...validReport, roomId: undefined }, { 'x-forwarded-for': '10.1.0.2' }),
    )
    expect(res.status).toBe(400)
    expect(addMock).not.toHaveBeenCalled()
  })

  it('샘플과 폴백이 모두 0이면 400을 반환한다', async () => {
    const res = await POST(
      makeRequest(
        { ...validReport, sampleCount: 0, fallbackCount: 0 },
        { 'x-forwarded-for': '10.1.0.3' },
      ),
    )
    expect(res.status).toBe(400)
    expect(addMock).not.toHaveBeenCalled()
  })

  it('허용되지 않은 source 키는 저장에서 제외한다', async () => {
    const res = await POST(
      makeRequest(
        { ...validReport, sourceCounts: { rtdb: 1, evil: 99 } },
        { 'x-forwarded-for': '10.1.0.4' },
      ),
    )
    expect(res.status).toBe(200)
    expect(addMock.mock.calls[0][0].source_counts).toEqual({ rtdb: 1 })
  })

  it('Firestore 저장 실패 시 500을 반환한다', async () => {
    addMock.mockRejectedValueOnce(new Error('firestore down'))
    const res = await POST(
      makeRequest(validReport, { 'x-forwarded-for': '10.1.0.5' }),
    )
    expect(res.status).toBe(500)
  })

  it('같은 IP가 1분 내 30회를 초과하면 429를 반환한다', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await POST(
        makeRequest(validReport, { 'x-forwarded-for': '10.1.0.6' }),
      )
      expect(res.status).toBe(200)
    }
    const limited = await POST(
      makeRequest(validReport, { 'x-forwarded-for': '10.1.0.6' }),
    )
    expect(limited.status).toBe(429)
  })
})
