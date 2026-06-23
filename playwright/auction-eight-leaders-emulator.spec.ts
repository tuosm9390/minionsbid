// Firebase Emulator로 주최자와 8팀장 권한/입찰 흐름을 검증하는 통합 E2E 테스트
import { expect, test, type APIRequestContext, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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

type AuthDebug = {
  uid?: string
  claims?: Record<string, unknown>
} | null

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
  authDebug: AuthDebug
  bidButtonCount: number
  bidButtonEnabled: boolean
  bidButtonText: string | null
  inputCount: number
  inputValue: string | null
}

type PageLog = {
  source: string
  type: string
  text: string
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

async function waitForOrganizerAuth(page: Page, roomId: string) {
  await expect
    .poll(async () => {
      const authDebug = await getAuthDebug(page)
      return {
        role: authDebug?.claims?.role ?? null,
        roomId: authDebug?.claims?.roomId ?? null,
        teamId: authDebug?.claims?.teamId ?? undefined,
      }
    }, { timeout: 20_000 })
    .toEqual({
      role: 'ORGANIZER',
      roomId,
      teamId: undefined,
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

function writeEvidence(name: string, payload: unknown) {
  mkdirSync(join('.omo', 'ulw-loop', 'evidence'), { recursive: true })
  writeFileSync(
    join('.omo', 'ulw-loop', 'evidence', name),
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
  )
}

function collectPageLogs(page: Page, source: string, logs: PageLog[]) {
  page.on('console', (message) => {
    logs.push({
      source,
      type: message.type(),
      text: message.text(),
    })
  })
  page.on('pageerror', (error) => {
    logs.push({
      source,
      type: 'pageerror',
      text: error.message,
    })
  })
}

async function collectPageSnapshot(page: Page) {
  return {
    url: page.url(),
    title: await page.title().catch(() => null),
    bodyText: await page.locator('body').innerText({ timeout: 1000 }).catch(() => null),
  }
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

const BID_INCREMENT = 10

async function placeBid(leader: LeaderClient, amount: number) {
  const button = leader.page.getByRole('button', { name: '입찰하기' })
  const input = leader.page.locator('input[type="number"]').first()
  await expect(button).toBeEnabled({ timeout: 10_000 })
  await expect(input).toBeVisible({ timeout: 10_000 })
  expect(Number.isFinite(amount)).toBe(true)
  await input.fill(String(amount))
  await button.click()
}

test('verifies eight leaders through Firebase Auth, RTDB presence, and Firestore bids', async ({
  request,
  browser,
}, testInfo) => {
  const roomName = `Firebase 8팀장 통합 ${Date.now()}`
  let roomId: string | null = null
  const leaders: LeaderClient[] = []
  const pageLogs: PageLog[] = []
  const organizerContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: 'reduce',
  })

  try {
    const fixture = await createFirebaseRoom(request, roomName)
    roomId = fixture.roomId
    expect(fixture.captainLinks).toHaveLength(8)

    const organizerPage = await organizerContext.newPage()
    collectPageLogs(organizerPage, 'organizer', pageLogs)
    for (const captainLink of fixture.captainLinks) {
      const context = await browser.newContext({
        viewport: { width: 720, height: 900 },
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      collectPageLogs(page, captainLink.teamName, pageLogs)
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
    try {
      await Promise.all([
        expect(organizerPage.getByText(roomName)).toBeVisible({ timeout: 20_000 }),
        ...leaders.map((leader) =>
          expect(leader.page.getByText(roomName)).toBeVisible({ timeout: 20_000 }),
        ),
      ])
    } catch (error) {
      const diagnostics = {
        logs: pageLogs,
        organizer: await collectPageSnapshot(organizerPage),
        leaders: await Promise.all(
          leaders.map(async (leader) => ({
            teamName: leader.teamName,
            teamId: leader.teamId,
            snapshot: await collectPageSnapshot(leader.page),
          })),
        ),
        state: await getFirebaseState(request, fixture.roomId).catch((err) => ({
          error: err instanceof Error ? err.message : String(err),
        })),
      }
      mkdirSync('test-results', { recursive: true })
      writeFileSync(
        join('test-results', 'firebase-page-load-diagnostics.json'),
        JSON.stringify(diagnostics, null, 2),
      )
      await attachDiagnostics(testInfo, 'firebase-page-load-diagnostics.json', diagnostics)
      throw error
    }
    await Promise.all([
      waitForOrganizerAuth(organizerPage, fixture.roomId),
      ...leaders.map((leader) => waitForLeaderAuth(leader, fixture.roomId)),
    ])

    await expect
      .poll(async () => {
        const state = await getFirebaseState(request, fixture.roomId)
        return {
          presences: state.counts.presences,
          leaderPresences: state.counts.leaderPresences,
        }
      }, {
        timeout: 20_000,
      })
      .toEqual({
        presences: 9,
        leaderPresences: 8,
      })

    const organizerAuthDebug = await getAuthDebug(organizerPage)
    const leaderAuthDebug = await Promise.all(leaders.map((leader) => getAuthDebug(leader.page)))
    const authUids = [organizerAuthDebug?.uid, ...leaderAuthDebug.map((debug) => debug?.uid)]
    expect(new Set(authUids).size).toBe(9)
    expect(authUids.every((uid) => typeof uid === 'string' && uid.length > 0)).toBe(true)

    const entryState = await getFirebaseState(request, fixture.roomId)
    const organizerPresence = entryState.presence.filter((presence) => presence.role === 'ORGANIZER')
    const leaderPresenceTeamIds = entryState.presence
      .filter((presence) => presence.role === 'LEADER')
      .map((presence) => presence.teamId)
      .sort()
    const expectedLeaderTeamIds = fixture.captainLinks.map((leader) => leader.teamId).sort()
    expect(organizerPresence).toHaveLength(1)
    expect(leaderPresenceTeamIds).toEqual(expectedLeaderTeamIds)
    writeEvidence('G001-C001-browser-e2e.txt', {
      roomId: fixture.roomId,
      organizerClaims: organizerAuthDebug?.claims,
      leaderClaims: leaderAuthDebug.map((debug, index) => ({
        teamId: leaders[index].teamId,
        claims: debug?.claims,
      })),
      authUids,
      presence: entryState.presence,
      counts: entryState.counts,
    })

    const crossLeaderTokenResponse = await request.post('/api/room-auth/firebase-token', {
      data: {
        roomId: fixture.roomId,
        role: 'LEADER',
        teamId: fixture.captainLinks[0].teamId,
        token: fixture.captainLinks[1].token,
      },
    })
    const crossLeaderTokenBody = await crossLeaderTokenResponse.json().catch(() => null)
    writeEvidence('G001-C002-http-forbidden.json', {
      status: crossLeaderTokenResponse.status(),
      body: crossLeaderTokenBody,
    })
    expect(crossLeaderTokenResponse.status()).toBe(403)
    expect(crossLeaderTokenBody).toEqual({ error: 'forbidden' })

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
      const beforeBidState = await getFirebaseState(request, fixture.roomId)
      const bidAmount = (beforeBidState.room.activeBid?.amount ?? 0) + BID_INCREMENT
      await placeBid(leaders[index], bidAmount)
      await expect
        .poll(async () => {
          const state = await getFirebaseState(request, fixture.roomId)
          return {
            bids: state.counts.bids,
            teamId: state.room.activeBid?.team_id ?? null,
            amount: state.room.activeBid?.amount ?? null,
          }
        }, { timeout: 15_000 })
        .toEqual({
          bids: index + 1,
          teamId: leaders[index].teamId,
          amount: bidAmount,
        })
    }

    const finalState = await getFirebaseState(request, fixture.roomId)
    await attachDiagnostics(testInfo, 'firebase-eight-leader-room-state.json', finalState)
    writeEvidence('G001-C003-browser-bids.txt', {
      roomId: fixture.roomId,
      bids: finalState.counts.bids,
      activeBid: finalState.room.activeBid,
      auctionRevision: finalState.room.auctionRevision,
    })
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
