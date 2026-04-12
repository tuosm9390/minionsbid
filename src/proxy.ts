import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'production' ? '' : "'unsafe-eval'"};
    style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
    connect-src 'self' https://cdn.jsdelivr.net https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firestore.googleapis.com https://*.firebasedatabase.app wss://*.firebasedatabase.app;
    img-src 'self' data:;
    font-src 'self' https://cdn.jsdelivr.net;
    frame-src 'none';
    frame-ancestors 'none';
    object-src 'none';
    base-uri 'none';
  `.replace(/\s{2,}/g, ' ').trim()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Content-Security-Policy', cspHeader)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  response.headers.set('Content-Security-Policy', cspHeader)
  // X-Content-Type-Options 등 추가 보안 헤더
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '0')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
