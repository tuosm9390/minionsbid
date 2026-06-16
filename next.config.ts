import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '0' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // HTTPS 강제 (배포 환경에서 HTTPS 사용 시 활성화)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Content-Security-Policy는 이제 src/middleware.ts에서 동적으로 nonce와 함께 생성됩니다.
]

const nextConfig: NextConfig = {
  // firebase-admin -> jwks-rsa -> jose(ESM-only) 체인이 번들링되면 서버리스 함수에서
  // ERR_REQUIRE_ESM으로 크래시한다. 네이티브 require로 남겨 번들링을 우회한다.
  serverExternalPackages: ['firebase-admin'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig;
