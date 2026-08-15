import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildDiscordWebhookPayload,
  sendDiscordWebhook,
  notifyDeeplolBatchSummary,
} from './discordWebhook'

describe('Discord webhook notifications', () => {
  const originalUrl = process.env.DISCORD_DEEPLOL_WEBHOOK_URL
  const originalFetch = globalThis.fetch

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DISCORD_DEEPLOL_WEBHOOK_URL
    else process.env.DISCORD_DEEPLOL_WEBHOOK_URL = originalUrl
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('builds a bounded error embed without exposing environment secrets', () => {
    const payload = buildDiscordWebhookPayload({
      title: 'Deeplol 배치 실패',
      description: '실패 내용',
      severity: 'error',
      fields: [{ name: '일정', value: 'schedule-1', inline: true }],
    })

    expect(payload.username).toBe('Minions Bid Bot')
    expect(payload.embeds[0].color).toBe(0xed4245)
    expect(payload.embeds[0].fields[0]).toMatchObject({ name: '일정', value: 'schedule-1' })
    expect(JSON.stringify(payload)).not.toContain('DISCORD_DEEPLOL_WEBHOOK_URL')
  })

  it('does not call fetch when the webhook URL is not configured', async () => {
    delete process.env.DISCORD_DEEPLOL_WEBHOOK_URL
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(sendDiscordWebhook({
      title: 'test',
      description: 'test',
      severity: 'warning',
    })).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('includes match summary and team win rate/KDA in the webhook embed', async () => {
    process.env.DISCORD_DEEPLOL_WEBHOOK_URL = 'https://discord.example/webhook'
    let requestBody = ''
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = String(init?.body ?? '')
      return { ok: true, status: 204 }
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await notifyDeeplolBatchSummary({
      mode: 'write',
      candidateCount: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      schedules: [{
        scheduleId: 'schedule-1',
        scheduleName: '2026-S2 리그전',
        status: 'COMPLETED',
        result: {
          discoveredMatchIds: 12,
          importedMatches: 3,
          duplicateMatches: 8,
          skippedMatches: 1,
          retriedRequests: 2,
          failedMatchIds: [],
          teamStats: [{ teamName: 'Alpha', wins: 2, losses: 1, win_rate: 66.7, kda: 1.82 }],
        },
      }],
    })

    expect(requestBody).toContain('발견 12 / 신규 3 / 중복 8 / 제외 1 / 재시도 2')
    expect(requestBody).toContain('Alpha 2승 1패 (66.7%, KDA 1.82)')
  })

  it('sends a JSON webhook payload when configured', async () => {
    process.env.DISCORD_DEEPLOL_WEBHOOK_URL = 'https://discord.example/webhook'
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(sendDiscordWebhook({
      title: 'test',
      description: 'test',
      severity: 'info',
    })).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.example/webhook',
      expect.objectContaining({ method: 'POST', headers: { 'content-type': 'application/json' } }),
    )
  })
})
