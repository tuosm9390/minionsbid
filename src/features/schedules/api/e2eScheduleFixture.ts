import type {
  CreateLeagueSchedulePayload,
  LeagueRosterTeam,
  LeagueScheduleCatalog,
  LeagueScheduleDay,
  LeagueScheduleItem,
  LeagueScheduleMatch,
  LeagueScheduleTimeline,
  SaveLeagueScheduleDayPayload,
} from '../types'
import {
  deriveLeagueMatchWinner,
  normalizeLeagueMatchFormat,
  normalizeLeagueSetLogs,
  normalizeLeagueSetScore,
  normalizeLeagueStageLabel,
  summarizeLeagueSetLogs,
} from '../utils/leagueMatchRules'
import { buildNextMatches, sortLeagueMatches } from '../utils/leagueNextMatches'

type FixtureState = {
  leagueOptions: Array<{ id: string; name: string; closedAt: string | null }>
  schedules: LeagueScheduleItem[]
  daysByScheduleId: Map<string, LeagueScheduleDay[]>
  rosterTeamsBySourceId: Map<string, LeagueRosterTeam[]>
}

const FIXTURE_KEY = '__leagueScheduleE2EFixture__'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createRoster(sourceId: string, sourceName: string): LeagueRosterTeam[] {
  return [
    {
      id: `${sourceId}-blue`,
      name: 'Blue',
      leaderName: 'Captain Blue',
      captainMode: 'IN_ROSTER',
      pointBalance: 0,
      players: [],
      source: 'archive',
      auctionKey: `archive:${sourceId}`,
      auctionName: sourceName,
    },
    {
      id: `${sourceId}-red`,
      name: 'Red',
      leaderName: 'Captain Red',
      captainMode: 'IN_ROSTER',
      pointBalance: 0,
      players: [],
      source: 'archive',
      auctionKey: `archive:${sourceId}`,
      auctionName: sourceName,
    },
  ]
}

function createInitialFixtureState(): FixtureState {
  const activeSchedule: LeagueScheduleItem = {
    id: 'fixture-active',
    name: 'Fixture Active',
    linkedAuctionId: 'archive-alpha',
    linkedLeagueName: 'Fixture Cup Alpha',
    rosterSourceType: 'archive',
    rosterSourceId: 'archive-alpha',
    startsAt: '2026-04-27T00:00:00.000Z',
    endsAt: '2026-04-30T00:00:00.000Z',
    notes: '활성 일정 fixture',
    createdAt: '2026-04-27T00:00:00.000Z',
    status: 'ACTIVE',
    completedAt: null,
    championTeamName: null,
  }

  const completedSchedule: LeagueScheduleItem = {
    id: 'fixture-completed',
    name: 'Fixture Completed',
    linkedAuctionId: 'archive-beta',
    linkedLeagueName: 'Fixture Cup Beta',
    rosterSourceType: 'archive',
    rosterSourceId: 'archive-beta',
    startsAt: '2026-04-20T00:00:00.000Z',
    endsAt: '2026-04-25T00:00:00.000Z',
    notes: '완료 일정 fixture',
    createdAt: '2026-04-20T00:00:00.000Z',
    status: 'COMPLETED',
    completedAt: '2026-04-25T12:00:00.000Z',
    championTeamName: 'Blue',
  }

  const completedDays: LeagueScheduleDay[] = [
    {
      id: '2026-04-22',
      dateKey: '2026-04-22',
      dateLabel: '4월 22일',
      matches: [
        {
          id: 'fixture-completed-match-1',
          startsAt: '20:00',
          homeTeamName: 'Blue',
          awayTeamName: 'Red',
          stageLabel: '결승',
          format: { winsToClinch: 2, maxGames: 3 },
          setLogs: [
            { setNumber: 1, winner: 'HOME', note: '1세트' },
            { setNumber: 2, winner: 'HOME', note: '2세트' },
          ],
          homeScore: 2,
          awayScore: 0,
          winner: 'HOME',
          isCompleted: true,
          note: '완료 fixture',
          createdAt: '2026-04-22T00:00:00.000Z',
          updatedAt: '2026-04-22T00:00:00.000Z',
        },
      ],
    },
  ]

  return {
    leagueOptions: [
      { id: 'archive-alpha', name: 'Fixture Cup Alpha', closedAt: '2026-04-01T00:00:00.000Z' },
      { id: 'archive-beta', name: 'Fixture Cup Beta', closedAt: '2026-03-20T00:00:00.000Z' },
    ],
    schedules: [activeSchedule, completedSchedule],
    daysByScheduleId: new Map([
      [activeSchedule.id, []],
      [completedSchedule.id, completedDays],
    ]),
    rosterTeamsBySourceId: new Map([
      ['archive-alpha', createRoster('archive-alpha', 'Fixture Cup Alpha')],
      ['archive-beta', createRoster('archive-beta', 'Fixture Cup Beta')],
    ]),
  }
}

function getFixtureState(): FixtureState {
  const globalStore = globalThis as typeof globalThis & {
    [FIXTURE_KEY]?: FixtureState
  }

  if (!globalStore[FIXTURE_KEY]) {
    globalStore[FIXTURE_KEY] = createInitialFixtureState()
  }

  return globalStore[FIXTURE_KEY] as FixtureState
}

export function isE2EScheduleFixtureEnabled() {
  return process.env.E2E_SCHEDULE_FIXTURE === '1'
}

export function resetE2EScheduleFixture() {
  const globalStore = globalThis as typeof globalThis & {
    [FIXTURE_KEY]?: FixtureState
  }
  globalStore[FIXTURE_KEY] = createInitialFixtureState()
}

export async function verifyFixtureScheduleAdminCode(code: string) {
  return { valid: code === process.env.HALL_OF_FAME_ADMIN_CODE }
}

export async function getFixtureLeagueScheduleCatalog(): Promise<LeagueScheduleCatalog> {
  const state = getFixtureState()
  return {
    leagueOptions: clone(state.leagueOptions),
    schedules: clone(state.schedules),
  }
}

function getFixtureRosterTeams(schedule: LeagueScheduleItem) {
  if (!schedule.rosterSourceId) return []
  return clone(statefulRoster(schedule.rosterSourceId))
}

function statefulRoster(sourceId: string) {
  const state = getFixtureState()
  return state.rosterTeamsBySourceId.get(sourceId) ?? []
}

function dateKeyFromIso(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isDateKeyInFixtureScheduleRange(dateKey: string, schedule: LeagueScheduleItem) {
  const startKey = dateKeyFromIso(schedule.startsAt)
  const endKey = dateKeyFromIso(schedule.endsAt)
  if (startKey && dateKey < startKey) return false
  if (endKey && dateKey > endKey) return false
  return true
}

function validateFixtureMatchTeams(
  matches: Array<{ homeTeamName: string; awayTeamName: string }>,
  rosterTeams: LeagueRosterTeam[],
): { error?: string } {
  if (matches.length === 0) return {}
  const rosterTeamNames = new Set(rosterTeams.map((team) => team.name))
  if (
    rosterTeamNames.size === 0 ||
    matches.some(
      (match) =>
        !rosterTeamNames.has(match.homeTeamName) || !rosterTeamNames.has(match.awayTeamName),
    )
  ) {
    return { error: '일정 로스터에 없는 팀은 저장할 수 없습니다.' }
  }

  const assignedTeamNames = new Set<string>()
  for (const match of matches) {
    for (const teamName of [match.homeTeamName, match.awayTeamName]) {
      if (assignedTeamNames.has(teamName)) {
        return { error: '같은 날짜에 같은 팀을 여러 경기에 배정할 수 없습니다.' }
      }
      assignedTeamNames.add(teamName)
    }
  }
  return {}
}

export async function getFixtureLeagueScheduleTimeline(
  scheduleId: string,
): Promise<LeagueScheduleTimeline> {
  const state = getFixtureState()
  const schedule = state.schedules.find((item) => item.id === scheduleId) ?? null
  if (!schedule) {
    return {
      schedule: null,
      days: [],
      rosterTeams: [],
      availableTeamNames: [],
      nextMatches: [],
    }
  }

  const days = clone(state.daysByScheduleId.get(scheduleId) ?? [])
  const rosterTeams = getFixtureRosterTeams(schedule)

  return {
    schedule: clone(schedule),
    days,
    rosterTeams,
    availableTeamNames: rosterTeams.map((team) => team.name),
    nextMatches: buildNextMatches(days),
  }
}

export async function createFixtureLeagueSchedule(
  payload: CreateLeagueSchedulePayload,
  adminCode?: string,
): Promise<{ error?: string; schedule?: LeagueScheduleItem }> {
  if (adminCode !== process.env.HALL_OF_FAME_ADMIN_CODE) {
    return { error: '일정을 생성하려면 관리자 코드가 필요합니다.' }
  }

  const state = getFixtureState()
  const id = `fixture-created-${state.schedules.length + 1}`
  const schedule: LeagueScheduleItem = {
    id,
    name: payload.name.trim(),
    linkedAuctionId: payload.linkedAuctionId?.trim() || null,
    linkedLeagueName: payload.linkedLeagueName?.trim() || null,
    rosterSourceType: payload.rosterSourceType ?? null,
    rosterSourceId: payload.rosterSourceId?.trim() || null,
    startsAt: new Date(payload.startsAt).toISOString(),
    endsAt: payload.endsAt ? new Date(payload.endsAt).toISOString() : null,
    notes: payload.notes?.trim() || '',
    createdAt: new Date('2026-04-27T12:00:00.000Z').toISOString(),
    status: 'ACTIVE',
    completedAt: null,
    championTeamName: null,
  }

  state.schedules.push(schedule)
  state.daysByScheduleId.set(id, [])

  return { schedule: clone(schedule) }
}

export async function saveFixtureLeagueScheduleDay(
  scheduleId: string,
  payload: SaveLeagueScheduleDayPayload,
  adminCode?: string,
): Promise<{ error?: string }> {
  if (adminCode !== process.env.HALL_OF_FAME_ADMIN_CODE) {
    return { error: '일정을 저장하려면 관리자 코드가 필요합니다.' }
  }

  const state = getFixtureState()
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) return { error: '일정을 찾을 수 없습니다.' }
  if (!isDateKeyInFixtureScheduleRange(payload.dateKey, schedule)) {
    return { error: '일정 기간 안의 날짜만 저장할 수 있습니다.' }
  }

  const dateLabel = new Date(`${payload.dateKey}T00:00:00`).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })

  const existingDays = state.daysByScheduleId.get(scheduleId) ?? []
  const existingDay = existingDays.find((day) => day.dateKey === payload.dateKey) ?? null
  const existingMatches = new Map(
    (existingDay?.matches ?? []).map((match) => [match.id, match] as const),
  )

  const matches: LeagueScheduleMatch[] = payload.matches
    .map((match, index) => {
      const format = normalizeLeagueMatchFormat({
        winsToClinch: match.winsToClinch,
        maxGames: match.maxGames,
      })
      const id = match.id?.trim() || `match-${payload.dateKey}-${index + 1}`
      const previous = existingMatches.get(id)
      return {
        id,
        startsAt: match.startsAt.trim(),
        homeTeamName: match.homeTeamName.trim(),
        awayTeamName: match.awayTeamName.trim(),
        stageLabel: normalizeLeagueStageLabel(match.stageLabel),
        format,
        setLogs: previous?.setLogs ?? [],
        homeScore: previous?.homeScore ?? 0,
        awayScore: previous?.awayScore ?? 0,
        winner:
          previous?.winner ??
          deriveLeagueMatchWinner({ homeScore: 0, awayScore: 0, format }),
        isCompleted: previous?.isCompleted ?? false,
        note: previous?.note ?? '',
        createdAt: previous?.createdAt ?? new Date('2026-04-27T12:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-04-27T12:00:00.000Z').toISOString(),
      }
    })
    .filter((match) => match.homeTeamName && match.awayTeamName)

  if (matches.some((match) => match.homeTeamName === match.awayTeamName)) {
    return { error: '같은 팀끼리의 경기는 저장할 수 없습니다.' }
  }

  const { error: teamError } = validateFixtureMatchTeams(matches, getFixtureRosterTeams(schedule))
  if (teamError) return { error: teamError }

  const nextDay: LeagueScheduleDay = {
    id: payload.dateKey,
    dateKey: payload.dateKey,
    dateLabel,
    matches: sortLeagueMatches(matches),
  }

  const nextDays = existingDays.filter((day) => day.dateKey !== payload.dateKey)
  nextDays.push(nextDay)
  nextDays.sort((left, right) => left.dateKey.localeCompare(right.dateKey, 'ko-KR'))
  state.daysByScheduleId.set(scheduleId, nextDays)

  return {}
}

export async function registerFixtureLeagueMatchResult(args: {
  scheduleId: string
  dateKey: string
  matchId: string
  homeScore: number
  awayScore: number
  setLogs?: Array<{ winner: 'HOME' | 'AWAY'; note?: string }>
  note?: string
  adminCode?: string
}): Promise<{ error?: string }> {
  if (args.adminCode !== process.env.HALL_OF_FAME_ADMIN_CODE) {
    return { error: '경기 결과를 등록하려면 관리자 코드가 필요합니다.' }
  }

  const state = getFixtureState()
  const days = state.daysByScheduleId.get(args.scheduleId) ?? []
  const day = days.find((entry) => entry.dateKey === args.dateKey)
  if (!day) return { error: '해당 날짜의 경기를 찾을 수 없습니다.' }

  const match = day.matches.find((entry) => entry.id === args.matchId)
  if (!match) return { error: '해당 경기를 찾을 수 없습니다.' }

  const setLogs = normalizeLeagueSetLogs(args.setLogs ?? [], match.format.maxGames)
  const summary = summarizeLeagueSetLogs(setLogs)
  const usesSetLogs = setLogs.length > 0
  const homeScore = usesSetLogs ? summary.homeScore : normalizeLeagueSetScore(args.homeScore)
  const awayScore = usesSetLogs ? summary.awayScore : normalizeLeagueSetScore(args.awayScore)
  const winner = deriveLeagueMatchWinner({
    homeScore,
    awayScore,
    format: match.format,
  })

  if (winner === 'PENDING') {
    return {
      error: `${match.format.maxGames}판 ${match.format.winsToClinch}선승 규칙에 맞는 최종 세트 스코어를 입력해주세요.`,
    }
  }

  match.setLogs = setLogs
  match.homeScore = homeScore
  match.awayScore = awayScore
  match.winner = winner
  match.isCompleted = true
  match.note = args.note?.trim() || ''
  match.updatedAt = new Date('2026-04-27T12:00:00.000Z').toISOString()

  return {}
}

export async function deleteFixtureLeagueSchedule(
  scheduleId: string,
  adminCode?: string,
): Promise<{ error?: string }> {
  if (adminCode !== process.env.HALL_OF_FAME_ADMIN_CODE) {
    return { error: '일정을 삭제하려면 관리자 코드가 필요합니다.' }
  }

  const state = getFixtureState()
  state.schedules = state.schedules.filter((schedule) => schedule.id !== scheduleId)
  state.daysByScheduleId.delete(scheduleId)
  return {}
}

export async function completeFixtureLeagueSchedule(args: {
  scheduleId: string
  championTeamName: string
  adminCode?: string
}): Promise<{ error?: string }> {
  if (args.adminCode !== process.env.HALL_OF_FAME_ADMIN_CODE) {
    return { error: '일정을 종료하려면 관리자 코드가 필요합니다.' }
  }

  const state = getFixtureState()
  const schedule = state.schedules.find((item) => item.id === args.scheduleId)
  if (!schedule) return { error: '일정을 찾을 수 없습니다.' }
  if (schedule.status === 'COMPLETED') return { error: '이미 종료된 일정입니다.' }

  schedule.status = 'COMPLETED'
  schedule.championTeamName = args.championTeamName.trim()
  schedule.completedAt = new Date('2026-04-27T12:00:00.000Z').toISOString()

  return {}
}
