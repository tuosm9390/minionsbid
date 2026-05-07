// 프록시 보안 헤더의 Firebase RTDB CSP 허용 범위를 검증한다.
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/server', () => ({
  NextResponse: {
    next: () => ({
      headers: new Headers(),
    }),
  },
}))

describe('proxy CSP', () => {
  it('allows Firebase RTDB sharded long-polling script hosts', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL =
      'https://gen-lang-client-0499827443-default-rtdb.asia-southeast1.firebasedatabase.app'

    const { proxy } = await import('@/proxy')
    const response = proxy({
      headers: new Headers(),
    } as never)

    const csp = response.headers.get('Content-Security-Policy') ?? ''

    expect(csp).toContain('script-src-elem')
    expect(csp).toContain('https://*.firebasedatabase.app')
    expect(csp).toContain(
      'https://gen-lang-client-0499827443-default-rtdb.asia-southeast1.firebasedatabase.app',
    )
  })
})
