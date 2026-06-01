// 경매 OS와 브라우저 호환성 smoke 시나리오를 검증하는 테스트
import {
  devices,
  expect,
  test,
  type APIRequestContext,
  type BrowserContextOptions,
} from '@playwright/test'

type AuctionFixtureResetResponse = {
  roomId: string
  captainLinks: Array<{ teamId: string; teamName: string; link: string }>
}

type AuctionFixtureStateResponse = {
  liveBid: {
    team_id: string
    amount: number
    player_id?: string
    created_at?: string
  } | null
  bids: Array<{
    team_id: string
    amount: number
  }>
}

test.setTimeout(60_000)

async function getFixtureState(request: APIRequestContext, roomId: string) {
  const response = await request.get(`/api/e2e/auction-fixture/state?roomId=${roomId}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as AuctionFixtureStateResponse
}

function getRoleLink(fixture: AuctionFixtureResetResponse, teamName: string) {
  const link = fixture.captainLinks.find((entry) => entry.teamName === teamName)?.link
  if (!link) throw new Error(`fixture captain link is missing for ${teamName}`)
  return link
}

function contextOptionsForProject(projectName: string): BrowserContextOptions {
  const deviceName =
    projectName === 'mobile-chrome'
      ? 'Pixel 5'
      : projectName === 'mobile-safari'
        ? 'iPhone 12'
        : null

  if (!deviceName) return { reducedMotion: 'reduce' }

  const options = devices[deviceName] as BrowserContextOptions & {
    defaultBrowserType?: string
  }
  const { defaultBrowserType, ...contextOptions } = options
  void defaultBrowserType

  return {
    ...contextOptions,
    reducedMotion: 'reduce',
  }
}

test('keeps direct bid state consistent across compatibility projects', async ({
  request,
  browser,
}, testInfo) => {
  const response = await request.post('/api/e2e/auction-fixture/reset', {
    data: { stage: 'active-auction' },
  })
  expect(response.ok()).toBeTruthy()
  const fixture = (await response.json()) as AuctionFixtureResetResponse

  const contextOptions = contextOptionsForProject(testInfo.project.name)
  const blueContext = await browser.newContext(contextOptions)
  const redContext = await browser.newContext(contextOptions)

  try {
    const bluePage = await blueContext.newPage()
    const redPage = await redContext.newPage()

    await bluePage.goto(getRoleLink(fixture, 'Blue'))
    await redPage.goto(getRoleLink(fixture, 'Red'))

    const blueBidInput = bluePage.locator('input[type="number"]').first()
    const redBidInput = redPage.locator('input[type="number"]').first()

    await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({
      timeout: 10000,
    })
    await expect(redPage.getByRole('button', { name: '입찰하기' })).toBeEnabled({
      timeout: 10000,
    })
    await expect(blueBidInput).toHaveValue('10')
    await expect(redBidInput).toHaveValue('10')

    await blueBidInput.fill('10')
    await bluePage.getByRole('button', { name: '입찰하기' }).click()

    await expect(bluePage.getByRole('button', { name: '최고 입찰 유지 중' })).toBeVisible()
    await expect(redBidInput).toHaveValue('20', { timeout: 5000 })

    await expect
      .poll(async () => {
        const state = await getFixtureState(request, fixture.roomId)
        return state.liveBid
      })
      .toMatchObject({ team_id: 'team-blue', amount: 10 })

    const state = await getFixtureState(request, fixture.roomId)
    expect(state.bids).toHaveLength(1)
    expect(state.bids[0]).toMatchObject({ team_id: 'team-blue', amount: 10 })
  } finally {
    await blueContext.close()
    await redContext.close()
  }
})
