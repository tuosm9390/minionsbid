// Firebase Emulator로 주최자와 8팀장 권한/입찰 흐름을 검증하는 통합 E2E 테스트
import { expect, test, type APIRequestContext, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

test.setTimeout(240_000)

type FirebaseCreateResponse = {
  roomId: string
  organizerLink: string
  organizerToken: string
  captainLinks: Array<{ teamId: string; teamName: string; token: string; link: string }>
}

type FirebaseStateResponse = {
  roomId: string
  room: {
    currentPlayerId: string | null
    timerEndsAt: string | null
    auctionRevision: number | null
    activeBid: { team_id?: string; amount?: number } | null
  }
  counts: {
    teams: number
    players: number
    bids: number
    teamTokens: number
    presences: number
    leaderPresences: number
  }
  presence: Array<{ sessionId: string; role: string | null; teamId: string | null }>
}

type LeaderClient = {
  teamName: string
  teamId: string
  token: string
  link: string
  context: BrowserContext
  page: Page
}

type LeaderDiagnostic = {
  teamName: string
  teamId: string
  url: string
  authDebug: {
    uid?: string
    claims?: Record<string, unknown>
  } | null
  bidButtonCount: number
  bidButtonEnabled: boolean
  bidButtonText: string | null
  inputCount: number
  inputValue: string | null
}

async function createFirebaseRoom(request: APIRequestContext, roomName: string) {
  const response = await request.post('/api/e2e/firebase-auction/create', {
    data: { roomName },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as FirebaseCreateResponse
}

async function getFirebaseState(request: APIRequestContext, roomId: string) {
  const response = await request.get(`/api/e2e/firebase-auction/state?roomId=${roomId}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as FirebaseStateResponse
}

async function cleanupFirebaseRoom(request: APIRequestContext, roomId: string | null) {
  if (!roomId) return
  await request.post('/api/e2e/firebase-auction/cleanup', {
    data: { roomId },
  }).catch(() => undefined)
}

async function startFirstRound(request: APIRequestContext, fixture: FirebaseCreateResponse) {
  const response = await request.post('/api/e2e/firebase-auction/command', {
    data: {
      roomId: fixture.roomId,
      organizerToken: fixture.organizerToken,
      action: 'startFirstRound',
      durationMs: 60_000,
    },
  })
  expect(response.ok()).toBeTruthy()
}

async function getAuthDebug(page: Page) {
  return page.evaluate(() => {
    return (
      window as Window & {
        __roomAuthDebug__?: {
          uid: string
          claims: Record<string, unknown>
        }
      }
    ).__roomAuthDebug__ ?? null
  })
}

async function waitForLeaderAuth(leader: LeaderClient, roomId: string) {
  await expect
    .poll(async () => {
      const authDebug = await getAuthDebug(leader.page)
      return {
        role: authDebug?.claims?.role ?? null,
        roomId: authDebug?.claims?.roomId ?? null,
        teamId: authDebug?.claims?.teamId ?? null,
      }
    }, { timeout: 20_000 })
    .toEqual({
      role: 'LEADER',
      roomId,
      teamId: leader.teamId,
    })
}

async function collectLeaderDiagnostic(leader: LeaderClient): Promise<LeaderDiagnostic> {
  const bidButton = leader.page.getByRole('button', { name: '입찰하기' })
  const bidButtonCount = await bidButton.count()
  const input = leader.page.locator('input[type="number"]').first()
  const inputCount = await leader.page.locator('input[type="number"]').count()
  return {
    teamName: leader.teamName,
    teamId: leader.teamId,
    url: leader.page.url(),
    authDebug: await getAuthDebug(leader.page),
    bidButtonCount,
    bidButtonEnabled: bidButtonCount > 0 ? await bidButton.first().isEnabled() : false,
    bidButtonText: bidButtonCount > 0 ? await bidButton.first().textContent() : null,
    inputCount,
    inputValue: inputCount > 0 ? await input.inputValue().catch(() => null) : null,
  }
}

async function attachDiagnostics(
  testInfo: TestInfo,
  name: string,
  diagnostics: unknown,
) {
  await testInfo.attach(name, {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json',
  })
}

async function assertAllLeadersCanBid(leaders: LeaderClient[], testInfo: TestInfo) {
  const diagnostics = await Promise.all(leaders.map((leader) => collectLeaderDiagnostic(leader)))
  await attachDiagnostics(testInfo, 'firebase-eight-leader-diagnostics.json', diagnostics)
  const failures = diagnostics.filter(
    (diagnostic) =>
      diagnostic.bidButtonCount !== 1 ||
      !diagnostic.bidButtonEnabled ||
      diagnostic.inputCount === 0,
  )
  if (failures.length > 0) {
    console.table(failures)
  }
  expect(failures).toEqual([])
}

async function placeBid(leader: LeaderClient) {
  const button = leader.page.getByRole('button', { name: '입찰하기' })
  const input = leader.page.locator('input[type="number"]').first()
  await expect(button).toBeEnabled({ timeout: 10_000 })
  await expect(input).toBeVisible({ timeout: 10_000 })
  const amount = Number.parseInt(await input.inputValue(), 10)
  expect(Number.isFinite(amount)).toBe(true)
  await input.fill(String(amount))
  await button.click()
  await expect(leader.page.getByRole('button', { name: '최고 입찰 유지 중' })).toBeVisible({
    timeout: 10_000,
  })
}

test('verifies eight leaders through Firebase Auth, RTDB presence, and Firestore bids', async ({
  request,
  browser,
}, testInfo) => {
  const roomName = `Firebase 8팀장 통합 ${Date.now()}`
  let roomId: string | null = null
  const leaders: LeaderClient[] = []
  const organizerContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: 'reduce',
  })

  try {
    const fixture = await createFirebaseRoom(request, roomName)
    roomId = fixture.roomId
    expect(fixture.captainLinks).toHaveLength(8)

    const organizerPage = await organizerContext.newPage()
    for (const captainLink of fixture.captainLinks) {
      const context = await browser.newContext({
        viewport: { width: 720, height: 900 },
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      leaders.push({
        teamName: captainLink.teamName,
        teamId: captainLink.teamId,
        token: captainLink.token,
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
    await Promise.all(leaders.map((leader) => waitForLeaderAuth(leader, fixture.roomId)))

    await expect
      .poll(async () => (await getFirebaseState(request, fixture.roomId)).counts.leaderPresences, {
        timeout: 20_000,
      })
      .toBe(8)

    await startFirstRound(request, fixture)
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

    for (let index = 0; index < leaders.length; index += 1) {
      await placeBid(leaders[index])
      await expect
        .poll(async () => {
          const state = await getFirebaseState(request, fixture.roomId)
          return {
            bids: state.counts.bids,
            teamId: state.room.activeBid?.team_id ?? null,
          }
        }, { timeout: 10_000 })
        .toEqual({
          bids: index + 1,
          teamId: leaders[index].teamId,
        })
    }

    const finalState = await getFirebaseState(request, fixture.roomId)
    await attachDiagnostics(testInfo, 'firebase-eight-leader-room-state.json', finalState)
    expect(finalState.counts.teams).toBe(8)
    expect(finalState.counts.teamTokens).toBe(8)
    expect(finalState.counts.bids).toBe(8)
    expect(finalState.room.auctionRevision).toBeGreaterThanOrEqual(9)
  } catch (error) {
    if (leaders.length > 0) {
      await attachDiagnostics(
        testInfo,
        'firebase-eight-leader-failure-diagnostics.json',
        await Promise.all(leaders.map((leader) => collectLeaderDiagnostic(leader).catch((err) => ({
          teamName: leader.teamName,
          teamId: leader.teamId,
          error: err instanceof Error ? err.message : String(err),
        })))),
      )
    }
    if (roomId) {
      await attachDiagnostics(
        testInfo,
        'firebase-eight-leader-failure-state.json',
        await getFirebaseState(request, roomId).catch((err) => ({
          error: err instanceof Error ? err.message : String(err),
        })),
      )
    }
    throw error
  } finally {
    await Promise.all([
      organizerContext.close(),
      ...leaders.map((leader) => leader.context.close()),
    ])
    await cleanupFirebaseRoom(request, roomId)
  }
})
