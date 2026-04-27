import { NextResponse } from 'next/server'
import {
  isE2EScheduleFixtureEnabled,
  resetE2EScheduleFixture,
} from '@/features/schedules/api/e2eScheduleFixture'

export async function POST() {
  if (!isE2EScheduleFixtureEnabled()) {
    return NextResponse.json({ error: 'fixture disabled' }, { status: 404 })
  }

  resetE2EScheduleFixture()
  return NextResponse.json({ ok: true })
}
