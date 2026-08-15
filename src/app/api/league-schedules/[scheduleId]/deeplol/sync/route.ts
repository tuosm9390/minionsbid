import { NextRequest, NextResponse } from 'next/server'
import { listLeagueDeeplolStats, syncLeagueDeeplolSchedule } from '@/features/deeplol/deeplolSync'

export const runtime = 'nodejs'

function isAuthorized(request: NextRequest, body: Record<string, unknown>) {
  const expected = process.env.HALL_OF_FAME_ADMIN_CODE
  const supplied = request.headers.get('x-admin-code') ?? String(body.adminCode ?? '')
  return Boolean(expected && supplied && supplied === expected)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ scheduleId: string }> },
) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  if (!isAuthorized(request, body)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 403 })
  }
  const { scheduleId } = await context.params
  try {
    const result = await syncLeagueDeeplolSchedule(scheduleId, {
      tournamentName: typeof body.tournamentName === 'string' ? body.tournamentName : undefined,
      memberPuuIds: Array.isArray(body.memberPuuIds) ? body.memberPuuIds.map(String) : undefined,
      platformId: typeof body.platformId === 'string' ? body.platformId : undefined,
      pageSize: typeof body.pageSize === 'number' ? body.pageSize : undefined,
      maxAttempts: typeof body.maxAttempts === 'number' ? body.maxAttempts : undefined,
      lockLeaseSeconds: typeof body.lockLeaseSeconds === 'number' ? body.lockLeaseSeconds : undefined,
      timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
    })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Deeplol 동기화에 실패했습니다.' },
      { status: 500 },
    )
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ scheduleId: string }> },
) {
  const body: Record<string, unknown> = {}
  if (!isAuthorized(request, body)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 403 })
  }
  const { scheduleId } = await context.params
  try {
    const stats = await listLeagueDeeplolStats(scheduleId)
    return NextResponse.json({ scheduleId, stats })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '전적을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
