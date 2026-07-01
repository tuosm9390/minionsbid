import { NextRequest, NextResponse } from 'next/server'
import {
  isE2EAuctionFixtureEnabled,
  resetE2EAuctionFixture,
} from '@/features/auction/api/e2eAuctionFixture'

export async function POST(request: NextRequest) {
  if (!isE2EAuctionFixtureEnabled()) {
    return NextResponse.json({ error: 'fixture disabled' }, { status: 404 })
  }

  const baseUrl = request.nextUrl.origin
  const body = await request.json().catch(() => ({}))
  const stage =
    body?.stage === 'active-auction'
      ? 'active-auction'
      : body?.stage === 'active-auction-expiring'
        ? 'active-auction-expiring'
      : body?.stage === 'active-auction-final-second'
        ? 'active-auction-final-second'
      : body?.stage === 'desired-team-conflict'
        ? 'desired-team-conflict'
      : body?.stage === 'team-assignment-finished'
        ? 'team-assignment-finished'
      : body?.stage === 'desired-team-random-finished'
        ? 'desired-team-random-finished'
      : body?.stage === 'draft-last-slot'
        ? 'draft-last-slot'
      : body?.stage === 'unsold-reauction'
        ? 'unsold-reauction'
        : 'waiting'
  const result = resetE2EAuctionFixture(baseUrl, { stage })
  return NextResponse.json({ ok: true, ...result })
}
