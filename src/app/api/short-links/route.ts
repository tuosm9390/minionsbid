import { NextRequest, NextResponse } from 'next/server'
import { createBulyShortUrl } from '@/lib/buly'

type ShortLinkRequest = {
  links?: Array<{
    key?: string
    orgUrl?: string
  }>
}

// 외부 단축 URL API(buly) 쿼터 보호용 — 인스턴스 단위 best-effort 제한
const MAX_LINKS_PER_REQUEST = 20
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 30
const requestLog = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  if (requestLog.size > 1000) {
    for (const [key, timestamps] of requestLog) {
      if (timestamps.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
        requestLog.delete(key)
      }
    }
  }
  const recent = (requestLog.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  )
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, recent)
    return true
  }
  recent.push(now)
  requestLog.set(ip, recent)
  return false
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 },
    )
  }

  const payload = (await request.json().catch(() => null)) as ShortLinkRequest | null
  const links = payload?.links ?? []

  if (links.length === 0) {
    return NextResponse.json({ error: 'links가 필요합니다.' }, { status: 400 })
  }
  if (links.length > MAX_LINKS_PER_REQUEST) {
    return NextResponse.json(
      { error: `한 번에 최대 ${MAX_LINKS_PER_REQUEST}개의 링크만 처리할 수 있습니다.` },
      { status: 400 },
    )
  }

  const origin = request.nextUrl.origin

  const results = await Promise.all(
    links.map(async (link) => {
      const key = link.key ?? ''
      const orgUrl = link.orgUrl ?? ''

      try {
        if (!key || !orgUrl) {
          throw new Error('key와 orgUrl이 필요합니다.')
        }

        const url = new URL(orgUrl)
        if (url.origin !== origin || !url.pathname.startsWith('/room/')) {
          throw new Error('허용되지 않은 URL입니다.')
        }

        const shortUrl = await createBulyShortUrl(orgUrl)
        return {
          key,
          orgUrl,
          shortUrl,
          error: null,
        }
      } catch (error) {
        return {
          key,
          orgUrl,
          shortUrl: null,
          error: error instanceof Error ? error.message : '단축 URL 생성 실패',
        }
      }
    }),
  )

  return NextResponse.json({ links: results })
}
