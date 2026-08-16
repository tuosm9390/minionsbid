import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { syncLeagueDeeplolSchedule } from '@/features/deeplol/deeplolSync'
import {
  notifyDeeplolBatchFatalError,
  notifyDeeplolBatchSummary,
} from '@/features/notifications/discordWebhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return false
  const authorization = request.headers.get('authorization') ?? ''
  return authorization === `Bearer ${expected}`
}

function getLimit(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('limit') ?? process.env.DEEPLOL_CRON_MAX_SCHEDULES ?? '10'
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? Math.min(value, 50) : 10
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Cron 인증이 필요합니다.' }, { status: 401 })
  }

  const limit = getLimit(request)
  const summary = {
    mode: 'vercel-cron',
    candidateCount: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    schedules: [] as Array<Record<string, unknown>>,
  }

  try {
    const snapshot = await adminDb.collection('league_schedules').get()
    const candidates = snapshot.docs
      .map((doc) => ({ doc, data: doc.data() }))
      .filter(({ data }) => data.status !== 'COMPLETED')
      .filter(({ data }) => typeof data.deeplol_tournament_name === 'string' && data.deeplol_tournament_name.trim())
      .slice(0, limit)
    summary.candidateCount = candidates.length

    for (const { doc, data } of candidates) {
      try {
        const result = await syncLeagueDeeplolSchedule(doc.id)
        summary.schedules.push({
          scheduleId: doc.id,
          scheduleName: String(data.name ?? doc.id),
          status: 'COMPLETED',
          result,
        })
        summary.succeeded += 1
      } catch (error) {
        summary.schedules.push({
          scheduleId: doc.id,
          scheduleName: String(data.name ?? doc.id),
          status: 'ERROR',
          error: error instanceof Error ? error.message : String(error),
        })
        summary.failed += 1
      } finally {
        summary.processed += 1
      }
    }

    if (summary.processed > 0) {
      await notifyDeeplolBatchSummary(summary)
    }
    if (summary.failed > 0) {
      return NextResponse.json({ ok: false, ...summary }, { status: 500 })
    }

    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    await notifyDeeplolBatchFatalError(error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Deeplol Cron 실행에 실패했습니다.' },
      { status: 500 },
    )
  }
}
