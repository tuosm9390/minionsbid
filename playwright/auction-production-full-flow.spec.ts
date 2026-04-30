import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(420_000)

type RoomLinks = {
  organizerLink: string
  viewerLink: string
  leaders: Array<{ teamName: string; link: string }>
}

type LeaderDebugState = {
  logs: string[]
}

type LatencyMarker = {
  eventId: string
  amount?: number | null
  respondedAt?: number
  appliedAt?: number
  source?: 'client-click' | 'client-response' | 'rtdb' | 'room-fallback'
}

function withDebugRealtime(url: string) {
  const parsed = new URL(url)
  parsed.searchParams.set('debugRealtime', '1')
  return parsed.toString()
}

function withRealtimeFlags(
  url: string,
  flags: { debugRealtime?: boolean; skipAuctionEvent?: boolean },
) {
  const parsed = new URL(url)
  if (flags.debugRealtime) {
    parsed.searchParams.set('debugRealtime', '1')
  }
  if (flags.skipAuctionEvent) {
    parsed.searchParams.set('skipAuctionEvent', '1')
  }
  return parsed.toString()
}

function shuffleArray<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function toBidAmount(value: string | number | null | undefined, fallback = 10) {
  const numeric =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return numeric
}

async function extractRoomLinks(page: Page): Promise<RoomLinks> {
  const cards = page.locator('.border-2.border-black.bg-white.shadow-\\[4px_4px_0px_0px_rgba\\(0\\,0\\,0\\,1\\)\\].relative')
  const count = await cards.count()
  let organizerLink = ''
  let viewerLink = ''
  const leaders: Array<{ teamName: string; link: string }> = []

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index)
    const label = ((await card.locator('p').first().textContent()) ?? '').trim()
    const link = (((await card.locator('p.font-mono').textContent()) ?? '').match(/https?:\/\/\S+/)?.[0] ?? '').trim()
    if (!label || !link) continue
    if (label.includes('주최자')) organizerLink = link
    else if (label.includes('관전자')) viewerLink = link
    else leaders.push({ teamName: label, link })
  }

  if (!organizerLink || !viewerLink || leaders.length < 2) {
    throw new Error('발급된 링크를 파싱하지 못했습니다.')
  }

  return { organizerLink, viewerLink, leaders }
}

async function waitForAllConnected(organizerPage: Page) {
  await expect(
    organizerPage.getByText('모든 팀장님들의 접속을 기다리는 중...'),
  ).toHaveCount(0, { timeout: 20_000 })
  await expect(
    organizerPage.getByRole('button', { name: /다음 선수 추첨/ }),
  ).toBeEnabled({ timeout: 20_000 })
}

async function prepareAuctionFromLottery(organizerPage: Page) {
  const prepareButton = organizerPage.getByRole('button', { name: '경매 준비' })
  await expect(prepareButton).toBeVisible({ timeout: 10_000 })
  await prepareButton.click({ force: true })
  await expect(prepareButton).toHaveCount(0, { timeout: 10_000 })

  const startButton = organizerPage.getByRole('button', { name: '경매 시작' })
  await expect(startButton).toBeVisible({ timeout: 10_000 })
  await startButton.click()
}

async function dismissOverlayIfPresent(page: Page) {
  const dialog = page.getByRole('dialog')
  if ((await dialog.count()) > 0) {
    await dialog.evaluate((node) => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await expect(dialog).toHaveCount(0, { timeout: 5_000 })
  }
}

async function getBidPanel(page: Page) {
  await expect(page.getByText('경매 대기중...')).toHaveCount(0, { timeout: 15_000 })
  const button = page.getByRole('button', { name: '입찰하기' })
  const input = page.locator('input[type="number"]').first()
  await expect(button).toBeEnabled({ timeout: 15_000 })
  await expect(input).toBeVisible({ timeout: 15_000 })
  return { button, input }
}

async function getBidPanelQuick(page: Page) {
  const button = page.getByRole('button', { name: '입찰하기' })
  const input = page.locator('input[type="number"]').first()
  await expect(page.getByText('경매 대기중...')).toHaveCount(0, { timeout: 6_000 })
  try {
    await expect(button).toBeEnabled({ timeout: 6_000 })
  } catch (error) {
    const disabledLabel = await button.textContent().catch(() => null)
    const timerText = await page.locator('[role="timer"] span').textContent().catch(() => null)
    const heading = await page.locator('h3').first().textContent().catch(() => null)
    const waitingOverlay = await page.getByText('다음 선수 추첨을 기다리는 중...').count().catch(() => 0)
    const pausedOverlay = await page.getByText('경매 대기중...').count().catch(() => 0)
    throw new Error(
      `입찰 버튼 비활성 상태 유지: url=${page.url()}, label=${disabledLabel ?? 'null'}, timer=${timerText ?? 'null'}, heading=${heading ?? 'null'}, waitingOverlay=${waitingOverlay}, pausedOverlay=${pausedOverlay}, original=${String(error)}`,
    )
  }
  await expect(input).toBeVisible({ timeout: 6_000 })
  return { button, input }
}

async function placeBid(page: Page, amount: number) {
  const { button, input } = await getBidPanelQuick(page)
  await input.fill(String(amount))
  await button.click()
}

async function placeBidWithRetry(args: {
  organizerPage: Page
  leader: { teamName: string; page: Page }
  amount: number
}) {
  const { organizerPage, leader, amount } = args
  const bidMessages = organizerPage.getByText(new RegExp(`${leader.teamName}.*입찰했`))
  const bidCountBefore = await bidMessages.count()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await placeBid(leader.page, amount)
    try {
      await expect(bidMessages).toHaveCount(bidCountBefore + 1, { timeout: 10_000 })
      return
    } catch {
      const becameLeader = await leader.page
        .getByRole('button', { name: '최고 입찰 유지 중' })
        .isVisible()
        .catch(() => false)
      if (becameLeader) {
        return
      }

      const messageNow = await bidMessages.count().catch(() => 0)
      if (messageNow >= bidCountBefore + 1) {
        return
      }

      if (attempt === 1) {
        throw new Error(`${leader.teamName}의 입찰 이벤트가 반영되지 않았습니다.`)
      }
      await leader.page.reload()
      await organizerPage.waitForTimeout(800)
    }
  }
}

async function waitForBidMessageCount(
  organizerPage: Page,
  teamName: string,
  expectedCount: number,
) {
  const bidMessages = organizerPage.getByText(new RegExp(`${teamName}.*입찰했`))
  await expect(bidMessages).toHaveCount(expectedCount, { timeout: 12_000 })
}

async function getEligibleLeaders(leaderPages: Array<{ teamName: string; page: Page }>) {
  const results = await Promise.all(
    leaderPages.map(async (leader) => {
      try {
        const panel = await getBidPanelQuick(leader.page)
        return {
          teamName: leader.teamName,
          page: leader.page,
          minBid: toBidAmount(await panel.input.inputValue()),
        }
      } catch {
        return null
      }
    }),
  )

  return results.filter((leader): leader is { teamName: string; page: Page; minBid: number } => !!leader)
}

async function getEligibleLeadersWithRetry(
  leaderPages: Array<{ teamName: string; page: Page; link: string }>,
  roomTitle: string,
) {
  let eligible = await getEligibleLeaders(leaderPages)
  if (eligible.length > 0) return eligible

  await Promise.all(
    leaderPages.map(async (leader) => {
      await leader.page.goto(leader.link)
      await expect(leader.page.getByText(roomTitle)).toBeVisible({ timeout: 20_000 })
    }),
  )

  eligible = await getEligibleLeaders(leaderPages)
  return eligible
}

async function runAuctionRound(args: {
  organizerPage: Page
  leaderPages: Array<{ teamName: string; page: Page; link: string }>
  roomTitle: string
}) {
  const { organizerPage, leaderPages, roomTitle } = args
  const drawButton = organizerPage.getByRole('button', { name: /다음 선수 추첨/ })
  await expect(drawButton).toBeEnabled({ timeout: 20_000 })
  await drawButton.click()

  await expect(organizerPage.getByText('추첨 완료!')).toBeVisible({ timeout: 10_000 })
  const prepareButton = organizerPage.getByRole('button', { name: '경매 준비' })
  await expect(prepareButton).toBeVisible({ timeout: 10_000 })
  await prepareButton.click({ force: true })

  const startButton = organizerPage.getByRole('button', { name: '경매 시작' })
  await expect(startButton).toBeVisible({ timeout: 10_000 })
  await startButton.click()

  const eligibleLeaders = await getEligibleLeadersWithRetry(leaderPages, roomTitle)
  if (eligibleLeaders.length === 0) {
    throw new Error('이번 라운드에서 입찰 가능한 팀장을 찾지 못했습니다.')
  }

  const randomizedLeaders = shuffleArray(eligibleLeaders)
  const winnerIndex = Math.floor(Math.random() * randomizedLeaders.length)
  const winner = randomizedLeaders[winnerIndex]
  const challenger = randomizedLeaders.find((leader) => leader !== winner) ?? winner
  const winnerSoldMessages = organizerPage.getByText(new RegExp(`${winner.teamName}.*낙찰!`))
  const winnerSoldCountBefore = await winnerSoldMessages.count()

  if (challenger !== winner) {
    const challengerBidCountBefore = await organizerPage
      .getByText(new RegExp(`${challenger.teamName}.*입찰했`))
      .count()
    const winnerBidCountBefore = await organizerPage
      .getByText(new RegExp(`${winner.teamName}.*입찰했`))
      .count()

    const challengerAmount = Math.max(challenger.minBid, 20)
    const winnerAmount = Math.max(winner.minBid, challengerAmount + 20)

    await Promise.all([
      placeBid(challenger.page, challengerAmount),
      (async () => {
        await challenger.page.waitForTimeout(350)
        await placeBid(winner.page, winnerAmount)
      })(),
    ])

    await Promise.all([
      waitForBidMessageCount(
        organizerPage,
        challenger.teamName,
        challengerBidCountBefore + 1,
      ),
      waitForBidMessageCount(
        organizerPage,
        winner.teamName,
        winnerBidCountBefore + 1,
      ),
    ])
  } else {
    await placeBidWithRetry({
      organizerPage,
      leader: winner,
      amount: Math.max(winner.minBid, 20),
    })
  }

  await expect(
    winnerSoldMessages,
  ).toHaveCount(winnerSoldCountBefore + 1, { timeout: 20_000 })
  await dismissOverlayIfPresent(organizerPage)
}

async function getLatencyMarkers(page: Page) {
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

async function clearLatencyMarkers(page: Page) {
  await page.evaluate(() => {
    ;(
      window as Window & {
        __auctionLatencyMarkers__?: LatencyMarker[]
      }
    ).__auctionLatencyMarkers__ = []
  })
}

test('captures the same eventId across client response and RTDB apply on a normal bid', async ({
  browser,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL
  if (!baseURL) {
    throw new Error('PLAYWRIGHT_BASE_URL이 필요합니다.')
  }

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const redContext = await browser.newContext({ reducedMotion: 'reduce' })

  const organizerPage = await organizerContext.newPage()
  const roomTitle = `RTDB Marker ${Date.now()}`

  await organizerPage.goto(baseURL)
  await organizerPage.getByRole('button', { name: 'MAKE ROOM' }).click()
  await organizerPage.getByTestId('room-title-input').fill(roomTitle)
  await organizerPage.locator('input[type="number"]').nth(1).fill('3')
  await organizerPage.getByRole('button', { name: '팀장도 로스터 포함' }).click()
  await organizerPage.getByRole('button', { name: 'NEXT STEP' }).click()

  await organizerPage.getByRole('button', { name: /테스트 데이터 생성/ }).click()
  await organizerPage.getByRole('button', { name: '템플릿 적용 ✓' }).click()
  await organizerPage.getByRole('button', { name: 'NEXT STEP' }).click()

  await organizerPage.getByRole('button', { name: /테스트 데이터 생성/ }).click()
  await organizerPage.getByRole('button', { name: '템플릿 적용 ✓' }).click()
  await organizerPage.getByRole('button', { name: 'CREATE ROOM ✨' }).click()

  await expect(organizerPage.getByText('ROOM CREATED!')).toBeVisible({ timeout: 20_000 })
  const roomLinks = await extractRoomLinks(organizerPage)

  const blueLeader = roomLinks.leaders[0]
  const redLeader = roomLinks.leaders[1]
  const bluePage = await blueContext.newPage()
  const redPage = await redContext.newPage()

  await bluePage.goto(withRealtimeFlags(blueLeader.link, { debugRealtime: true }))
  await redPage.goto(withRealtimeFlags(redLeader.link, { debugRealtime: true }))

  await expect(bluePage.getByText(roomTitle)).toBeVisible({ timeout: 20_000 })
  await expect(redPage.getByText(roomTitle)).toBeVisible({ timeout: 20_000 })

  await organizerPage.goto(roomLinks.organizerLink)
  await expect(organizerPage.getByText(roomTitle)).toBeVisible({ timeout: 20_000 })
  await waitForAllConnected(organizerPage)

  const drawButton = organizerPage.getByRole('button', { name: /다음 선수 추첨/ })
  await expect(drawButton).toBeEnabled({ timeout: 20_000 })
  await drawButton.click()

  await expect(organizerPage.getByText('추첨 완료!')).toBeVisible({ timeout: 10_000 })
  await prepareAuctionFromLottery(organizerPage)

  const bluePanel = await getBidPanelQuick(bluePage)
  const redPanel = await getBidPanelQuick(redPage)

  await expect(redPanel.input).toHaveValue('10')
  await clearLatencyMarkers(bluePage)
  await clearLatencyMarkers(redPage)
  const clickedAt = Date.now()

  await bluePanel.input.fill('10')
  await bluePanel.button.click()

  await expect(
    bluePage.getByRole('button', { name: '최고 입찰 유지 중' }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(redPanel.input).toHaveValue('20', { timeout: 10_000 })

  await expect
    .poll(
      async () => {
        const markers = await getLatencyMarkers(bluePage)
        return (
          markers.find(
            (marker) => marker.source === 'client-response' && marker.amount === 10,
          ) ?? null
        )
      },
      { timeout: 10_000 },
    )
    .not.toBeNull()
  await expect
    .poll(
      async () => {
        const markers = await getLatencyMarkers(redPage)
        return (
          markers.find(
            (marker) => marker.source === 'rtdb' && marker.amount === 10,
          ) ?? null
        )
      },
      { timeout: 10_000 },
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

  expect(responseMarker?.eventId).toBeDefined()
  expect(responseMarker?.respondedAt).toBeDefined()
  expect(appliedMarker?.eventId).toBe(responseMarker?.eventId)
  expect(appliedMarker?.appliedAt).toBeDefined()
  expect((appliedMarker?.appliedAt ?? 0) - clickedAt).toBeGreaterThanOrEqual(0)
  expect((appliedMarker?.appliedAt ?? 0) - clickedAt).toBeLessThanOrEqual(3_000)

  await blueContext.close()
  await redContext.close()
  await organizerContext.close()
})

test('heals bid state on a client that skips RTDB auctionEvent updates', async ({
  browser,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL
  if (!baseURL) {
    throw new Error('PLAYWRIGHT_BASE_URL이 필요합니다.')
  }

  const organizerContext = await browser.newContext({ reducedMotion: 'reduce' })
  const normalLeaderContext = await browser.newContext({ reducedMotion: 'reduce' })
  const skippedLeaderContext = await browser.newContext({ reducedMotion: 'reduce' })

  const organizerPage = await organizerContext.newPage()
  const roomTitle = `RTDB Heal ${Date.now()}`

  await organizerPage.goto(baseURL)
  await organizerPage.getByRole('button', { name: 'MAKE ROOM' }).click()
  await organizerPage.getByTestId('room-title-input').fill(roomTitle)
  await organizerPage.locator('input[type="number"]').nth(1).fill('3')
  await organizerPage.getByRole('button', { name: '팀장도 로스터 포함' }).click()
  await organizerPage.getByRole('button', { name: 'NEXT STEP' }).click()

  await organizerPage.getByRole('button', { name: /테스트 데이터 생성/ }).click()
  await organizerPage.getByRole('button', { name: '템플릿 적용 ✓' }).click()
  await organizerPage.getByRole('button', { name: 'NEXT STEP' }).click()

  await organizerPage.getByRole('button', { name: /테스트 데이터 생성/ }).click()
  await organizerPage.getByRole('button', { name: '템플릿 적용 ✓' }).click()
  await organizerPage.getByRole('button', { name: 'CREATE ROOM ✨' }).click()

  await expect(organizerPage.getByText('ROOM CREATED!')).toBeVisible({ timeout: 20_000 })
  const roomLinks = await extractRoomLinks(organizerPage)

  const normalLeaderPage = await normalLeaderContext.newPage()
  const skippedLeaderPage = await skippedLeaderContext.newPage()
  const normalLeader = roomLinks.leaders[0]
  const skippedLeader = roomLinks.leaders[1]

  await normalLeaderPage.goto(
    withRealtimeFlags(normalLeader.link, { debugRealtime: true }),
  )
  await skippedLeaderPage.goto(
    withRealtimeFlags(skippedLeader.link, {
      debugRealtime: true,
      skipAuctionEvent: true,
    }),
  )

  await expect(normalLeaderPage.getByText(roomTitle)).toBeVisible({ timeout: 20_000 })
  await expect(skippedLeaderPage.getByText(roomTitle)).toBeVisible({ timeout: 20_000 })

  await organizerPage.goto(roomLinks.organizerLink)
  await expect(organizerPage.getByText(roomTitle)).toBeVisible({ timeout: 20_000 })
  await waitForAllConnected(organizerPage)

  const drawButton = organizerPage.getByRole('button', { name: /다음 선수 추첨/ })
  await expect(drawButton).toBeEnabled({ timeout: 20_000 })
  await drawButton.click()

  await expect(organizerPage.getByText('추첨 완료!')).toBeVisible({ timeout: 10_000 })
  await organizerPage.getByRole('button', { name: '경매 준비' }).click({ force: true })
  await expect(organizerPage.getByRole('button', { name: '경매 시작' })).toBeVisible({
    timeout: 10_000,
  })
  await organizerPage.getByRole('button', { name: '경매 시작' }).click()

  const normalLeaderPanel = await getBidPanelQuick(normalLeaderPage)
  const skippedLeaderPanel = await getBidPanelQuick(skippedLeaderPage)

  await expect(skippedLeaderPanel.input).toHaveValue('10')
  await clearLatencyMarkers(normalLeaderPage)
  await clearLatencyMarkers(skippedLeaderPage)
  const clickedAt = Date.now()
  await normalLeaderPanel.input.fill('10')
  await normalLeaderPanel.button.click()

  await expect(
    normalLeaderPage.getByRole('button', { name: '최고 입찰 유지 중' }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(skippedLeaderPanel.input).toHaveValue('20', { timeout: 10_000 })
  await expect(
    skippedLeaderPage.getByText(
      new RegExp(`${normalLeader.teamName} 팀이 10포인트로 선두입니다`),
    ),
  ).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(
      async () => {
        const markers = await getLatencyMarkers(normalLeaderPage)
        return (
          markers.find(
            (marker) => marker.source === 'client-response' && marker.amount === 10,
          ) ?? null
        )
      },
      { timeout: 10_000 },
    )
    .not.toBeNull()
  await expect
    .poll(
      async () => {
        const markers = await getLatencyMarkers(skippedLeaderPage)
        return (
          markers.find(
            (marker) => marker.source === 'room-fallback' && marker.amount === 10,
          ) ?? null
        )
      },
      { timeout: 10_000 },
    )
    .not.toBeNull()

  const responseMarkers = await getLatencyMarkers(normalLeaderPage)
  const fallbackMarkers = await getLatencyMarkers(skippedLeaderPage)
  const responseMarker = responseMarkers.find(
    (marker) => marker.source === 'client-response' && marker.amount === 10,
  )
  const appliedMarker = fallbackMarkers.find(
    (marker) => marker.source === 'room-fallback' && marker.amount === 10,
  )
  expect(responseMarker?.eventId).toBeDefined()
  expect(appliedMarker?.appliedAt).toBeDefined()
  expect(appliedMarker?.eventId).toBe(responseMarker?.eventId)
  expect(responseMarker?.respondedAt).toBeDefined()
  expect((appliedMarker?.appliedAt ?? 0) - clickedAt).toBeGreaterThanOrEqual(0)

  await normalLeaderContext.close()
  await skippedLeaderContext.close()
  await organizerContext.close()
})

test('runs the deployed auction from room creation to save-and-end with random bids for every player', async ({
  browser,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL
  if (!baseURL) {
    throw new Error('PLAYWRIGHT_BASE_URL이 필요합니다.')
  }

  const videoDir = path.join(process.cwd(), 'playwright-video')
  await fs.mkdir(videoDir, { recursive: true })

  const organizerContext = await browser.newContext({
    reducedMotion: 'reduce',
    recordVideo: {
      dir: videoDir,
      size: { width: 1440, height: 960 },
    },
  })
  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const redContext = await browser.newContext({ reducedMotion: 'reduce' })
  const leaderContexts = [blueContext, redContext]

  for (const context of leaderContexts) {
    await context.addInitScript(() => {
      window.localStorage.setItem('debugRealtime', '1')
    })
  }

  const organizerPage = await organizerContext.newPage()
  const uniqueTitle = `실배포 영상 ${Date.now()}`

  await organizerPage.goto(baseURL)
  await organizerPage.getByRole('button', { name: 'MAKE ROOM' }).click()
  await organizerPage.getByTestId('room-title-input').fill(uniqueTitle)
  await organizerPage.locator('input[type="number"]').nth(1).fill('3')
  await organizerPage.getByRole('button', { name: '팀장도 로스터 포함' }).click()
  await organizerPage.getByRole('button', { name: 'NEXT STEP' }).click()

  await organizerPage.getByRole('button', { name: /테스트 데이터 생성/ }).click()
  await organizerPage.getByRole('button', { name: '템플릿 적용 ✓' }).click()
  await organizerPage.getByRole('button', { name: 'NEXT STEP' }).click()

  await organizerPage.getByRole('button', { name: /테스트 데이터 생성/ }).click()
  await organizerPage.getByRole('button', { name: '템플릿 적용 ✓' }).click()
  await organizerPage.getByRole('button', { name: 'CREATE ROOM ✨' }).click()

  await expect(organizerPage.getByText('ROOM CREATED!')).toBeVisible({ timeout: 20_000 })
  const roomLinks = await extractRoomLinks(organizerPage)

  const leaderPages: Array<{ teamName: string; page: Page; link: string }> = []
  const leaderDebug = new Map<string, LeaderDebugState>()

  for (let index = 0; index < 2; index += 1) {
    const leaderPage = await leaderContexts[index].newPage()
    const teamName = roomLinks.leaders[index].teamName
    leaderDebug.set(teamName, { logs: [] })
    leaderPage.on('console', (message) => {
      if (message.type() !== 'info') return
      const text = message.text()
      if (!text.includes('[debug][canBid]')) return
      const state = leaderDebug.get(teamName)
      if (state) {
        state.logs.push(text)
        if (state.logs.length > 20) state.logs.shift()
      }
      console.log(`[leader:${teamName}] ${text}`)
    })
    await leaderPage.goto(withDebugRealtime(roomLinks.leaders[index].link))
    await expect(leaderPage.getByText(uniqueTitle)).toBeVisible({ timeout: 20_000 })
    leaderPages.push({
      teamName: roomLinks.leaders[index].teamName,
      page: leaderPage,
      link: withDebugRealtime(roomLinks.leaders[index].link),
    })
  }

  await organizerPage.getByRole('button', { name: /START AUCTION/i }).click()
  await expect(organizerPage.getByText(uniqueTitle)).toBeVisible({ timeout: 20_000 })
  await waitForAllConnected(organizerPage)

  for (let round = 0; round < 4; round += 1) {
    try {
      await runAuctionRound({
        organizerPage,
        leaderPages,
        roomTitle: uniqueTitle,
      })
    } catch (error) {
      for (const leader of leaderPages) {
        const state = leaderDebug.get(leader.teamName)
        if (!state || state.logs.length === 0) continue
        console.log(`[leader:${leader.teamName}][recent] ${state.logs.join(' | ')}`)
      }
      throw error
    }
  }

  await expect(
    organizerPage.getByRole('heading', { name: '경매 종료' }),
  ).toBeVisible({ timeout: 30_000 })

  await organizerPage.getByRole('button', { name: '방 종료' }).click()
  await expect(organizerPage.getByRole('button', { name: '저장 & 종료' })).toBeVisible({
    timeout: 10_000,
  })
  await organizerPage.getByRole('button', { name: '저장 & 종료' }).click()
  await expect(organizerPage).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(organizerPage.getByRole('button', { name: 'MAKE ROOM' })).toBeVisible({
    timeout: 20_000,
  })

  const organizerVideo = organizerPage.video()

  await blueContext.close()
  await redContext.close()
  await organizerContext.close()

  const savedVideoPath = organizerVideo ? await organizerVideo.path() : null
  if (!savedVideoPath) {
    throw new Error('주최자 영상 경로를 찾지 못했습니다.')
  }

  const outputPath = path.join(videoDir, 'auction-production-full-flow-organizer.webm')
  await fs.copyFile(savedVideoPath, outputPath)
  console.log(`Saved deployed auction full-flow video to ${outputPath}`)
})
