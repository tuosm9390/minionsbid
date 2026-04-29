import { expect, test } from '@playwright/test'

type AuctionFixtureResetResponse = {
  roomId: string
  organizerLink: string
  viewerLink: string
  captainLinks: Array<{ teamId: string; teamName: string; link: string }>
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
  const organizerTimer = organizerPage.locator('[role="timer"] span')

  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(redPage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(redBidInput).toHaveValue('10')
  await expect(bluePage.locator('[role="timer"] span')).toBeVisible()
  await expect
    .poll(
      async () => parseFloat((await organizerTimer.textContent()) ?? '0'),
      { timeout: 12000 },
    )
    .toBeLessThanOrEqual(2.5)
  const timerBeforeBid = parseFloat((await organizerTimer.textContent()) ?? '0')

  await blueBidInput.fill('10')
  await bluePage.getByRole('button', { name: '입찰하기' }).click()

  await expect(bluePage.getByRole('button', { name: '최고 입찰 유지 중' })).toBeVisible()
  await expect(redBidInput).toHaveValue('20', { timeout: 3000 })
  await expect
    .poll(
      async () => parseFloat((await organizerTimer.textContent()) ?? '0'),
      { timeout: 3000 },
    )
    .toBeGreaterThan(timerBeforeBid + 1.5)

  await organizerContext.close()
  await blueContext.close()
  await redContext.close()
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

  await expect(organizerPage.locator('[role="timer"] span')).toBeVisible({ timeout: 10000 })
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
  const organizerTimer = organizerPage.locator('[role="timer"] span')

  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect(redPage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect
    .poll(
      async () => parseFloat((await organizerTimer.textContent()) ?? '0'),
      { timeout: 10000 },
    )
    .toBeLessThanOrEqual(1.2)

  await blueBidInput.fill('10')
  await bluePage.getByRole('button', { name: '입찰하기' }).click()

  await expect(bluePage.getByRole('button', { name: '최고 입찰 유지 중' })).toBeVisible({
    timeout: 3000,
  })
  await expect(redBidInput).toHaveValue('20', { timeout: 3000 })
  await expect
    .poll(
      async () => parseFloat((await organizerTimer.textContent()) ?? '0'),
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

  const organizerTimer = organizerPage.locator('[role="timer"] span')
  const blueBidInput = bluePage.locator('input[type="number"]').first()

  await expect(bluePage.getByRole('button', { name: '입찰하기' })).toBeEnabled({ timeout: 10000 })
  await expect
    .poll(
      async () => parseFloat((await organizerTimer.textContent()) ?? '0'),
      { timeout: 10000 },
    )
    .toBeLessThanOrEqual(1.2)

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
