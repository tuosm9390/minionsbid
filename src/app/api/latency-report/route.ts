// 클라이언트 경매 latency 리포트를 Firestore latency_reports 컬렉션에 적재하는 운영 관측용 API
import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebaseAdmin'

type LatencyReportRequest = {
  roomId?: string
  sampleCount?: number
  p50EndToEndMs?: number | null
  p95EndToEndMs?: number | null
  maxEndToEndMs?: number | null
  sourceCounts?: Record<string, number>
  fallbackCount?: number
  fallbackReasons?: string[]
}

const ALLOWED_SOURCES = ['client-click', 'client-response', 'rtdb', 'room-fallback']
const MAX_FALLBACK_REASONS = 20
const MAX_REASON_LENGTH = 200
const MAX_ROOM_ID_LENGTH = 64
const REPORT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30일 (Firestore TTL 정책은 expires_at 필드 기준)

// 운영 관측용 비인증 엔드포인트 — 인스턴스 단위 best-effort 제한
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

function toFiniteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null
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

  const payload = (await request.json().catch(() => null)) as LatencyReportRequest | null
  const roomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : ''
  if (!roomId || roomId.length > MAX_ROOM_ID_LENGTH) {
    return NextResponse.json({ error: 'roomId가 필요합니다.' }, { status: 400 })
  }

  const sampleCount = toFiniteNonNegative(payload?.sampleCount) ?? 0
  const fallbackCount = toFiniteNonNegative(payload?.fallbackCount) ?? 0
  if (sampleCount === 0 && fallbackCount === 0) {
    return NextResponse.json({ error: '보고할 샘플이 없습니다.' }, { status: 400 })
  }

  const sourceCounts: Record<string, number> = {}
  for (const source of ALLOWED_SOURCES) {
    const count = toFiniteNonNegative(payload?.sourceCounts?.[source])
    if (count !== null && count > 0) {
      sourceCounts[source] = Math.floor(count)
    }
  }

  const fallbackReasons = (Array.isArray(payload?.fallbackReasons) ? payload.fallbackReasons : [])
    .filter((reason): reason is string => typeof reason === 'string')
    .slice(0, MAX_FALLBACK_REASONS)
    .map((reason) => reason.slice(0, MAX_REASON_LENGTH))

  try {
    const now = Date.now()
    await getAdminDb().collection('latency_reports').add({
      room_id: roomId,
      sample_count: Math.floor(sampleCount),
      p50_end_to_end_ms: toFiniteNonNegative(payload?.p50EndToEndMs),
      p95_end_to_end_ms: toFiniteNonNegative(payload?.p95EndToEndMs),
      max_end_to_end_ms: toFiniteNonNegative(payload?.maxEndToEndMs),
      source_counts: sourceCounts,
      fallback_count: Math.floor(fallbackCount),
      fallback_reasons: fallbackReasons,
      created_at: Timestamp.fromMillis(now),
      expires_at: Timestamp.fromMillis(now + REPORT_TTL_MS),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[latency-report] Firestore 저장 실패:', error)
    return NextResponse.json({ error: '리포트 저장에 실패했습니다.' }, { status: 500 })
  }
}
