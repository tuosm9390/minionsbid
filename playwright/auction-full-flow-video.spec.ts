import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'

test.setTimeout(120_000)

async function extractLinks(page: import('@playwright/test').Page) {
  const linkTexts = await page.locator('p.font-mono').allTextContents()
  const urls = linkTexts
    .map((text) => text.match(/https?:\/\/\S+/)?.[0] ?? null)
    .filter((value): value is string => !!value)

  const organizerLink = urls.find((url) => url.includes('role=ORGANIZER'))
  const viewerLink = urls.find((url) => url.includes('role=VIEWER'))
  const leaderLinks = urls.filter((url) => url.includes('role=LEADER'))

  if (!organizerLink || !viewerLink || leaderLinks.length < 2) {
    throw new Error('링크 발급 결과를 파싱하지 못했습니다.')
  }

  return {
    organizerLink,
    viewerLink,
    firstLeaderLink: leaderLinks[0],
    secondLeaderLink: leaderLinks[1],
  }
}

async function getFixturePlayerName(
  request: import('@playwright/test').APIRequestContext,
  roomId: string,
) {
  const response = await request.get(`/api/e2e/auction-fixture/state?roomId=${roomId}`)
  expect(response.ok()).toBeTruthy()
  const body = (await response.json()) as {
    lotteryPlayer?: { name?: string | null } | null
    currentPlayerId?: string | null
    players?: Array<{ id: string; name: string }>
  }
  const lotteryName = body.lotteryPlayer?.name?.trim()
  if (lotteryName) return lotteryName
  const currentPlayerId = body.currentPlayerId
  const currentPlayerName = body.players?.find((player) => player.id === currentPlayerId)?.name?.trim()
  if (currentPlayerName) return currentPlayerName
  throw new Error('fixture state에서 현재 선수 이름을 찾지 못했습니다.')
}

async function getFixtureSnapshot(
  request: import('@playwright/test').APIRequestContext,
  roomId: string,
) {
  const response = await request.get(`/api/e2e/auction-fixture/state?roomId=${roomId}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as {
    currentPlayerId?: string | null
    players?: Array<{ id: string; status: string }>
  }
}

test('records a full auction flow video from room creation to auction finish', async ({
  browser,
  request,
}) => {
  const videoDir = path.join(process.cwd(), 'playwright-video')
  await fs.mkdir(videoDir, { recursive: true })

  const organizerContext = await browser.newContext({
    reducedMotion: 'reduce',
    recordVideo: {
      dir: videoDir,
      size: {
        width: 1440,
        height: 960,
      },
    },
  })
  const blueContext = await browser.newContext({ reducedMotion: 'reduce' })
  const redContext = await browser.newContext({ reducedMotion: 'reduce' })

  const organizerPage = await organizerContext.newPage()

  await organizerPage.goto('/')
  await organizerPage.getByRole('button', { name: 'MAKE ROOM' }).click()
  await organizerPage.getByTestId('room-title-input').fill('영상용 실시간 경매')
  await organizerPage.locator('input[type="number"]').nth(1).fill('2')
  await organizerPage.getByRole('button', { name: '팀장도 로스터 포함' }).click()
  await organizerPage.getByRole('button', { name: 'NEXT STEP' }).click()

  await organizerPage.getByRole('button', { name: /테스트 데이터 생성/ }).click()
  await organizerPage.getByRole('button', { name: '템플릿 적용 ✓' }).click()
  await organizerPage.getByRole('button', { name: 'NEXT STEP' }).click()

  await organizerPage.getByRole('button', { name: /테스트 데이터 생성/ }).click()
  await organizerPage.getByRole('button', { name: '템플릿 적용 ✓' }).click()
  await organizerPage.getByRole('button', { name: 'CREATE ROOM ✨' }).click()

  await expect(organizerPage.getByText('ROOM CREATED!')).toBeVisible()
  const { organizerLink, firstLeaderLink, secondLeaderLink } = await extractLinks(organizerPage)
  const organizerUrl = new URL(organizerLink)
  const roomId =
    organizerUrl.searchParams.get('roomId') ??
    organizerUrl.pathname.match(/^\/room\/([^/]+)/)?.[1] ??
    null
  if (!roomId) {
    throw new Error('roomId를 organizerLink에서 찾지 못했습니다.')
  }
  const firstLeaderTeamId = new URL(firstLeaderLink).searchParams.get('teamId')
  const secondLeaderTeamId = new URL(secondLeaderLink).searchParams.get('teamId')
  if (!firstLeaderTeamId || !secondLeaderTeamId) {
    throw new Error('teamId를 leaderLink에서 찾지 못했습니다.')
  }

  const bluePage = await blueContext.newPage()
  const redPage = await redContext.newPage()
  await bluePage.goto(firstLeaderLink)
  await redPage.goto(secondLeaderLink)
  await expect(bluePage.getByText('영상용 실시간 경매')).toBeVisible({ timeout: 10000 })
  await expect(redPage.getByText('영상용 실시간 경매')).toBeVisible({ timeout: 10000 })

  await organizerPage.getByRole('button', { name: /START AUCTION/i }).click()

  await expect(organizerPage.getByText('영상용 실시간 경매')).toBeVisible()
  await expect(
    organizerPage.getByText('모든 팀장님들의 접속을 기다리는 중...'),
  ).toHaveCount(0, { timeout: 15000 })
  await expect(organizerPage.getByRole('button', { name: /다음 선수 추첨/ })).toBeEnabled({
    timeout: 15000,
  })

  const firstDrawResponse = await request.post('/api/e2e/auction-fixture/command', {
    data: { roomId, action: 'draw' },
  })
  expect(firstDrawResponse.ok()).toBeTruthy()
  await expect(organizerPage.getByText('추첨 완료!')).toBeVisible({ timeout: 10000 })
  const firstPlayerName = await getFixturePlayerName(request, roomId)
  const firstCloseResponse = await request.post('/api/e2e/auction-fixture/command', {
    data: { roomId, action: 'closeLottery', playerName: firstPlayerName },
  })
  expect(firstCloseResponse.ok()).toBeTruthy()
  const firstStartResponse = await request.post('/api/e2e/auction-fixture/command', {
    data: { roomId, action: 'startAuction', durationMs: 10000 },
  })
  expect(firstStartResponse.ok()).toBeTruthy()
  await expect(organizerPage.getByText('경매 진행 중')).toBeVisible({
    timeout: 10000,
  })

  const firstAuctionSnapshot = await getFixtureSnapshot(request, roomId)
  const firstPlayerId = firstAuctionSnapshot.currentPlayerId
  if (!firstPlayerId) {
    throw new Error('첫 번째 경매의 currentPlayerId를 찾지 못했습니다.')
  }
  const firstBidResponse = await request.post('/api/e2e/auction-fixture/command', {
    data: { roomId, action: 'placeBid', playerId: firstPlayerId, teamId: firstLeaderTeamId, amount: 10 },
  })
  expect(firstBidResponse.ok()).toBeTruthy()

  await expect(organizerPage.getByText(/선수를 10P에 낙찰!/)).toBeVisible({ timeout: 12000 })
  await organizerPage.getByRole('dialog').evaluate((node) => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await expect(organizerPage.getByRole('dialog')).toHaveCount(0, { timeout: 3000 })
  await expect(organizerPage.getByRole('button', { name: /다음 선수 추첨/ })).toBeEnabled({
    timeout: 12000,
  })

  const secondDrawResponse = await request.post('/api/e2e/auction-fixture/command', {
    data: { roomId, action: 'draw' },
  })
  expect(secondDrawResponse.ok()).toBeTruthy()
  await expect(organizerPage.getByText('추첨 완료!')).toBeVisible({ timeout: 10000 })
  const secondPlayerName = await getFixturePlayerName(request, roomId)
  const secondCloseResponse = await request.post('/api/e2e/auction-fixture/command', {
    data: { roomId, action: 'closeLottery', playerName: secondPlayerName },
  })
  expect(secondCloseResponse.ok()).toBeTruthy()
  const secondStartResponse = await request.post('/api/e2e/auction-fixture/command', {
    data: { roomId, action: 'startAuction', durationMs: 10000 },
  })
  expect(secondStartResponse.ok()).toBeTruthy()
  await expect(organizerPage.getByText('경매 진행 중')).toBeVisible({
    timeout: 10000,
  })

  const secondAuctionSnapshot = await getFixtureSnapshot(request, roomId)
  const secondPlayerId = secondAuctionSnapshot.currentPlayerId
  if (!secondPlayerId) {
    throw new Error('두 번째 경매의 currentPlayerId를 찾지 못했습니다.')
  }
  const secondBidResponse = await request.post('/api/e2e/auction-fixture/command', {
    data: {
      roomId,
      action: 'placeBid',
      playerId: secondPlayerId,
      teamId: secondLeaderTeamId,
      amount: 10,
    },
  })
  expect(secondBidResponse.ok()).toBeTruthy()

  await expect
    .poll(
      async () => {
        const snapshot = await getFixtureSnapshot(request, roomId)
        const soldCount = snapshot.players?.filter((player) => player.status === 'SOLD').length ?? 0
        return `${soldCount}:${snapshot.currentPlayerId ?? 'none'}`
      },
      { timeout: 20000 },
    )
    .toBe('2:none')
  await expect(organizerPage.getByRole('heading', { name: '경매 종료' })).toBeVisible({
    timeout: 25000,
  })
  await expect(organizerPage.getByRole('button', { name: '팀 결과 확인하기' })).toBeVisible({
    timeout: 25000,
  })

  const organizerVideo = organizerPage.video()

  await blueContext.close()
  await redContext.close()
  await organizerContext.close()

  const savedVideoPath = organizerVideo ? await organizerVideo.path() : null
  if (!savedVideoPath) {
    throw new Error('주최자 영상 경로를 찾지 못했습니다.')
  }

  const outputPath = path.join(videoDir, 'auction-full-flow-organizer.webm')
  await fs.copyFile(savedVideoPath, outputPath)
  console.log(`Saved auction full-flow video to ${outputPath}`)
})
