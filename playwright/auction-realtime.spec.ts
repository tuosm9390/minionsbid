import { expect, test, type APIRequestContext } from '@playwright/test'

type AuctionFixtureResetResponse = {
  roomId: string
  organizerLink: string
  viewerLink: string
  captainLinks: Array<{ teamId: string; teamName: string; link: string }>
}

type AuctionFixtureStateResponse = {
  roomId: string
  currentPlayerId: string | null
  timerEndsAt: string | null
  presences: Array<{
    role: string | null
    teamId: string | null
  }>
  liveBid: {
    player_id: string
    team_id: string
    amount: number
    created_at: string
  } | null
  bids: Array<{
    id: string
    player_id: string
    team_id: string
    amount: number
  }>
  revision: number
}

type LatencyMarker = {
  eventId: string
  amount?: number | null
  respondedAt?: number
  appliedAt?: number
  source?: 'client-click' | 'client-response' | 'rtdb' | 'room-fallback'
}

async function getFixtureState(request: APIRequestContext, roomId: string) {
  const response = await request.get(`/api/e2e/auction-fixture/state?roomId=${roomId}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as AuctionFixtureStateResponse
}

async function sendFixtureCommand(
  request: APIRequestContext,
  payload: Record<string, unknown>,
) {
  const response = await request.post('/api/e2e/auction-fixture/command', {
    data: payload,
  })
  expect(response.ok()).toBeTruthy()
  return response
}

function parseTimerSeconds(text: string | null) {
  const clockMatch = text?.match(/(\d{2}):(\d{2})/)
  if (clockMatch) {
    return Number(clockMatch[1]) * 60 + Number(clockMatch[2])
  }
  const numericMatch = text?.match(/(\d+(?:\.\d+)?)/)
  if (!numericMatch) return 0
  return Number(numericMatch[1])
}

async function getLatencyMarkers(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    return (
      (
        window as Window & {
          __auctionLatencyMarkers__?: LatencyMarker[]
        }
      ).__auctionLatencyMarkers__ ?? []
    ) as LatencyMarker[]
  })
}

test('extends timer and syncs min bid across organizer and leaders', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'active-auction' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const redContext = await browser.newContext({ reducedMotion: 'reduce' })

  const organizerPage = await organizerContext.newPage()
  const bluePage = await blueContext.newPage()
  const redPage = await redContext.newPage()

  const blueLink = fixture.captainLinks.find((entry) => entry.teamName === 'Blue')?.link
  const redLink = fixture.captainLinks.find((entry) => entry.teamName === 'Red')?.link

  if (!blueLink || !redLink) {
    throw new Error('fixture captain links are incomplete')
  }

  await organizerPage.goto(fixture.organizerLink)
  await bluePage.goto(blueLink)
  await redPage.goto(redLink)

  await expect(organizerPage.getByText('Fixture Auction')).toBeVisible()

  const blueBidInput = bluePage.locator('input[type="number"]').first()
  const redBidInput = redPage.locator('input[type="number"]').first()
  const organizerTimer = organizerPage.locator('[role="timer"]')

  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(redPage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(redBidInput).toHaveValue('10')
  await expect(bluePage.locator('[role="timer"]')).toBeVisible()
  await expect
    .poll(
      async () => parseTimerSeconds(await organizerTimer.textContent()),
      { timeout: 12000 },
    )
    .toBeLessThanOrEqual(2.5)
  const timerBeforeBid = parseTimerSeconds(await organizerTimer.textContent())

  await blueBidInput.fill('10')
  await bluePage.getByRole('button', { name: '입찰하기' }).click()

  await expect(bluePage.getByRole('button', { name: '최고 입찰 유지 중' })).toBeVisible()
  await expect(redBidInput).toHaveValue('20', { timeout: 3000 })
  await expect
    .poll(
      async () => parseTimerSeconds(await organizerTimer.textContent()),
      { timeout: 3000 },
    )
    .toBeGreaterThan(timerBeforeBid + 1.5)

  await organizerContext.close()
  await blueContext.close()
  await redContext.close()
})

test('serializes concurrent bids so every client converges on one canonical winner', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'active-auction' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const blueLink = fixture.captainLinks.find((entry) => entry.teamName === 'Blue')?.link
  const redLink = fixture.captainLinks.find((entry) => entry.teamName === 'Red')?.link

  if (!blueLink || !redLink) {
    throw new Error('fixture captain links are incomplete')
  }

  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const redContext = await browser.newContext({ reducedMotion: 'reduce' })
  const bluePage = await blueContext.newPage()
  const redPage = await redContext.newPage()

  await bluePage.goto(blueLink)
  await redPage.goto(redLink)

  const blueBidInput = bluePage.locator('input[type="number"]').first()
  const redBidInput = redPage.locator('input[type="number"]').first()
  const blueBidButton = bluePage.getByRole('button', { name: '입찰하기' })
  const redBidButton = redPage.getByRole('button', { name: '입찰하기' })

  await expect(blueBidButton).toBeEnabled({ timeout: 10000 })
  await expect(redBidButton).toBeEnabled({ timeout: 10000 })
  await expect(blueBidInput).toHaveValue('10')
  await expect(redBidInput).toHaveValue('10')

  await blueBidInput.fill('10')
  await redBidInput.fill('10')

  await Promise.all([blueBidButton.click(), redBidButton.click()])

  await expect
    .poll(async () => {
      const state = await getFixtureState(request, fixture.roomId)
      return state.bids.length === 1 && state.liveBid?.amount === 10 ? state.liveBid.team_id : null
    })
    .not.toBeNull()

  const state = await getFixtureState(request, fixture.roomId)
  expect(state.revision).toBe(2)
  expect(state.bids).toHaveLength(1)
  expect(state.liveBid?.amount).toBe(10)
  expect(state.liveBid?.team_id === 'team-blue' || state.liveBid?.team_id === 'team-red').toBe(
    true,
  )

  if (state.liveBid?.team_id === 'team-blue') {
    await expect(bluePage.getByRole('button', { name: '최고 입찰 유지 중' })).toBeVisible({
      timeout: 3000,
    })
    await expect(redBidInput).toHaveValue('20', { timeout: 3000 })
    await expect(redPage.getByRole('button', { name: '입찰하기' })).toBeEnabled()
  } else {
    await expect(redPage.getByRole('button', { name: '최고 입찰 유지 중' })).toBeVisible({
      timeout: 3000,
    })
    await expect(blueBidInput).toHaveValue('20', { timeout: 3000 })
    await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled()
  }

  await blueContext.close()
  await redContext.close()
})

test('propagates a representative winning bid to another client within 500ms', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'active-auction' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const blueLink = fixture.captainLinks.find((entry) => entry.teamName === 'Blue')?.link
  const redLink = fixture.captainLinks.find((entry) => entry.teamName === 'Red')?.link

  if (!blueLink || !redLink) {
    throw new Error('fixture captain links are incomplete')
  }

  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const redContext = await browser.newContext({ reducedMotion: 'reduce' })
  const bluePage = await blueContext.newPage()
  const redPage = await redContext.newPage()

  await bluePage.goto(blueLink)
  await redPage.goto(redLink)

  const blueBidInput = bluePage.locator('input[type="number"]').first()
  const redBidInput = redPage.locator('input[type="number"]').first()

  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(redPage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(redBidInput).toHaveValue('10')

  await bluePage.evaluate(() => {
    ;(
      window as Window & {
        __auctionLatencyMarkers__?: LatencyMarker[]
      }
    ).__auctionLatencyMarkers__ = []
  })
  await redPage.evaluate(() => {
    ;(
      window as Window & {
        __auctionLatencyMarkers__?: LatencyMarker[]
      }
    ).__auctionLatencyMarkers__ = []
  })

  await blueBidInput.fill('10')
  const clickedAt = Date.now()
  await bluePage.getByRole('button', { name: '입찰하기' }).click()
  await expect(redBidInput).toHaveValue('20', { timeout: 500 })
  expect(Date.now() - clickedAt).toBeLessThanOrEqual(500)

  await expect
    .poll(
      async () => {
        const markers = await getLatencyMarkers(redPage)
        return (
          markers.find((marker) => marker.source === 'rtdb' && marker.amount === 10) ?? null
        )
      },
      { timeout: 1000 },
    )
    .not.toBeNull()

  const blueMarkers = await getLatencyMarkers(bluePage)
  const redMarkers = await getLatencyMarkers(redPage)
  const responseMarker = blueMarkers.find(
    (marker) => marker.source === 'client-response' && marker.amount === 10,
  )
  const appliedMarker = redMarkers.find(
    (marker) => marker.source === 'rtdb' && marker.amount === 10,
  )

  expect(appliedMarker?.eventId).toBeDefined()
  expect(appliedMarker?.appliedAt).toBeDefined()
  expect((appliedMarker?.appliedAt ?? 0) - clickedAt).toBeLessThanOrEqual(500)
  if (responseMarker?.eventId) {
    expect(appliedMarker?.eventId).toBe(responseMarker.eventId)
  }

  const state = await getFixtureState(request, fixture.roomId)
  expect(state.liveBid?.team_id).toBe('team-blue')
  expect(state.liveBid?.amount).toBe(10)

  await blueContext.close()
  await redContext.close()
})

test('moves from closed lottery state to live bidding for organizer and leaders', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'waiting' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const blueLink = fixture.captainLinks.find((entry) => entry.teamName === 'Blue')?.link
  if (!blueLink) {
    throw new Error('fixture blue link is missing')
  }

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const organizerPage = await organizerContext.newPage()
  const bluePage = await blueContext.newPage()

  await organizerPage.goto(fixture.organizerLink)
  await bluePage.goto(blueLink)

  await expect(organizerPage.getByText('Fixture Auction')).toBeVisible()
  await expect(bluePage.getByText('Fixture Auction')).toBeVisible()

  await sendFixtureCommand(request, {
    roomId: fixture.roomId,
    action: 'draw',
  })

  const drawState = await getFixtureState(request, fixture.roomId)
  const currentPlayerId = drawState.currentPlayerId
  if (!currentPlayerId) {
    throw new Error('fixture draw did not select a current player')
  }

  await sendFixtureCommand(request, {
    roomId: fixture.roomId,
    action: 'closeLottery',
    playerName: 'Alpha',
  })

  const startButton = organizerPage.getByRole('button', { name: '경매 시작' })
  await expect(startButton).toBeVisible({ timeout: 8_000 })
  await startButton.click()

  await expect(organizerPage.locator('[role="timer"]')).toBeVisible({ timeout: 5_000 })
  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({
    timeout: 8_000,
  })
  await expect(bluePage.locator('input[type="number"]').first()).toHaveValue('10')

  const state = await getFixtureState(request, fixture.roomId)
  expect(state.currentPlayerId).not.toBeNull()
  expect(state.timerEndsAt).not.toBeNull()

  await organizerContext.close()
  await blueContext.close()
})

test('heals bid state from room fallback event when direct fixture bid sync is skipped', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'active-auction' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const blueLink = fixture.captainLinks.find((entry) => entry.teamName === 'Blue')?.link
  const redLink = fixture.captainLinks.find((entry) => entry.teamName === 'Red')?.link

  if (!blueLink || !redLink) {
    throw new Error('fixture captain links are incomplete')
  }

  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const fallbackContext = await browser.newContext({ reducedMotion: 'reduce' })
  const bluePage = await blueContext.newPage()
  const fallbackPage = await fallbackContext.newPage()

  await bluePage.goto(blueLink)
  await fallbackPage.goto(`${redLink}&fixtureFallbackMode=1`)

  const blueBidInput = bluePage.locator('input[type="number"]').first()
  const fallbackBidInput = fallbackPage.locator('input[type="number"]').first()

  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(fallbackPage.getByRole('button', { name: '입찰하기' })).toBeEnabled({
    timeout: 10000,
  })
  await expect(fallbackBidInput).toHaveValue('10')

  await blueBidInput.fill('10')
  await bluePage.getByRole('button', { name: '입찰하기' }).click()

  await expect(fallbackBidInput).toHaveValue('20', { timeout: 3000 })
  await expect(
    fallbackPage.getByText(/Blue 팀이 10포인트로 선두입니다/),
  ).toBeVisible({ timeout: 3000 })

  const state = await getFixtureState(request, fixture.roomId)
  expect(state.liveBid?.team_id).toBe('team-blue')
  expect(state.liveBid?.amount).toBe(10)

  await blueContext.close()
  await fallbackContext.close()
})

test('pauses the auction when a leader disconnects and resumes after reconnection', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'active-auction' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const organizerPage = await organizerContext.newPage()
  await organizerPage.goto(fixture.organizerLink)

  await expect(organizerPage.getByText('Fixture Auction')).toBeVisible()
  await expect(organizerPage.locator('[role="timer"]')).toBeVisible({ timeout: 10000 })

  await sendFixtureCommand(request, {
    roomId: fixture.roomId,
    action: 'setLeaderPresence',
    teamId: 'team-red',
    connected: false,
  })

  await expect(organizerPage.getByRole('heading', { name: '연결 끊김' })).toBeVisible({
    timeout: 5000,
  })
  await expect(organizerPage.getByText(/경매가 일시정지되었습니다/)).toBeVisible({ timeout: 5000 })
  await expect
    .poll(async () => {
      const state = await getFixtureState(request, fixture.roomId)
      return {
        timerEndsAt: state.timerEndsAt,
        leaderCount: state.presences.filter((presence) => presence.role === 'LEADER').length,
      }
    })
    .toEqual({
      timerEndsAt: null,
      leaderCount: 1,
    })

  await sendFixtureCommand(request, {
    roomId: fixture.roomId,
    action: 'setLeaderPresence',
    teamId: 'team-red',
    connected: true,
  })

  await expect(organizerPage.getByRole('heading', { name: '연결 끊김' })).toHaveCount(0, {
    timeout: 5000,
  })
  await expect(organizerPage.locator('[role="timer"]')).toBeVisible({ timeout: 5000 })
  await expect
    .poll(async () => {
      const state = await getFixtureState(request, fixture.roomId)
      return {
        hasTimer: !!state.timerEndsAt,
        leaderCount: state.presences.filter((presence) => presence.role === 'LEADER').length,
      }
    })
    .toEqual({
      hasTimer: true,
      leaderCount: 2,
    })

  await organizerContext.close()
})

test('drafts the last slot using the team remaining points', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'draft-last-slot' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const organizerPage = await organizerContext.newPage()

  await organizerPage.goto(fixture.organizerLink)

  await expect(organizerPage.getByText('Fixture Auction')).toBeVisible()
  await expect(organizerPage.getByText('유찰 선수 배정')).toBeVisible()
  await expect(organizerPage.getByText('Blue (100P)')).toBeVisible()
  await expect(organizerPage.getByRole('button', { name: '배정' })).toBeVisible()

  await organizerPage.getByRole('button', { name: '배정' }).click()

  await expect(organizerPage.getByRole('heading', { name: 'Blue' })).toBeVisible({ timeout: 3000 })
  await expect(organizerPage.getByText('0 P', { exact: true }).first()).toBeVisible({
    timeout: 3000,
  })
  await expect(organizerPage.getByText('유찰된 플레이어가 없습니다')).toBeVisible({ timeout: 3000 })
  await expect(
    organizerPage.getByText(/Blue이\(가\) Delta 선수를.*100P.*드래프트 영입!/),
  ).toBeVisible({ timeout: 3000 })

  await organizerContext.close()
})

test('marks the player unsold after organizer-side timer expiry and syncs unsold state', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'active-auction-expiring' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const viewerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const organizerPage = await organizerContext.newPage()
  const viewerPage = await viewerContext.newPage()

  await organizerPage.goto(fixture.organizerLink)
  await viewerPage.goto(fixture.viewerLink)

  await expect(organizerPage.locator('[role="timer"]')).toBeVisible({ timeout: 10000 })
  await expect(
    organizerPage.getByText(/Alpha 선수 유찰/),
  ).toBeVisible({ timeout: 5000 })
  await expect(viewerPage.getByText('경매 준비 완료')).toBeVisible({ timeout: 5000 })
  await expect(viewerPage.locator('aside').getByText('Alpha', { exact: true })).toBeVisible({
    timeout: 5000,
  })
  await expect(viewerPage.getByText('유찰된 플레이어가 없습니다')).toHaveCount(0)

  await organizerContext.close()
  await viewerContext.close()
})

test('starts re-auction from unsold draft state and syncs waiting state', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'unsold-reauction' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const viewerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const organizerPage = await organizerContext.newPage()
  const viewerPage = await viewerContext.newPage()

  await organizerPage.goto(fixture.organizerLink)
  await viewerPage.goto(fixture.viewerLink)

  await expect(organizerPage.getByText('재경매 진행')).toBeVisible()
  await expect(organizerPage.getByRole('button', { name: '재경매 시작' })).toBeVisible()
  await expect(viewerPage.getByText('재경매 진행')).toBeVisible()
  await expect(viewerPage.locator('aside').getByText('Alpha', { exact: true })).toBeVisible()
  await expect(viewerPage.locator('aside').getByText('Beta', { exact: true })).toBeVisible()
  await expect(viewerPage.locator('aside').getByText('Gamma', { exact: true })).toBeVisible()
  await expect(viewerPage.locator('aside').getByText('Delta', { exact: true })).toBeVisible()

  await organizerPage.getByRole('button', { name: '재경매 시작' }).click()

  await expect(organizerPage.getByText(/다음 선수 추첨 \(4 명\)/)).toBeVisible({
    timeout: 3000,
  })
  await expect(viewerPage.getByText('경매 준비 완료')).toBeVisible({ timeout: 3000 })
  await expect(viewerPage.getByText('유찰된 플레이어가 없습니다')).toBeVisible({
    timeout: 3000,
  })
  await expect(
    viewerPage.getByText(/유찰 선수 재경매를 시작합니다! \(4명\)/),
  ).toBeVisible({ timeout: 3000 })

  await organizerContext.close()
  await viewerContext.close()
})

test('keeps the auction alive when a bid lands in the final second', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'active-auction-final-second' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const redContext = await browser.newContext({ reducedMotion: 'reduce' })
  const organizerPage = await organizerContext.newPage()
  const bluePage = await blueContext.newPage()
  const redPage = await redContext.newPage()

  const blueLink = fixture.captainLinks.find((entry) => entry.teamName === 'Blue')?.link
  const redLink = fixture.captainLinks.find((entry) => entry.teamName === 'Red')?.link

  if (!blueLink || !redLink) {
    throw new Error('fixture captain links are incomplete')
  }

  await organizerPage.goto(fixture.organizerLink)
  await bluePage.goto(blueLink)
  await redPage.goto(redLink)

  const blueBidInput = bluePage.locator('input[type="number"]').first()
  const redBidInput = redPage.locator('input[type="number"]').first()
  const organizerTimer = organizerPage.locator('[role="timer"]')
  const blueTimer = bluePage.locator('[role="timer"]')

  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(redPage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(blueTimer).toBeVisible({ timeout: 10000 })
  await expect
    .poll(
      async () => parseTimerSeconds(await blueTimer.textContent()),
      { timeout: 15000 },
    )
    .toBeLessThanOrEqual(1.6)
  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 3000 })

  await blueBidInput.fill('10')
  await bluePage.getByRole('button', { name: '입찰하기' }).click()

  await expect(bluePage.getByRole('button', { name: '최고 입찰 유지 중' })).toBeVisible({
    timeout: 3000,
  })
  await expect(redBidInput).toHaveValue('20', { timeout: 3000 })
  await expect
    .poll(
      async () => parseTimerSeconds(await organizerTimer.textContent()),
      { timeout: 3000 },
    )
    .toBeGreaterThan(3)

  await expect(organizerPage.getByText(/Alpha 선수 유찰/)).toHaveCount(0)
  await expect(organizerPage.getByText(/다음 선수 추첨/)).toHaveCount(0)
  await expect(organizerPage.getByText('Fixture Auction')).toBeVisible()

  await organizerContext.close()
  await blueContext.close()
  await redContext.close()
})

test('awards the winning bid and syncs roster plus point balance across clients', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'active-auction-final-second' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const viewerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const organizerPage = await organizerContext.newPage()
  const bluePage = await blueContext.newPage()
  const viewerPage = await viewerContext.newPage()

  const blueLink = fixture.captainLinks.find((entry) => entry.teamName === 'Blue')?.link
  if (!blueLink) {
    throw new Error('fixture blue link is missing')
  }

  await organizerPage.goto(fixture.organizerLink)
  await bluePage.goto(blueLink)
  await viewerPage.goto(fixture.viewerLink)

  const organizerTimer = organizerPage.locator('[role="timer"]')
  const blueBidInput = bluePage.locator('input[type="number"]').first()
  const blueTimer = bluePage.locator('[role="timer"]')

  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(blueTimer).toBeVisible({ timeout: 10000 })
  await expect
    .poll(
      async () => parseTimerSeconds(await blueTimer.textContent()),
      { timeout: 15000 },
    )
    .toBeLessThanOrEqual(1.6)
  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 3000 })

  await blueBidInput.fill('10')
  await bluePage.getByRole('button', { name: '입찰하기' }).click()

  await expect(organizerPage.getByText(/Blue이 Alpha 선수를 10P에 낙찰!/)).toBeVisible({
    timeout: 12000,
  })
  await expect(organizerPage.getByText('경매 준비 완료')).toBeVisible({ timeout: 12000 })
  await expect(organizerPage.locator('aside').first().getByText(/990\s*P/)).toBeVisible()
  await expect(organizerPage.locator('aside').first().getByText('Alpha', { exact: true })).toBeVisible()

  await expect(viewerPage.getByText(/Blue이 Alpha 선수를 10P에 낙찰!/)).toBeVisible({
    timeout: 12000,
  })
  await expect(viewerPage.locator('aside').first().getByText(/990\s*P/)).toBeVisible()
  await expect(viewerPage.locator('aside').first().getByText('Alpha', { exact: true })).toBeVisible()

  await organizerContext.close()
  await blueContext.close()
  await viewerContext.close()
})

test('syncs leader chat to every client without duplicating the sender message', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'waiting' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const viewerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const organizerPage = await organizerContext.newPage()
  const bluePage = await blueContext.newPage()
  const viewerPage = await viewerContext.newPage()

  const blueLink = fixture.captainLinks.find((entry) => entry.teamName === 'Blue')?.link
  if (!blueLink) {
    throw new Error('fixture blue link is missing')
  }

  await organizerPage.goto(fixture.organizerLink)
  await bluePage.goto(blueLink)
  await viewerPage.goto(fixture.viewerLink)

  const chatText = `blue-live-${Date.now()}`
  await bluePage.getByPlaceholder('메시지를 입력하세요...').fill(chatText)
  await bluePage.getByRole('button', { name: 'SEND' }).click()

  await expect(bluePage.getByText(chatText, { exact: true })).toHaveCount(1)
  await expect(organizerPage.getByText(chatText, { exact: true })).toBeVisible({
    timeout: 3000,
  })
  await expect(viewerPage.getByText(chatText, { exact: true })).toBeVisible({
    timeout: 3000,
  })
  await expect(bluePage.getByText('Blue Leader', { exact: true })).toBeVisible()

  await organizerContext.close()
  await blueContext.close()
  await viewerContext.close()
})

test('syncs organizer notice to every client in chat and notice banner', async ({
  request,
  browser,
}) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'waiting' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const viewerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const organizerPage = await organizerContext.newPage()
  const viewerPage = await viewerContext.newPage()

  await organizerPage.goto(fixture.organizerLink)
  await viewerPage.goto(fixture.viewerLink)

  const noticeText = `notice-live-${Date.now()}`
  await organizerPage.getByPlaceholder('공지를 작성해주세요...').fill(noticeText)
  await organizerPage.getByRole('button', { name: '전송' }).click()

  await expect(organizerPage.getByText(noticeText, { exact: true })).toHaveCount(2, {
    timeout: 3000,
  })
  await expect(viewerPage.getByText(noticeText, { exact: true })).toHaveCount(2, {
    timeout: 3000,
  })
  await expect(viewerPage.getByText('IMPORTANT')).toBeVisible({ timeout: 3000 })

  await organizerContext.close()
  await viewerContext.close()
})
