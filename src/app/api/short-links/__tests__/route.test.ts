// short-links API 라우트가 teamId 파라미터를 포함한 URL을 보존하는지 검증한다.
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createBulyShortUrl } = vi.hoisted(() => ({
  createBulyShortUrl: vi.fn(),
}))

vi.mock('@/lib/buly', () => ({
  createBulyShortUrl,
}))

const { POST } = await import('../route')

const ORIGIN = 'https://example.com'

function makeRequest(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}/api/short-links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/short-links', () => {
  it('LEADER URL의 role과 teamId 파라미터가 createBulyShortUrl에 그대로 전달된다', async () => {
    const teamId = 'abc123-team-uuid'
    const orgUrl = `${ORIGIN}/room/room-uuid?role=LEADER&teamId=${teamId}`
    createBulyShortUrl.mockResolvedValueOnce('https://buly.kr/abc')

    const res = await POST(makeRequest({ links: [{ key: 'team-a', orgUrl }] }))
    const body = await res.json()

    expect(createBulyShortUrl).toHaveBeenCalledOnce()
    expect(createBulyShortUrl).toHaveBeenCalledWith(orgUrl)
    expect(body.links[0].orgUrl).toBe(orgUrl)
    expect(body.links[0].shortUrl).toBe('https://buly.kr/abc')
    expect(body.links[0].error).toBeNull()
  })

  it('teamId가 URL-encoded UUID여도 그대로 전달된다', async () => {
    const teamId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    const orgUrl = `${ORIGIN}/room/some-room?role=LEADER&teamId=${encodeURIComponent(teamId)}`
    createBulyShortUrl.mockResolvedValueOnce('https://buly.kr/xyz')

    const res = await POST(makeRequest({ links: [{ key: 'team-b', orgUrl }] }))
    const body = await res.json()

    expect(createBulyShortUrl).toHaveBeenCalledWith(orgUrl)
    expect(body.links[0].orgUrl).toBe(orgUrl)
    expect(body.links[0].error).toBeNull()
  })

  it('여러 팀 링크를 한 번에 처리할 때 각 teamId가 독립적으로 보존된다', async () => {
    const links = [
      { key: 'team-a', orgUrl: `${ORIGIN}/room/r1?role=LEADER&teamId=team-aaa` },
      { key: 'team-b', orgUrl: `${ORIGIN}/room/r1?role=LEADER&teamId=team-bbb` },
    ]
    createBulyShortUrl
      .mockResolvedValueOnce('https://buly.kr/a')
      .mockResolvedValueOnce('https://buly.kr/b')

    const res = await POST(makeRequest({ links }))
    const body = await res.json()

    expect(createBulyShortUrl).toHaveBeenCalledTimes(2)
    expect(createBulyShortUrl).toHaveBeenNthCalledWith(1, links[0].orgUrl)
    expect(createBulyShortUrl).toHaveBeenNthCalledWith(2, links[1].orgUrl)
    expect(body.links[0].shortUrl).toBe('https://buly.kr/a')
    expect(body.links[1].shortUrl).toBe('https://buly.kr/b')
  })

  it('다른 origin의 URL은 오류를 반환한다', async () => {
    const orgUrl = 'https://evil.example.com/room/r1?role=LEADER&teamId=team-aaa'

    const res = await POST(makeRequest({ links: [{ key: 'bad', orgUrl }] }))
    const body = await res.json()

    expect(createBulyShortUrl).not.toHaveBeenCalled()
    expect(body.links[0].shortUrl).toBeNull()
    expect(body.links[0].error).toBeTruthy()
  })

  it('/room/ 경로가 아닌 URL은 오류를 반환한다', async () => {
    const orgUrl = `${ORIGIN}/admin/delete?role=ORGANIZER&teamId=team-aaa`

    const res = await POST(makeRequest({ links: [{ key: 'bad', orgUrl }] }))
    const body = await res.json()

    expect(createBulyShortUrl).not.toHaveBeenCalled()
    expect(body.links[0].shortUrl).toBeNull()
    expect(body.links[0].error).toBeTruthy()
  })

  it('links가 빈 배열이면 400을 반환한다', async () => {
    const res = await POST(makeRequest({ links: [] }))
    expect(res.status).toBe(400)
  })

  it('links가 20개를 초과하면 400을 반환한다', async () => {
    const links = Array.from({ length: 21 }, (_, i) => ({
      key: `team-${i}`,
      orgUrl: `${ORIGIN}/room/r1?role=LEADER&teamId=team-${i}`,
    }))
    const res = await POST(
      makeRequest({ links }, { 'x-forwarded-for': '10.0.0.1' }),
    )
    expect(res.status).toBe(400)
    expect(createBulyShortUrl).not.toHaveBeenCalled()
  })

  it('같은 IP가 1분 내 30회를 초과하면 429를 반환한다', async () => {
    createBulyShortUrl.mockResolvedValue('https://buly.kr/r')
    const body = {
      links: [{ key: 'team-a', orgUrl: `${ORIGIN}/room/r1?role=LEADER&teamId=t1` }],
    }
    for (let i = 0; i < 30; i++) {
      const res = await POST(
        makeRequest(body, { 'x-forwarded-for': '10.0.0.2' }),
      )
      expect(res.status).toBe(200)
    }
    const limited = await POST(
      makeRequest(body, { 'x-forwarded-for': '10.0.0.2' }),
    )
    expect(limited.status).toBe(429)
  })
})
