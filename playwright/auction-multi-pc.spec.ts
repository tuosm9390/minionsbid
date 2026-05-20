// 다수 PC 경매 상황을 로컬 브라우저 컨텍스트로 재현하는 E2E 스모크 테스트
import { expect, test, type APIRequestContext } from '@playwright/test'

type AuctionFixtureResetResponse = {
  roomId: string
  organizerLink: string
  viewerLink: string
  captainLinks: Array<{ teamId: string; teamName: string; link: string }>
}

type AuctionFixtureStateResponse = {
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

async function resetAuctionFixture(request: APIRequestContext) {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'active-auction' },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as AuctionFixtureResetResponse
}

async function getFixtureState(request: APIRequestContext, roomId: string) {
  const response = await request.get(`/api/e2e/auction-fixture/state?roomId=${roomId}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as AuctionFixtureStateResponse
}

test('reproduces organizer, two leaders, and viewer as isolated local clients', async ({
  request,
  browser,
}) => {
  const fixture = await resetAuctionFixture(request)
  const blueLink = fixture.captainLinks.find((entry) => entry.teamName === 'Blue')?.link
  const redLink = fixture.captainLinks.find((entry) => entry.teamName === 'Red')?.link

  if (!blueLink || !redLink) {
    throw new Error('fixture captain links are incomplete')
  }

  const organizerContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: 'reduce',
  })
  const blueContext = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    reducedMotion: 'reduce',
  })
  const redContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  })
  const viewerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  })

  try {
    const organizerPage = await organizerContext.newPage()
    const bluePage = await blueContext.newPage()
    const redPage = await redContext.newPage()
    const viewerPage = await viewerContext.newPage()

    await Promise.all([
      organizerPage.goto(fixture.organizerLink),
      bluePage.goto(blueLink),
      redPage.goto(redLink),
      viewerPage.goto(fixture.viewerLink),
    ])

    await Promise.all([
      expect(organizerPage.getByText('Fixture Auction')).toBeVisible(),
      expect(bluePage.getByText('Fixture Auction')).toBeVisible(),
      expect(redPage.getByText('Fixture Auction')).toBeVisible(),
      expect(viewerPage.getByText('Fixture Auction')).toBeVisible(),
    ])

    const blueBidInput = bluePage.locator('input[type="number"]').first()
    const redBidInput = redPage.locator('input[type="number"]').first()
    const blueBidButton = bluePage.getByRole('button', { name: '입찰하기' })
    const redBidButton = redPage.getByRole('button', { name: '입찰하기' })

    await expect(blueBidButton).toBeEnabled({ timeout: 10000 })
    await expect(redBidButton).toBeEnabled({ timeout: 10000 })
    await expect(viewerPage.getByRole('button', { name: '입찰하기' })).toHaveCount(0)

    await blueBidInput.fill('10')
    await blueBidButton.click()

    await expect(bluePage.getByRole('button', { name: '최고 입찰 유지 중' })).toBeVisible()
    await expect(redBidInput).toHaveValue('20', { timeout: 3000 })
    await expect(organizerPage.getByText(/Blue 팀이 10포인트로 선두입니다/)).toBeVisible({
      timeout: 3000,
    })
    await expect(viewerPage.getByText(/Blue 팀이 10포인트로 선두입니다/)).toBeVisible({
      timeout: 3000,
    })

    await redBidInput.fill('20')
    await redBidButton.click()

    await expect(redPage.getByRole('button', { name: '최고 입찰 유지 중' })).toBeVisible()
    await expect(blueBidInput).toHaveValue('30', { timeout: 3000 })
    await expect(organizerPage.getByText(/Red이 20P에 입찰했습니다!/)).toBeVisible({
      timeout: 3000,
    })
    await expect(viewerPage.getByText(/Red이 20P에 입찰했습니다!/)).toBeVisible({
      timeout: 3000,
    })

    const state = await getFixtureState(request, fixture.roomId)
    expect(state.liveBid?.team_id).toBe('team-red')
    expect(state.liveBid?.amount).toBe(20)
    expect(state.bids).toHaveLength(2)
    expect(state.revision).toBe(3)
  } finally {
    await Promise.all([
      organizerContext.close(),
      blueContext.close(),
      redContext.close(),
      viewerContext.close(),
    ])
  }
})
