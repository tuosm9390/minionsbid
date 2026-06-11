'use server'

import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import type {
  CreateLeagueSchedulePayload,
  LeagueRosterPlayer,
  LeagueRosterSourceType,
  LeagueRosterTeam,
  LeagueScheduleCatalog,
  LeagueScheduleDay,
  LeagueScheduleItem,
  LeagueScheduleMatch,
  LeagueScheduleTimeline,
  SaveLeagueScheduleDayPayload,
} from '../types'
import {
  DEFAULT_LEAGUE_MATCH_FORMAT,
  deriveLeagueMatchWinner,
  isCompletedLeagueMatch,
  normalizeLeagueMatchFormat,
  normalizeLeagueSetLogs,
  normalizeLeagueSetScore,
  normalizeLeagueStageLabel,
  summarizeLeagueSetLogs,
} from '../utils/leagueMatchRules'
import { normalizeLeagueMatchStartTime } from '../utils/leagueMatchTime'
import { buildNextMatches, sortLeagueMatches } from '../utils/leagueNextMatches'
import {
  completeFixtureLeagueSchedule,
  createFixtureLeagueSchedule,
  deleteFixtureLeagueSchedule,
  getFixtureLeagueScheduleCatalog,
  getFixtureLeagueScheduleTimeline,
  isE2EScheduleFixtureEnabled,
  registerFixtureLeagueMatchResult,
  saveFixtureLeagueScheduleDay,
  verifyFixtureScheduleAdminCode,
} from './e2eScheduleFixture'
import { inferCaptainModeFromRoster, normalizeCaptainMode } from '@/features/auction/utils/roster'

function toIsoString(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate().toISOString()
  }
  return null
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function normalizeLeagueName(value: unknown): string | null {
  const trimmed = normalizeText(value)
  return trimmed ? trimmed : null
}

function normalizeRosterSourceType(value: unknown): LeagueRosterSourceType | null {
  return value === 'room' || value === 'archive' ? value : null
}

function toDateKey(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return value
}

function dateKeyFromIso(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isDateKeyInScheduleRange(dateKey: string, schedule: LeagueScheduleItem): boolean {
  const startKey = dateKeyFromIso(schedule.startsAt)
  const endKey = dateKeyFromIso(schedule.endsAt)
  if (startKey && dateKey < startKey) return false
  if (endKey && dateKey > endKey) return false
  return true
}

function formatDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateKey
  return date.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

function mapScheduleDoc(
  doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): LeagueScheduleItem {
  const data = doc.data() ?? {}
  return {
    id: doc.id,
    name: normalizeText(data.name),
    linkedAuctionId: normalizeText(data.linked_auction_id) || null,
    linkedLeagueName: normalizeLeagueName(data.linked_league_name),
    rosterSourceType: normalizeRosterSourceType(data.roster_source_type),
    rosterSourceId: normalizeText(data.roster_source_id) || null,
    startsAt: toIsoString(data.starts_at) ?? new Date().toISOString(),
    endsAt: toIsoString(data.ends_at),
    notes: normalizeText(data.notes),
    createdAt:
      toIsoString(data.created_at) ??
      toIsoString(data.starts_at) ??
      new Date().toISOString(),
    status: data.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
    completedAt: toIsoString(data.completed_at),
    championTeamName: normalizeLeagueName(data.champion_team_name),
  }
}

function requireScheduleAdmin(
  code?: string,
  message = '일정을 변경하려면 관리자 코드가 필요합니다.'
): { error?: string } {
  const adminCode = process.env.HALL_OF_FAME_ADMIN_CODE
  if (!adminCode || code !== adminCode) {
    return { error: message }
  }
  return {}
}

export async function verifyScheduleAdminCode(
  code: string
): Promise<{ valid: boolean }> {
  if (isE2EScheduleFixtureEnabled()) {
    return verifyFixtureScheduleAdminCode(code)
  }
  const adminCode = process.env.HALL_OF_FAME_ADMIN_CODE
  if (!adminCode || code !== adminCode) {
    return { valid: false }
  }
  return { valid: true }
}

function matchToClient(match: Record<string, unknown>): LeagueScheduleMatch {
  const format = normalizeLeagueMatchFormat({
    winsToClinch:
      typeof match.wins_to_clinch === 'number'
        ? match.wins_to_clinch
        : DEFAULT_LEAGUE_MATCH_FORMAT.winsToClinch,
    maxGames:
      typeof match.max_games === 'number'
        ? match.max_games
        : DEFAULT_LEAGUE_MATCH_FORMAT.maxGames,
  })
  const setLogs = normalizeLeagueSetLogs(match.set_logs, format.maxGames)
  const scoreFromLogs = summarizeLeagueSetLogs(setLogs)
  const rawWinner = normalizeText(match.winner)
  const fallbackHomeScore =
    setLogs.length > 0
      ? scoreFromLogs.homeScore
      : rawWinner === 'HOME'
        ? format.winsToClinch
        : 0
  const fallbackAwayScore =
    setLogs.length > 0
      ? scoreFromLogs.awayScore
      : rawWinner === 'AWAY'
        ? format.winsToClinch
        : 0
  const homeScore =
    setLogs.length > 0
      ? scoreFromLogs.homeScore
      : normalizeLeagueSetScore(match.home_score ?? fallbackHomeScore)
  const awayScore =
    setLogs.length > 0
      ? scoreFromLogs.awayScore
      : normalizeLeagueSetScore(match.away_score ?? fallbackAwayScore)
  const winner = deriveLeagueMatchWinner({
    homeScore,
    awayScore,
    format,
  })
  const isCompleted =
    winner !== 'PENDING' &&
    (typeof match.is_completed === 'boolean'
      ? match.is_completed
      : isCompletedLeagueMatch({ homeScore, awayScore, format }))

  return {
    id: normalizeText(match.id) || crypto.randomUUID(),
    startsAt: normalizeLeagueMatchStartTime(match.starts_at),
    homeTeamName: normalizeText(match.home_team_name),
    awayTeamName: normalizeText(match.away_team_name),
    stageLabel: normalizeLeagueStageLabel(match.stage_label),
    format,
    setLogs,
    homeScore,
    awayScore,
    winner,
    isCompleted,
    note: normalizeText(match.note),
    createdAt: toIsoString(match.created_at),
    updatedAt: toIsoString(match.updated_at),
  }
}

async function getScheduleById(scheduleId: string): Promise<LeagueScheduleItem | null> {
  const doc = await adminDb.collection('league_schedules').doc(scheduleId).get()
  if (!doc.exists) return null
  return mapScheduleDoc(doc)
}

function rosterPlayersFromArchive(players: unknown[]): LeagueRosterPlayer[] {
  if (!Array.isArray(players)) return []
  return players.map((player) => {
    const data = typeof player === 'object' && player !== null ? player : {}
    return {
      name: normalizeText((data as Record<string, unknown>).name),
      tier: normalizeText((data as Record<string, unknown>).tier),
      mainPosition: normalizeText((data as Record<string, unknown>).main_position),
      subPosition: normalizeText((data as Record<string, unknown>).sub_position),
      soldPrice:
        typeof (data as Record<string, unknown>).sold_price === 'number'
          ? ((data as Record<string, unknown>).sold_price as number)
          : null,
    }
  })
}

function prependCaptainToRoster(
  players: LeagueRosterPlayer[],
  options: {
    captainMode: 'IN_ROSTER' | 'COACH_ONLY'
    leaderName: string
    leaderPosition?: string
  }
): LeagueRosterPlayer[] {
  if (options.captainMode !== 'IN_ROSTER' || !options.leaderName.trim()) {
    return players
  }

  return [
    {
      name: options.leaderName,
      tier: '팀장',
      mainPosition: options.leaderPosition?.trim() || '',
      subPosition: '',
      soldPrice: null,
    },
    ...players,
  ]
}

async function getHallOfFameArchiveIdSet(): Promise<Set<string>> {
  const snapshot = await adminDb.collection('hall_of_fame').get()
  return new Set(
    snapshot.docs
      .map((doc) => doc.data().archive_id)
      .filter(
        (archiveId): archiveId is string =>
          typeof archiveId === 'string' && archiveId.trim().length > 0
      )
  )
}

function mapArchiveRosterTeam(
  archiveId: string,
  scheduleName: string,
  record: Record<string, unknown>
): LeagueRosterTeam | null {
  const name = normalizeText(record.name)
  if (!name) return null
  const leaderName = normalizeText(record.leader_name)
  const rawPlayers = Array.isArray(record.players) ? (record.players as unknown[]) : []
  const captainMode = inferCaptainModeFromRoster(record.captain_mode, {
    leaderName,
    players: rawPlayers.map((player) =>
      typeof player === 'object' && player !== null
        ? (player as { name?: string | null })
        : {}
    ),
  })

  return {
    id: normalizeText(record.id) || archiveId,
    name,
    leaderName,
    captainMode,
    pointBalance: typeof record.point_balance === 'number' ? record.point_balance : 0,
    players: rosterPlayersFromArchive(
      rawPlayers
    ).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR')),
    source: 'archive',
    auctionKey: `archive:${archiveId}`,
    auctionName: scheduleName,
  }
}

async function loadRosterTeamsFromRoomDoc(
  roomDoc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
  fallbackName: string
): Promise<LeagueRosterTeam[]> {
  if (!roomDoc.exists) return []

  const roomData = roomDoc.data() ?? {}
  const [teamsSnap, playersSnap] = await Promise.all([
    roomDoc.ref.collection('teams').get(),
    roomDoc.ref.collection('players').get(),
  ])

  const playersByTeam = new Map<string, LeagueRosterPlayer[]>()
  playersSnap.docs.forEach((playerDoc) => {
    const data = playerDoc.data()
    const teamId = normalizeText(data.team_id)
    if (!teamId || data.status !== 'SOLD') return

    const next = playersByTeam.get(teamId) ?? []
    next.push({
      name: normalizeText(data.name),
      tier: normalizeText(data.tier),
      mainPosition: normalizeText(data.main_position),
      subPosition: normalizeText(data.sub_position),
      soldPrice: typeof data.sold_price === 'number' ? data.sold_price : null,
    })
    playersByTeam.set(teamId, next)
  })

  const roomName =
    normalizeText(roomData.schedule_name) || normalizeText(roomData.name) || fallbackName
  const captainMode = normalizeCaptainMode(roomData.captain_mode)

  const teams: LeagueRosterTeam[] = []

  teamsSnap.docs.forEach((teamDoc) => {
    const data = teamDoc.data()
    const name = normalizeText(data.name)
    if (!name) return

    teams.push({
      id: teamDoc.id,
      name,
      leaderName: normalizeText(data.leader_name),
      captainMode,
      pointBalance: typeof data.point_balance === 'number' ? data.point_balance : 0,
      players: prependCaptainToRoster(
        (playersByTeam.get(teamDoc.id) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, 'ko-KR')
        ),
        {
          captainMode,
          leaderName: normalizeText(data.leader_name),
          leaderPosition: normalizeText(data.leader_position),
        }
      ),
      source: 'room',
      auctionKey: `room:${roomDoc.id}`,
      auctionName: roomName,
    })
  })

  return teams
}

function loadRosterTeamsFromArchiveDoc(
  archiveDoc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
  fallbackName: string
): LeagueRosterTeam[] {
  if (!archiveDoc.exists) return []

  const data = archiveDoc.data() ?? {}
  const scheduleName =
    normalizeText(data.schedule_name || data.room_name) || fallbackName
  const resultSnapshot = Array.isArray(data.result_snapshot) ? data.result_snapshot : []

  return resultSnapshot
    .map((team) => {
      const teamData = typeof team === 'object' && team !== null ? team : {}
      return mapArchiveRosterTeam(archiveDoc.id, scheduleName, teamData as Record<string, unknown>)
    })
    .filter((team): team is LeagueRosterTeam => team !== null)
}

async function loadRosterTeams(schedule: LeagueScheduleItem): Promise<LeagueRosterTeam[]> {
  if (schedule.rosterSourceType === 'room' && schedule.rosterSourceId) {
    const roomDoc = await adminDb.collection('rooms').doc(schedule.rosterSourceId).get()
    const roomTeams = await loadRosterTeamsFromRoomDoc(roomDoc, schedule.name)
    if (roomTeams.length > 0) return roomTeams
  }

  if (schedule.rosterSourceType === 'archive' && schedule.rosterSourceId) {
    const archiveDoc = await adminDb
      .collection('auction_archives')
      .doc(schedule.rosterSourceId)
      .get()
    const archiveTeams = loadRosterTeamsFromArchiveDoc(archiveDoc, schedule.name)
    if (archiveTeams.length > 0) return archiveTeams
  }

  if (schedule.linkedAuctionId) {
    const legacyArchiveDoc = await adminDb
      .collection('auction_archives')
      .doc(schedule.linkedAuctionId)
      .get()
    const legacyArchiveTeams = loadRosterTeamsFromArchiveDoc(legacyArchiveDoc, schedule.name)
    if (legacyArchiveTeams.length > 0) return legacyArchiveTeams
  }

  const rosterMap = new Map<string, LeagueRosterTeam>()
  const [rooms, excludedArchiveIds, archiveSnapshot] = await Promise.all([
    adminDb.collection('rooms').get(),
    getHallOfFameArchiveIdSet(),
    adminDb.collection('auction_archives').get(),
  ])
  const hasLinkedAuction = Boolean(schedule.linkedAuctionId)
  const hasLinkedLeague = Boolean(schedule.linkedLeagueName)

  for (const roomDoc of rooms.docs) {
    const roomData = roomDoc.data()
    const scheduleId = normalizeText(roomData.schedule_id)
    const linkedAuctionId = normalizeText(roomData.linked_auction_id)
    const linkedLeagueName = normalizeLeagueName(roomData.linked_league_name)
    const scheduleName = normalizeText(roomData.schedule_name)
    const matchesSchedule = hasLinkedAuction
      ? linkedAuctionId === schedule.linkedAuctionId
      : hasLinkedLeague
      ? linkedLeagueName === schedule.linkedLeagueName ||
        scheduleName === schedule.linkedLeagueName
      : scheduleId === schedule.id || scheduleName === schedule.name

    if (!matchesSchedule) continue
    const roomTeams = await loadRosterTeamsFromRoomDoc(roomDoc, schedule.name)
    roomTeams.forEach((team) => {
      rosterMap.set(team.name, team)
    })
  }

  archiveSnapshot.docs.forEach((archiveDoc) => {
    if (excludedArchiveIds.has(archiveDoc.id)) return

    const data = archiveDoc.data()
    const scheduleId = normalizeText(data.schedule_id)
    const linkedAuctionId = normalizeText(data.linked_auction_id)
    const linkedLeagueName = normalizeLeagueName(data.linked_league_name)
    const scheduleName = normalizeText(data.schedule_name || data.room_name)
    const matchesSchedule = hasLinkedAuction
      ? linkedAuctionId === schedule.linkedAuctionId || archiveDoc.id === schedule.linkedAuctionId
      : hasLinkedLeague
      ? linkedLeagueName === schedule.linkedLeagueName ||
        scheduleName === schedule.linkedLeagueName
      : scheduleId === schedule.id || scheduleName === schedule.name

    if (!matchesSchedule) return

    loadRosterTeamsFromArchiveDoc(archiveDoc, scheduleName || schedule.name).forEach((team) => {
      if (rosterMap.has(team.name)) return
      rosterMap.set(team.name, team)
    })
  })

  return Array.from(rosterMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
}

function validateScheduleMatchTeams(
  matches: Array<{ homeTeamName: string; awayTeamName: string }>,
  rosterTeams: LeagueRosterTeam[]
): { error?: string } {
  if (matches.length === 0) return {}

  const rosterTeamNames = new Set(rosterTeams.map((team) => team.name))
  if (
    rosterTeamNames.size === 0 ||
    matches.some(
      (match) =>
        !rosterTeamNames.has(match.homeTeamName) || !rosterTeamNames.has(match.awayTeamName)
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

export async function getLeagueScheduleCatalog(): Promise<LeagueScheduleCatalog> {
  if (isE2EScheduleFixtureEnabled()) {
    return getFixtureLeagueScheduleCatalog()
  }
  try {
    const [scheduleSnapshot, excludedArchiveIds, archiveSnapshot] = await Promise.all([
      adminDb.collection('league_schedules').orderBy('starts_at', 'asc').limit(50).get(),
      getHallOfFameArchiveIdSet(),
      adminDb.collection('auction_archives').orderBy('closed_at', 'desc').get(),
    ])

    const leagueOptions = archiveSnapshot.docs
      .filter((doc) => !excludedArchiveIds.has(doc.id))
      .map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          name: normalizeLeagueName(data.room_name) || normalizeLeagueName(data.schedule_name) || '이름 없는 경매',
          closedAt: toIsoString(data.closed_at),
        }
      })
      .sort((a, b) => {
        const left = a.closedAt ?? ''
        const right = b.closedAt ?? ''
        return right.localeCompare(left, 'ko-KR')
      })

    const schedules: LeagueScheduleItem[] = scheduleSnapshot.docs.map(mapScheduleDoc)

    return {
      leagueOptions,
      schedules,
    }
  } catch (err) {
    console.error('getLeagueScheduleCatalog error:', err)
    return {
      leagueOptions: [],
      schedules: [],
    }
  }
}

export async function createLeagueSchedule(
  payload: CreateLeagueSchedulePayload,
  adminCode?: string
): Promise<{ error?: string; schedule?: LeagueScheduleItem }> {
  if (isE2EScheduleFixtureEnabled()) {
    return createFixtureLeagueSchedule(payload, adminCode)
  }
  const { error: adminError } = requireScheduleAdmin(
    adminCode,
    '일정을 생성하려면 관리자 코드가 필요합니다.'
  )
  if (adminError) return { error: adminError }

  const linkedAuctionId = payload.linkedAuctionId?.trim() || null
  const linkedLeagueName = payload.linkedLeagueName?.trim() || null
  const rosterSourceType = payload.rosterSourceType ?? (linkedAuctionId ? 'archive' : null)
  const rosterSourceId = payload.rosterSourceId?.trim() || linkedAuctionId
  const name = payload.name.trim()
  const notes = payload.notes?.trim() || ''

  if (!name) return { error: '일정 이름을 입력해주세요.' }

  const startDate = new Date(payload.startsAt)
  if (Number.isNaN(startDate.getTime())) {
    return { error: '시작 일정을 확인해주세요.' }
  }

  let endDate: Date | null = null
  if (payload.endsAt) {
    endDate = new Date(payload.endsAt)
    if (Number.isNaN(endDate.getTime())) {
      return { error: '종료 일정을 확인해주세요.' }
    }
    if (endDate.getTime() < startDate.getTime()) {
      return { error: '종료 일정은 시작 일정 이후여야 합니다.' }
    }
  }

  try {
    const docRef = await adminDb.collection('league_schedules').add({
      name,
      linked_auction_id: linkedAuctionId,
      linked_league_name: linkedLeagueName,
      roster_source_type: rosterSourceType,
      roster_source_id: rosterSourceId,
      starts_at: Timestamp.fromDate(startDate),
      ends_at: endDate ? Timestamp.fromDate(endDate) : null,
      notes,
      status: 'ACTIVE',
      completed_at: null,
      champion_team_name: null,
      created_at: FieldValue.serverTimestamp(),
    })

    return {
      schedule: {
        id: docRef.id,
        name,
        linkedAuctionId,
        linkedLeagueName,
        rosterSourceType,
        rosterSourceId,
        startsAt: startDate.toISOString(),
        endsAt: endDate ? endDate.toISOString() : null,
        notes,
        createdAt: new Date().toISOString(),
        status: 'ACTIVE',
        completedAt: null,
        championTeamName: null,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}

export async function getLeagueScheduleTimeline(
  scheduleId: string
): Promise<LeagueScheduleTimeline> {
  if (isE2EScheduleFixtureEnabled()) {
    return getFixtureLeagueScheduleTimeline(scheduleId)
  }
  try {
    const schedule = await getScheduleById(scheduleId)
    if (!schedule) {
      return {
        schedule: null,
        days: [],
        rosterTeams: [],
        availableTeamNames: [],
        nextMatches: [],
      }
    }

    const [daysSnapshot, rosterTeams] = await Promise.all([
      adminDb
        .collection('league_schedules')
        .doc(scheduleId)
        .collection('match_days')
        .orderBy('date_key', 'asc')
        .get(),
      loadRosterTeams(schedule),
    ])

    const days: LeagueScheduleDay[] = daysSnapshot.docs.map((doc) => {
      const data = doc.data()
      const rawMatches = Array.isArray(data.matches) ? data.matches : []
      const matches = sortLeagueMatches(
        rawMatches.map((match) => matchToClient(match as Record<string, unknown>))
      )
      const dateKey = normalizeText(data.date_key)
      return {
        id: doc.id,
        dateKey,
        dateLabel: formatDateLabel(dateKey),
        matches,
      }
    })

    const availableTeamNames = rosterTeams.map((team) => team.name)

    return {
      schedule,
      days,
      rosterTeams,
      availableTeamNames,
      nextMatches: buildNextMatches(days),
    }
  } catch (err) {
    console.error('getLeagueScheduleTimeline error:', err)
    return {
      schedule: null,
      days: [],
      rosterTeams: [],
      availableTeamNames: [],
      nextMatches: [],
    }
  }
}

export async function saveLeagueScheduleDay(
  scheduleId: string,
  payload: SaveLeagueScheduleDayPayload,
  adminCode?: string
): Promise<{ error?: string }> {
  if (isE2EScheduleFixtureEnabled()) {
    return saveFixtureLeagueScheduleDay(scheduleId, payload, adminCode)
  }
  const { error: adminError } = requireScheduleAdmin(
    adminCode,
    '일정을 저장하려면 관리자 코드가 필요합니다.'
  )
  if (adminError) return { error: adminError }

  const dateKey = toDateKey(payload.dateKey)
  if (!dateKey) return { error: '날짜를 다시 확인해주세요.' }

  const sanitizedMatches = payload.matches
    .map((match) => ({
      id: normalizeText(match.id) || crypto.randomUUID(),
      startsAt: normalizeLeagueMatchStartTime(match.startsAt),
      homeTeamName: normalizeText(match.homeTeamName),
      awayTeamName: normalizeText(match.awayTeamName),
      stageLabel: normalizeLeagueStageLabel(match.stageLabel),
      format: normalizeLeagueMatchFormat({
        winsToClinch: match.winsToClinch,
        maxGames: match.maxGames,
      }),
    }))
    .filter((match) => match.startsAt && match.homeTeamName && match.awayTeamName)

  if (sanitizedMatches.some((match) => match.homeTeamName === match.awayTeamName)) {
    return { error: '같은 팀끼리의 경기는 저장할 수 없습니다.' }
  }

  try {
    const schedule = await getScheduleById(scheduleId)
    if (!schedule) return { error: '일정을 찾을 수 없습니다.' }
    if (!isDateKeyInScheduleRange(dateKey, schedule)) {
      return { error: '일정 기간 안의 날짜만 저장할 수 있습니다.' }
    }
    const rosterTeams = await loadRosterTeams(schedule)
    const { error: teamError } = validateScheduleMatchTeams(sanitizedMatches, rosterTeams)
    if (teamError) return { error: teamError }

    const now = Timestamp.now()
    const scheduleRef = adminDb.collection('league_schedules').doc(scheduleId)
    const dayRef = adminDb
      .collection('league_schedules')
      .doc(scheduleId)
      .collection('match_days')
      .doc(dateKey)

    await adminDb.runTransaction(async (transaction) => {
      const [scheduleSnap, existingSnap] = await Promise.all([
        transaction.get(scheduleRef),
        transaction.get(dayRef),
      ])

      if (!scheduleSnap.exists) {
        throw new Error('일정을 찾을 수 없습니다.')
      }

      const latestSchedule = mapScheduleDoc(scheduleSnap)
      if (!isDateKeyInScheduleRange(dateKey, latestSchedule)) {
        throw new Error('일정 기간 안의 날짜만 저장할 수 있습니다.')
      }

      const existingMatches = Array.isArray(existingSnap.data()?.matches)
        ? (existingSnap.data()?.matches as Record<string, unknown>[])
        : []
      const existingMap = new Map(
        existingMatches.map((match) => [normalizeText(match.id), match] as const)
      )

      const nextMatches = sanitizedMatches
        .map((match) => {
          const prev = existingMap.get(match.id)
          const prevClient = prev ? matchToClient(prev) : null
          const canPreserveResult =
            prevClient &&
            prevClient.homeTeamName === match.homeTeamName &&
            prevClient.awayTeamName === match.awayTeamName &&
            prevClient.format.winsToClinch === match.format.winsToClinch &&
            prevClient.format.maxGames === match.format.maxGames &&
            isCompletedLeagueMatch({
              homeScore: prevClient.homeScore,
              awayScore: prevClient.awayScore,
              format: match.format,
            })

          const homeScore = canPreserveResult ? prevClient.homeScore : 0
          const awayScore = canPreserveResult ? prevClient.awayScore : 0
          const winner = deriveLeagueMatchWinner({
            homeScore,
            awayScore,
            format: match.format,
          })

          return {
            id: match.id,
            starts_at: match.startsAt,
            home_team_name: match.homeTeamName,
            away_team_name: match.awayTeamName,
            stage_label: match.stageLabel,
            wins_to_clinch: match.format.winsToClinch,
            max_games: match.format.maxGames,
            set_logs: canPreserveResult
              ? prevClient.setLogs.map((setLog) => ({
                  set_number: setLog.setNumber,
                  winner: setLog.winner,
                  note: setLog.note,
                }))
              : [],
            home_score: homeScore,
            away_score: awayScore,
            winner,
            is_completed: winner !== 'PENDING',
            note: canPreserveResult ? prevClient.note : '',
            created_at: prev?.created_at ?? now,
            updated_at: now,
          }
        })
        .sort((left, right) =>
          String(left.starts_at).localeCompare(String(right.starts_at), 'ko-KR')
        )

      transaction.set(
        dayRef,
        {
          date_key: dateKey,
          matches: nextMatches,
          revision: (typeof existingSnap.data()?.revision === 'number'
            ? existingSnap.data()?.revision
            : 0) + 1,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    })

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}

export async function registerLeagueMatchResult(args: {
  scheduleId: string
  dateKey: string
  matchId: string
  homeScore: number
  awayScore: number
  setLogs?: Array<{ winner: 'HOME' | 'AWAY'; note?: string }>
  note?: string
  adminCode?: string
}): Promise<{ error?: string }> {
  if (isE2EScheduleFixtureEnabled()) {
    return registerFixtureLeagueMatchResult(args)
  }
  const { error: adminError } = requireScheduleAdmin(
    args.adminCode,
    '경기 결과를 등록하려면 관리자 코드가 필요합니다.'
  )
  if (adminError) return { error: adminError }

  const dateKey = toDateKey(args.dateKey)
  if (!dateKey) return { error: '날짜를 다시 확인해주세요.' }
  if (!args.matchId.trim()) return { error: '경기를 선택해주세요.' }

  try {
    const now = Timestamp.now()
    const scheduleRef = adminDb.collection('league_schedules').doc(args.scheduleId)
    const dayRef = adminDb
      .collection('league_schedules')
      .doc(args.scheduleId)
      .collection('match_days')
      .doc(dateKey)

    await adminDb.runTransaction(async (transaction) => {
      const [scheduleSnap, daySnap] = await Promise.all([
        transaction.get(scheduleRef),
        transaction.get(dayRef),
      ])

      if (!scheduleSnap.exists) {
        throw new Error('일정을 찾을 수 없습니다.')
      }
      if (!daySnap.exists) {
        throw new Error('해당 날짜의 경기를 찾을 수 없습니다.')
      }

      const rawMatches = Array.isArray(daySnap.data()?.matches)
        ? (daySnap.data()?.matches as Record<string, unknown>[])
        : []
      const matchIndex = rawMatches.findIndex(
        (match) => normalizeText(match.id) === args.matchId.trim()
      )

      if (matchIndex < 0) {
        throw new Error('해당 경기를 찾을 수 없습니다.')
      }

      const currentMatch = matchToClient(rawMatches[matchIndex])
      const nextNote = normalizeText(args.note)
      const setLogs = normalizeLeagueSetLogs(
        args.setLogs?.map((setLog) => ({
          winner: setLog.winner,
          note: setLog.note,
        })) ?? [],
        currentMatch.format.maxGames
      )
      const derivedScoreFromLogs = summarizeLeagueSetLogs(setLogs)
      const hasSetLogs = setLogs.length > 0
      const homeScore = hasSetLogs
        ? derivedScoreFromLogs.homeScore
        : normalizeLeagueSetScore(args.homeScore)
      const awayScore = hasSetLogs
        ? derivedScoreFromLogs.awayScore
        : normalizeLeagueSetScore(args.awayScore)

      if (homeScore > currentMatch.format.maxGames || awayScore > currentMatch.format.maxGames) {
        throw new Error(
          `세트 스코어는 최대 ${currentMatch.format.maxGames}세트를 넘길 수 없습니다.`
        )
      }

      const winner = deriveLeagueMatchWinner({
        homeScore,
        awayScore,
        format: currentMatch.format,
      })

      if (winner === 'PENDING') {
        throw new Error(
          `${currentMatch.format.maxGames}판 ${currentMatch.format.winsToClinch}선승 규칙에 맞는 최종 세트 스코어를 입력해주세요.`
        )
      }

      rawMatches[matchIndex] = {
        ...rawMatches[matchIndex],
        wins_to_clinch: currentMatch.format.winsToClinch,
        max_games: currentMatch.format.maxGames,
        set_logs: setLogs.map((setLog) => ({
          set_number: setLog.setNumber,
          winner: setLog.winner,
          note: setLog.note,
        })),
        home_score: homeScore,
        away_score: awayScore,
        winner,
        is_completed: true,
        note: nextNote,
        updated_at: now,
      }

      transaction.update(dayRef, {
        matches: rawMatches,
        revision: (typeof daySnap.data()?.revision === 'number' ? daySnap.data()?.revision : 0) + 1,
        updated_at: FieldValue.serverTimestamp(),
      })
    })

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}

export async function deleteLeagueSchedule(
  scheduleId: string,
  adminCode?: string
): Promise<{ error?: string }> {
  if (isE2EScheduleFixtureEnabled()) {
    return deleteFixtureLeagueSchedule(scheduleId, adminCode)
  }
  if (!scheduleId.trim()) return { error: '일정을 선택해주세요.' }
  const { error: adminError } = requireScheduleAdmin(
    adminCode,
    '일정을 삭제하려면 관리자 코드가 필요합니다.'
  )
  if (adminError) return { error: adminError }

  try {
    const normalizedScheduleId = scheduleId.trim()
    const scheduleRef = adminDb.collection('league_schedules').doc(normalizedScheduleId)
    await adminDb.recursiveDelete(scheduleRef)
    await adminDb.collection('hall_of_fame').doc(`schedule:${normalizedScheduleId}`).delete()
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}

export async function completeLeagueSchedule(args: {
  scheduleId: string
  championTeamName: string
  adminCode?: string
}): Promise<{ error?: string }> {
  if (isE2EScheduleFixtureEnabled()) {
    return completeFixtureLeagueSchedule(args)
  }
  const scheduleId = args.scheduleId.trim()
  const championTeamName = normalizeText(args.championTeamName)
  const { error: adminError } = requireScheduleAdmin(
    args.adminCode,
    '일정을 종료하려면 관리자 코드가 필요합니다.'
  )
  if (adminError) return { error: adminError }

  if (!scheduleId) return { error: '일정을 선택해주세요.' }
  if (!championTeamName) return { error: '최종 우승팀을 선택해주세요.' }

  try {
    const scheduleRef = adminDb.collection('league_schedules').doc(scheduleId)
    const schedule = await getScheduleById(scheduleId)
    if (!schedule) return { error: '일정을 찾을 수 없습니다.' }
    if (schedule.status === 'COMPLETED') {
      return { error: '이미 종료된 일정입니다.' }
    }

    const rosterTeams = await loadRosterTeams(schedule)
    const championTeam = rosterTeams.find((team) => team.name === championTeamName)
    if (!championTeam) {
      return { error: '우승팀 정보를 찾을 수 없습니다.' }
    }

    const wonAt = new Date().toISOString()
    const hallOfFameArchiveId = `schedule:${scheduleId}`
    const hallOfFameDocRef = adminDb.collection('hall_of_fame').doc(hallOfFameArchiveId)

    await adminDb.runTransaction(async (transaction) => {
      const scheduleSnap = await transaction.get(scheduleRef)
      if (!scheduleSnap.exists) {
        throw new Error('일정을 찾을 수 없습니다.')
      }

      const latestSchedule = mapScheduleDoc(scheduleSnap)
      if (latestSchedule.status === 'COMPLETED') {
        throw new Error('이미 종료된 일정입니다.')
      }

      transaction.set(hallOfFameDocRef, {
        archive_id: hallOfFameArchiveId,
        room_id: `schedule:${scheduleId}`,
        season_name: latestSchedule.name,
        winning_team_name: championTeam.name,
        winning_team_leader: championTeam.leaderName,
        winning_team_players: championTeam.players.map((player) => ({
          name: player.name,
          sold_price: player.soldPrice,
        })),
        won_at: wonAt,
        registered_at: FieldValue.serverTimestamp(),
      })

      transaction.update(scheduleRef, {
        status: 'COMPLETED',
        champion_team_name: championTeam.name,
        completed_at: FieldValue.serverTimestamp(),
        archived_at: FieldValue.serverTimestamp(),
      })
    })

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}
