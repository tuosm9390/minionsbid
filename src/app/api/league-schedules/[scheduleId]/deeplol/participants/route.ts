import { FieldValue } from 'firebase-admin/firestore'
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

function authorized(request: NextRequest, body?: Record<string, unknown>) {
  const expected = process.env.HALL_OF_FAME_ADMIN_CODE
  const supplied = request.headers.get('x-admin-code') ?? String(body?.adminCode ?? '')
  return Boolean(expected && supplied === expected)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ scheduleId: string }> },
) {
  if (!authorized(request)) return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 403 })
  const { scheduleId } = await context.params
  const snapshot = await adminDb.collection('league_schedules').doc(scheduleId).collection('deeplol_participants').get()
  return NextResponse.json({
    participants: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ scheduleId: string }> },
) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  if (!authorized(request, body)) return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 403 })
  const { scheduleId } = await context.params
  const members = Array.isArray(body.members) ? body.members : []
  if (members.length === 0 || members.length > 100) {
    return NextResponse.json({ error: 'members는 1명 이상 100명 이하이어야 합니다.' }, { status: 400 })
  }

  const batch = adminDb.batch()
  const collection = adminDb.collection('league_schedules').doc(scheduleId).collection('deeplol_participants')
  for (const raw of members) {
    const member = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
    const puuId = String(member.puuId ?? member.puu_id ?? '').trim()
    if (!puuId) return NextResponse.json({ error: '모든 참가자에게 puuId가 필요합니다.' }, { status: 400 })
    const ref = collection.doc(encodeURIComponent(puuId))
    batch.set(ref, {
      puu_id: puuId,
      riot_name: typeof member.riotName === 'string' ? member.riotName.trim() : null,
      riot_tag: typeof member.riotTag === 'string' ? member.riotTag.trim() : null,
      team_id: typeof member.teamId === 'string' ? member.teamId.trim() : null,
      team_name: typeof member.teamName === 'string' ? member.teamName.trim() : null,
      position: typeof member.position === 'string' ? member.position.trim() : null,
      status: 'ACTIVE',
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  await batch.commit()
  return NextResponse.json({ ok: true, count: members.length })
}
