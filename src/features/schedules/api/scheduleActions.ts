'use server'

import * as admin from 'firebase-admin'
import { adminDb } from '@/lib/firebaseAdmin'
import type {
  CreateLeagueSchedulePayload,
  LeagueRosterPlayer,
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

function toDateKey(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return value
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

function verifyTimelineAdminCode(code?: string): { error?: string } {
  const adminCode = process.env.HALL_OF_FAME_ADMIN_CODE
  if (!adminCode || code !== adminCode) {
    return { error: '등록된 경기 결과를 수정하려면 관리자 코드가 필요합니다.' }
  }
  return {}
}

export async function verifyScheduleAdminCode(
  code: string
): Promise<{ valid: boolean }> {
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

async function getHallOfFameArchiveIdSet(): Promise<Set<string>> {
  const snapshot = await adminDb.collection('hall_of_fame').limit(200).get()
  return new Set(
    snapshot.docs
      .map((doc) => doc.data().archive_id)
      .filter(
        (archiveId): archiveId is string =>
          typeof archiveId === 'string' && archiveId.trim().length > 0
      )
  )
}

async function loadRosterTeams(schedule: LeagueScheduleItem): Promise<LeagueRosterTeam[]> {
  const rosterMap = new Map<string, LeagueRosterTeam>()
  const [rooms, excludedArchiveIds, archiveSnapshot] = await Promise.all([
    adminDb.collection('rooms').get(),
    getHallOfFameArchiveIdSet(),
    adminDb.collection('auction_archives').limit(100).get(),
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

    teamsSnap.docs.forEach((teamDoc) => {
      const data = teamDoc.data()
      const name = normalizeText(data.name)
      if (!name) return
      const roomName =
        normalizeText(roomData.schedule_name) ||
        normalizeText(roomData.name) ||
        schedule.name

      rosterMap.set(name, {
        id: teamDoc.id,
        name,
        leaderName: normalizeText(data.leader_name),
        pointBalance: typeof data.point_balance === 'number' ? data.point_balance : 0,
        players: (playersByTeam.get(teamDoc.id) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, 'ko-KR')
        ),
        source: 'room',
        auctionKey: `room:${roomDoc.id}`,
        auctionName: roomName,
      })
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

    const resultSnapshot = Array.isArray(data.result_snapshot) ? data.result_snapshot : []
    resultSnapshot.forEach((team) => {
      const teamData = typeof team === 'object' && team !== null ? team : {}
      const record = teamData as Record<string, unknown>
      const name = normalizeText(record.name)
      if (!name || rosterMap.has(name)) return
      rosterMap.set(name, {
        id: normalizeText(record.id) || archiveDoc.id,
        name,
        leaderName: normalizeText(record.leader_name),
        pointBalance: typeof record.point_balance === 'number' ? record.point_balance : 0,
        players: rosterPlayersFromArchive(
          Array.isArray(record.players) ? (record.players as unknown[]) : []
        ).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR')),
        source: 'archive',
        auctionKey: `archive:${archiveDoc.id}`,
        auctionName: scheduleName || schedule.name,
      })
    })
  })

  return Array.from(rosterMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
}

export async function getLeagueScheduleCatalog(): Promise<LeagueScheduleCatalog> {
  try {
    const [scheduleSnapshot, excludedArchiveIds, archiveSnapshot] = await Promise.all([
      adminDb.collection('league_schedules').orderBy('starts_at', 'asc').limit(50).get(),
      getHallOfFameArchiveIdSet(),
      adminDb.collection('auction_archives').orderBy('closed_at', 'desc').limit(100).get(),
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
  payload: CreateLeagueSchedulePayload
): Promise<{ error?: string; schedule?: LeagueScheduleItem }> {
  const linkedAuctionId = payload.linkedAuctionId?.trim() || null
  const linkedLeagueName = payload.linkedLeagueName?.trim() || null
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
      starts_at: admin.firestore.Timestamp.fromDate(startDate),
      ends_at: endDate ? admin.firestore.Timestamp.fromDate(endDate) : null,
      notes,
      status: 'ACTIVE',
      completed_at: null,
      champion_team_name: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    })

    return {
      schedule: {
        id: docRef.id,
        name,
        linkedAuctionId,
        linkedLeagueName,
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
  payload: SaveLeagueScheduleDayPayload
): Promise<{ error?: string }> {
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
    const now = admin.firestore.Timestamp.now()
    const dayRef = adminDb
      .collection('league_schedules')
      .doc(scheduleId)
      .collection('match_days')
      .doc(dateKey)

    const existingSnap = await dayRef.get()
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
      .sort((left, right) => String(left.starts_at).localeCompare(String(right.starts_at), 'ko-KR'))

    await dayRef.set(
      {
        date_key: dateKey,
        matches: nextMatches,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

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
  const dateKey = toDateKey(args.dateKey)
  if (!dateKey) return { error: '날짜를 다시 확인해주세요.' }
  if (!args.matchId.trim()) return { error: '경기를 선택해주세요.' }

  try {
    const now = admin.firestore.Timestamp.now()
    const dayRef = adminDb
      .collection('league_schedules')
      .doc(args.scheduleId)
      .collection('match_days')
      .doc(dateKey)

    const daySnap = await dayRef.get()
    if (!daySnap.exists) return { error: '해당 날짜의 경기를 찾을 수 없습니다.' }

    const rawMatches = Array.isArray(daySnap.data()?.matches)
      ? (daySnap.data()?.matches as Record<string, unknown>[])
      : []
    const matchIndex = rawMatches.findIndex(
      (match) => normalizeText(match.id) === args.matchId.trim()
    )

    if (matchIndex < 0) return { error: '해당 경기를 찾을 수 없습니다.' }

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
      return {
        error: `세트 스코어는 최대 ${currentMatch.format.maxGames}세트를 넘길 수 없습니다.`,
      }
    }

    const winner = deriveLeagueMatchWinner({
      homeScore,
      awayScore,
      format: currentMatch.format,
    })

    if (winner === 'PENDING') {
      return {
        error: `${currentMatch.format.maxGames}판 ${currentMatch.format.winsToClinch}선승 규칙에 맞는 최종 세트 스코어를 입력해주세요.`,
      }
    }

    const resultChanged =
      currentMatch.winner !== winner ||
      currentMatch.setLogs.length !== setLogs.length ||
      currentMatch.setLogs.some((setLog, index) => {
        const nextSetLog = setLogs[index]
        return (
          !nextSetLog ||
          setLog.winner !== nextSetLog.winner ||
          setLog.note !== nextSetLog.note
        )
      }) ||
      currentMatch.homeScore !== homeScore ||
      currentMatch.awayScore !== awayScore ||
      currentMatch.isCompleted !== true ||
      currentMatch.note !== nextNote

    if (currentMatch.isCompleted && resultChanged) {
      const { error } = verifyTimelineAdminCode(args.adminCode)
      if (error) return { error }
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

    await dayRef.update({
      matches: rawMatches,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    })

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}

export async function deleteLeagueSchedule(
  scheduleId: string
): Promise<{ error?: string }> {
  if (!scheduleId.trim()) return { error: '일정을 선택해주세요.' }

  try {
    const scheduleRef = adminDb.collection('league_schedules').doc(scheduleId.trim())
    await adminDb.recursiveDelete(scheduleRef)
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}

export async function completeLeagueSchedule(args: {
  scheduleId: string
  championTeamName: string
}): Promise<{ error?: string }> {
  const scheduleId = args.scheduleId.trim()
  const championTeamName = normalizeText(args.championTeamName)

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
    const hallOfFameRef = adminDb.collection('hall_of_fame')
    const existingHallOfFame = await hallOfFameRef
      .where('archive_id', '==', hallOfFameArchiveId)
      .limit(1)
      .get()

    if (existingHallOfFame.empty) {
      await hallOfFameRef.add({
        archive_id: hallOfFameArchiveId,
        room_id: `schedule:${scheduleId}`,
        season_name: schedule.name,
        winning_team_name: championTeam.name,
        winning_team_leader: championTeam.leaderName,
        winning_team_players: championTeam.players.map((player) => ({
          name: player.name,
          sold_price: player.soldPrice,
        })),
        won_at: wonAt,
        registered_at: admin.firestore.FieldValue.serverTimestamp(),
      })
    }

    await scheduleRef.update({
      status: 'COMPLETED',
      champion_team_name: championTeam.name,
      completed_at: admin.firestore.FieldValue.serverTimestamp(),
      archived_at: admin.firestore.FieldValue.serverTimestamp(),
    })

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}
