// 주최자와 8팀장 화면을 동시에 띄워 입찰 권한을 확인하는 visual E2E 테스트
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test'

test.setTimeout(420_000)

type FixtureCreateResponse = {
  roomId: string
  organizerLink: string
  viewerLink: string
  captainLinks: Array<{ teamId: string; teamName: string; link: string }>
}

type FixtureStateResponse = {
  roomId: string
  currentPlayerId: string | null
  lotteryPlayer: { name?: string | null } | null
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
}

type LeaderClient = {
  teamName: string
  teamId: string
  link: string
  context: BrowserContext
  page: Page
}

type LeaderBidDiagnostic = {
  teamName: string
  teamId: string
  url: string
  bidButtonCount: number
  bidButtonText: string | null
  bidButtonEnabled: boolean
  inputCount: number
  inputValue: string | null
  waitingOverlayCount: number
  connectionWarningCount: number
  leadingButtonCount: number
  headerText: string | null
  warningText: string | null
}

const TEAM_COUNT = 8
const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP']
const TIERS = ['챌린저', '그랜드마스터', '마스터', '다이아', '에메랄드', '플래티넘', '골드', '실버']

function createEightLeaderPayload(roomName: string) {
  return {
    name: roomName,
    totalTeams: TEAM_COUNT,
    basePoint: 1000,
    membersPerTeam: 3,
    captainMode: 'COACH_ONLY',
    auctionMode: 'OPEN_ASCENDING',
    captains: Array.from({ length: TEAM_COUNT }, (_, index) => ({
      teamName: `Team ${index + 1}`,
      name: `Leader ${index + 1}`,
      tier: '팀장',
      position: POSITIONS[index % POSITIONS.length],
      description: `8팀장 권한 확인용 팀장 ${index + 1}`,
      captainPoints: 0,
    })),
    players: Array.from({ length: 10 }, (_, index) => ({
      name: `Player ${index + 1}`,
      tier: TIERS[index % TIERS.length],
      mainPosition: POSITIONS[index % POSITIONS.length],
      subPosition: POSITIONS[(index + 1) % POSITIONS.length],
      description: `8팀장 권한 확인용 선수 ${index + 1}`,
    })),
  }
}

async function createEightLeaderRoom(request: APIRequestContext, roomName: string) {
  const response = await request.post('/api/e2e/auction-fixture/create', {
    data: createEightLeaderPayload(roomName),
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as FixtureCreateResponse
}

async function getFixtureState(request: APIRequestContext, roomId: string) {
  const response = await request.get(`/api/e2e/auction-fixture/state?roomId=${roomId}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as FixtureStateResponse
}

async function sendFixtureCommand(
  request: APIRequestContext,
  payload: Record<string, unknown>,
) {
  const response = await request.post('/api/e2e/auction-fixture/command', {
    data: payload,
  })
  expect(response.ok()).toBeTruthy()
}

async function startFirstAuctionRound(request: APIRequestContext, roomId: string) {
  await sendFixtureCommand(request, { roomId, action: 'draw' })
  await expect
    .poll(async () => (await getFixtureState(request, roomId)).lotteryPlayer?.name ?? null)
    .not.toBeNull()

  const state = await getFixtureState(request, roomId)
  const playerName = state.lotteryPlayer?.name
  if (!playerName) {
    throw new Error('fixture lottery player name is missing')
  }

  await sendFixtureCommand(request, {
    roomId,
    action: 'closeLottery',
    playerName,
  })
  await sendFixtureCommand(request, {
    roomId,
    action: 'startAuction',
    durationMs: 300_000,
  })
}

async function collectLeaderBidDiagnostic(leader: LeaderClient): Promise<LeaderBidDiagnostic> {
  const bidButton = leader.page.getByRole('button', { name: '입찰하기' })
  const input = leader.page.locator('input[type="number"]').first()
  const warningTexts = leader.page.getByText(/권한|오류|부족|가득|대기중|연결/)
  const bidButtonCount = await bidButton.count()
  const inputCount = await leader.page.locator('input[type="number"]').count()
  const header = leader.page.getByRole('banner')
  const headerCount = await header.count()
  const warningCount = await warningTexts.count()

  return {
    teamName: leader.teamName,
    teamId: leader.teamId,
    url: leader.page.url(),
    bidButtonCount,
    bidButtonText: bidButtonCount > 0 ? await bidButton.first().textContent() : null,
    bidButtonEnabled: bidButtonCount > 0 ? await bidButton.first().isEnabled() : false,
    inputCount,
    inputValue: inputCount > 0 ? await input.inputValue().catch(() => null) : null,
    waitingOverlayCount: await leader.page.getByText('경매 대기중...').count(),
    connectionWarningCount: await leader.page
      .getByText('모든 팀장님들의 접속을 기다리는 중...')
      .count(),
    leadingButtonCount: await leader.page.getByRole('button', { name: '최고 입찰 유지 중' }).count(),
    headerText: headerCount > 0 ? await header.first().textContent().catch(() => null) : null,
    warningText: warningCount > 0 ? await warningTexts.first().textContent().catch(() => null) : null,
  }
}

async function collectAllLeaderBidDiagnostics(leaders: LeaderClient[]) {
  return Promise.all(leaders.map((leader) => collectLeaderBidDiagnostic(leader)))
}

async function attachDiagnostics(
  testInfo: TestInfo,
  name: string,
  diagnostics: LeaderBidDiagnostic[],
) {
  await testInfo.attach(name, {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json',
  })
}

function findBidReadinessFailures(diagnostics: LeaderBidDiagnostic[]) {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.bidButtonCount !== 1 ||
      !diagnostic.bidButtonEnabled ||
      diagnostic.inputCount === 0,
  )
}

async function assertAllLeadersCanBid(
  leaders: LeaderClient[],
  testInfo: TestInfo,
) {
  const diagnostics = await collectAllLeaderBidDiagnostics(leaders)
  await attachDiagnostics(testInfo, 'eight-leader-bid-diagnostics.json', diagnostics)

  const failures = findBidReadinessFailures(diagnostics)
  if (failures.length > 0) {
    console.table(failures)
  }
  expect(failures).toEqual([])
}

test('opens organizer plus eight leaders and verifies every leader can bid', async ({
  request,
  browser,
}, testInfo) => {
  const roomName = `8팀장 권한 확인 ${Date.now()}`
  const fixture = await createEightLeaderRoom(request, roomName)
  expect(fixture.captainLinks).toHaveLength(TEAM_COUNT)
  expect(new Set(fixture.captainLinks.map((link) => link.teamId)).size).toBe(TEAM_COUNT)
  await startFirstAuctionRound(request, fixture.roomId)

  const organizerContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: 'reduce',
  })
  const organizerPage = await organizerContext.newPage()
  const leaders: LeaderClient[] = []

  try {
    for (const captainLink of fixture.captainLinks) {
      const context = await browser.newContext({
        viewport: { width: 720, height: 900 },
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      page.on('console', (message) => {
        const text = message.text()
        if (text.includes('[debug][canBid]')) {
          console.log(`[${captainLink.teamName}] ${text}`)
        }
      })
      leaders.push({
        teamName: captainLink.teamName,
        teamId: captainLink.teamId,
        link: `${captainLink.link}&debugRealtime=1`,
        context,
        page,
      })
    }

    await Promise.all([
      organizerPage.goto(fixture.organizerLink),
      ...leaders.map((leader) => leader.page.goto(leader.link)),
    ])

    await Promise.all([
      expect(organizerPage.getByText(roomName)).toBeVisible({ timeout: 20_000 }),
      ...leaders.map((leader) =>
        expect(leader.page.getByText(roomName)).toBeVisible({ timeout: 20_000 }),
      ),
    ])

    await expect(organizerPage.getByText('경매 진행 중')).toBeVisible({ timeout: 10_000 })
    await Promise.all(
      leaders.map((leader) =>
        expect(leader.page.locator('[role="timer"]')).toBeVisible({ timeout: 10_000 }),
      ),
    )

    await assertAllLeadersCanBid(leaders, testInfo)

    if (process.env.E2E_VISUAL_PAUSE === '1') {
      await organizerPage.pause()
    }

    expect(findBidReadinessFailures(await collectAllLeaderBidDiagnostics(leaders))).toEqual([])
  } catch (error) {
    const diagnostics = await collectAllLeaderBidDiagnostics(leaders)
    await attachDiagnostics(testInfo, 'eight-leader-failure-diagnostics.json', diagnostics)
    console.table(diagnostics)
    throw error
  } finally {
    await Promise.all([
      organizerContext.close(),
      ...leaders.map((leader) => leader.context.close()),
    ])
  }
})
