import type {
  DeeplolMatch,
  DeeplolMatchParticipant,
  DeeplolSyncConfig,
} from './types'

const DEEPLOL_API_BASE = 'https://b2c-api-cdn.deeplol.gg'
const DEFAULT_TIMEOUT_MS = 15_000

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value)
  const trimmed = value.trim()
  return trimmed || null
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function booleanOrNull(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return null
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text(record[key])
    if (value) return value
  }
  return null
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberOrNull(record[key])
    if (value !== null) return value
  }
  return null
}

function findArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key]
  }
  return []
}

function normalizeId(value: unknown) {
  return text(value)?.replace(/^\"|\"$/g, '') ?? null
}

function normalizeParticipant(value: unknown): DeeplolMatchParticipant {
  const p = asRecord(value)
  const basic = asRecord(p.participant_basic_dict ?? p.participant_basic_info ?? p)
  const stats = asRecord(p.stats ?? p.participant_stats ?? p)
  const champion = asRecord(p.champion ?? p.champion_dict)
  const team = asRecord(p.team ?? p.team_dict)

  return {
    puuId: firstText(p, ['puu_id', 'puuid', 'puuId']) ?? firstText(basic, ['puu_id', 'puuid']),
    riotName:
      firstText(p, ['riot_id_name', 'riot_name', 'game_name', 'summoner_name']) ??
      firstText(basic, ['riot_id_name', 'riot_name', 'game_name', 'summoner_name']),
    riotTag:
      firstText(p, ['riot_id_tag_line', 'riot_tag', 'tag_line', 'tagline']) ??
      firstText(basic, ['riot_id_tag_line', 'riot_tag', 'tag_line', 'tagline']),
    platformId: firstText(p, ['platform_id', 'platformId']) ?? firstText(basic, ['platform_id']),
    teamId: firstText(p, ['team_id', 'teamId']) ?? firstText(team, ['team_id', 'id']),
    teamName: firstText(p, ['team_name', 'teamName']) ?? firstText(team, ['team_name', 'name']),
    championId:
      firstText(p, ['champion_id', 'championId']) ?? firstText(champion, ['id', 'champion_id']),
    championName:
      firstText(p, ['champion_name', 'championName']) ?? firstText(champion, ['name']),
    position: firstText(p, ['position', 'lane', 'role']) ?? firstText(stats, ['position', 'lane']),
    kills: firstNumber(p, ['kills', 'kill']) ?? firstNumber(stats, ['kills', 'kill']) ?? 0,
    deaths: firstNumber(p, ['deaths', 'death']) ?? firstNumber(stats, ['deaths', 'death']) ?? 0,
    assists: firstNumber(p, ['assists', 'assist']) ?? firstNumber(stats, ['assists', 'assist']) ?? 0,
    cs: firstNumber(p, ['cs', 'total_minions_killed', 'minions_killed']) ?? firstNumber(stats, ['cs', 'total_minions_killed']),
    win: booleanOrNull(p.win ?? p.is_win ?? stats.win ?? stats.is_win),
  }
}

function collectParticipants(payload: Record<string, unknown>): DeeplolMatchParticipant[] {
  const direct = findArray(payload, ['participants_list', 'participants', 'participant_list'])
  if (direct.length) return direct.map(normalizeParticipant)

  const matchData = asRecord(payload.match_data ?? payload.match_detail ?? payload.data)
  const nested = findArray(matchData, ['participants_list', 'participants', 'participant_list'])
  return nested.map(normalizeParticipant)
}

function parseTimestamp(value: unknown): string | null {
  const raw = numberOrNull(value)
  if (raw !== null) {
    const millis = raw < 10_000_000_000 ? raw * 1000 : raw
    const date = new Date(millis)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const stringValue = text(value)
  if (!stringValue) return null
  const date = new Date(stringValue)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function parseDeeplolMatch(payload: unknown, fallbackMatchId: string, platformId = 'KR'): DeeplolMatch {
  const root = asRecord(payload)
  const basic = asRecord(root.match_basic_dict ?? root.match_basic_info ?? root.basic ?? root)
  const matchId = normalizeId(basic.match_id ?? root.match_id) ?? fallbackMatchId
  const createdAt = parseTimestamp(
    basic.creation_timestamp ?? basic.created_at ?? basic.game_creation ?? root.creation_timestamp,
  )
  const durationSeconds = firstNumber(basic, ['game_duration', 'duration', 'duration_seconds'])
  const tournamentName = firstText(basic, ['tournament_name', 'tournamentName'])
  const queueId = firstText(basic, ['queue_id', 'queueId'])

  return {
    matchId,
    tournamentName,
    platformId: firstText(basic, ['platform_id', 'platformId']) ?? platformId,
    createdAt,
    durationSeconds,
    queueId,
    rawBasic: basic,
    participants: collectParticipants(root),
  }
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = 3,
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      })
      if (!response.ok) {
        const error = new Error(`Deeplol HTTP ${response.status}: ${url}`)
        if (!isRetryableStatus(response.status) || attempt >= maxAttempts) throw error
        lastError = error
        onRetry?.(attempt, error)
      } else {
        const body = (await response.json()) as unknown
        const message = text(asRecord(body).msg)
        if (message) throw new Error(`Deeplol 응답 오류: ${message}`)
        return body
      }
    } catch (error) {
      lastError = error
      const retryable = !(error instanceof Error && error.message.startsWith('Deeplol HTTP 4'))
      if (!retryable || attempt >= maxAttempts) throw error
      onRetry?.(attempt, error)
    }
    await sleep(Math.min(4000, 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 150)))
  }
  throw lastError instanceof Error ? lastError : new Error(`Deeplol 요청 실패: ${url}`)
}

export function extractMemberMatchIds(payload: unknown): string[] {
  const root = asRecord(payload)
  const ids: string[] = []
  for (const row of findArray(root, ['match_id_list', 'matchList'])) {
    const item = asRecord(row)
    const matchId = normalizeId(item.match_id ?? row)
    if (matchId) ids.push(matchId)
  }
  return Array.from(new Set(ids))
}

export async function fetchMemberMatchIds(
  puuId: string,
  platformId: string,
  pageSize = 20,
  maxAttempts = 3,
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<string[]> {
  const ids: string[] = []
  let offset = 0
  while (true) {
    const url = new URL(`${DEEPLOL_API_BASE}/match/matches`)
    url.searchParams.set('puu_id', puuId)
    url.searchParams.set('platform_id', platformId)
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('count', String(pageSize))
    url.searchParams.set('queue_type', 'ALL')
    url.searchParams.set('champion_id', '0')
    url.searchParams.set('only_list', '1')
    url.searchParams.set('last_updated_at', '0')
    const payload = asRecord(await fetchJson(url.toString(), DEFAULT_TIMEOUT_MS, maxAttempts, onRetry))
    const rows = findArray(payload, ['match_id_list', 'matchList'])
    ids.push(...extractMemberMatchIds(payload))
    if (rows.length < pageSize) break
    offset += pageSize
  }
  return Array.from(new Set(ids))
}

export async function fetchDeeplolMatch(
  matchId: string,
  platformId: string,
  maxAttempts = 3,
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<DeeplolMatch> {
  const url = new URL(`${DEEPLOL_API_BASE}/match/match-cached`)
  url.searchParams.set('match_id', matchId)
  url.searchParams.set('platform_id', platformId)
  const payload = await fetchJson(url.toString(), DEFAULT_TIMEOUT_MS, maxAttempts, onRetry)
  return parseDeeplolMatch(payload, matchId, platformId)
}
