export interface DiscordWebhookEvent {
  title: string
  description: string
  severity: 'info' | 'warning' | 'error'
  fields?: Array<{ name: string; value: string; inline?: boolean }>
}

const WEBHOOK_ENV = 'DISCORD_DEEPLOL_WEBHOOK_URL'
const TIMEOUT_MS = 10_000

function getColor(severity: DiscordWebhookEvent['severity']) {
  if (severity === 'error') return 0xed4245
  if (severity === 'warning') return 0xfee75c
  return 0x5865f2
}

export function buildDiscordWebhookPayload(event: DiscordWebhookEvent) {
  return {
    username: 'Minions Bid Bot',
    embeds: [{
      title: event.title.slice(0, 256),
      description: event.description.slice(0, 4096),
      color: getColor(event.severity),
      fields: (event.fields ?? []).slice(0, 25).map((field) => ({
        name: field.name.slice(0, 256),
        value: field.value.slice(0, 1024),
        inline: field.inline ?? false,
      })),
      timestamp: new Date().toISOString(),
    }],
  }
}

export async function sendDiscordWebhook(event: DiscordWebhookEvent): Promise<boolean> {
  const webhookUrl = process.env[WEBHOOK_ENV]?.trim()
  if (!webhookUrl) return false

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildDiscordWebhookPayload(event)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error(`[discordWebhook] HTTP ${response.status}`)
      return false
    }
    return true
  } catch (error) {
    console.error('[discordWebhook] 전송 실패:', error instanceof Error ? error.message : String(error))
    return false
  }
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatScheduleStats(schedule: Record<string, unknown>) {
  const result = typeof schedule.result === 'object' && schedule.result !== null
    ? schedule.result as Record<string, unknown>
    : null
  if (!result) return `${String(schedule.scheduleId)}: ${String(schedule.error ?? schedule.status)}`

  const teamStats = Array.isArray(result.teamStats) ? result.teamStats : []
  const teams = teamStats.slice(0, 6).map((team) => {
    const data = typeof team === 'object' && team !== null ? team as Record<string, unknown> : {}
    const winRate = numberValue(data.win_rate).toFixed(1)
    const kda = numberValue(data.kda).toFixed(2)
    return `${String(data.teamName ?? data.team_name ?? '팀')} ${numberValue(data.wins)}승 ${numberValue(data.losses)}패 (${winRate}%, KDA ${kda})`
  })
  const matchSummary = `발견 ${numberValue(result.discoveredMatchIds)} / 신규 ${numberValue(result.importedMatches)} / 중복 ${numberValue(result.duplicateMatches)} / 제외 ${numberValue(result.skippedMatches)} / 재시도 ${numberValue(result.retriedRequests)}`
  const teamSummary = teams.length > 0 ? `\n${teams.join('\n')}` : '\n팀 통계 없음'
  const failedIds = Array.isArray(result.failedMatchIds) ? result.failedMatchIds.slice(0, 3).map(String).join(', ') : ''
  return `${String(schedule.scheduleName ?? schedule.scheduleId)}\n${matchSummary}${teamSummary}${failedIds ? `\n실패 경기: ${failedIds}` : ''}`
}

export async function notifyDeeplolBatchSummary(input: {
  mode: string
  candidateCount: number
  processed: number
  succeeded: number
  failed: number
  schedules: Array<Record<string, unknown>>
}) {
  const failedSchedules = input.schedules
    .filter((schedule) => schedule.status === 'ERROR' || schedule.status === 'SKIPPED_NO_MEMBERS')
    .slice(0, 10)
    .map((schedule) => `${String(schedule.scheduleId)}: ${String(schedule.error ?? schedule.status)}`)
  const stats = input.schedules
    .filter((schedule) => schedule.status === 'COMPLETED')
    .slice(0, 8)
    .map(formatScheduleStats)
  const hasFailure = input.failed > 0
  return sendDiscordWebhook({
    title: hasFailure ? 'Deeplol 배치 동기화 결과 (일부 실패)' : 'Deeplol 배치 동기화 완료',
    description: hasFailure
      ? '하나 이상의 리그 일정에서 동기화가 실패했습니다. 아래 경기 요약과 Firestore sync run을 확인하세요.'
      : '현재 리그 일정의 Deeplol 경기 동기화가 완료되었습니다. 아래에 경기와 팀별 요약 통계를 표시합니다.',
    severity: hasFailure ? 'error' : 'info',
    fields: [
      { name: '실행 모드', value: input.mode, inline: true },
      { name: '대상 일정', value: String(input.candidateCount), inline: true },
      { name: '처리 결과', value: `${input.succeeded} 성공 / ${input.failed} 실패`, inline: true },
      { name: '경기·팀 요약', value: stats.join('\n\n') || '처리된 경기 통계 없음' },
      ...(hasFailure ? [{ name: '실패 일정', value: failedSchedules.join('\n') || '상세 정보 없음' }] : []),
    ],
  })
}

export const notifyDeeplolBatchFailure = notifyDeeplolBatchSummary

export async function notifyDeeplolBatchFatalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return sendDiscordWebhook({
    title: 'Deeplol 배치 실행 중단',
    description: '배치 작업이 시작 또는 실행 중 치명적 오류로 중단되었습니다.',
    severity: 'error',
    fields: [{ name: '오류', value: message }],
  })
}
