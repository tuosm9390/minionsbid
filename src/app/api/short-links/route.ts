import { NextRequest, NextResponse } from 'next/server'
import { createBulyShortUrl } from '@/lib/buly'

type ShortLinkRequest = {
  links?: Array<{
    key?: string
    orgUrl?: string
  }>
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as ShortLinkRequest | null
  const links = payload?.links ?? []

  if (links.length === 0) {
    return NextResponse.json({ error: 'links가 필요합니다.' }, { status: 400 })
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
