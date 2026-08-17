import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import { fetchDeeplolMatch, fetchMemberMatchIds } from './deeplolClient'
import type {
  DeeplolMatch,
  DeeplolTeamAggregate,
  DeeplolSyncConfig,
  DeeplolSyncResult,
} from './types'
import {
  validateMatchTeamComposition,
  validateTeamRosterMemberships,
  type NormalizedTeamMembership,
} from './teamMappingValidation'

export function normalizeTournamentName(value: string | null | undefined) {
  return (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
}

export function matchesTournamentKeyword(actual: string | null | undefined, keyword: string | null | undefined) {
  const normalizedActual = normalizeTournamentName(actual)
  const normalizedKeyword = normalizeTournamentName(keyword)
  return normalizedKeyword.length > 0 && normalizedActual === normalizedKeyword
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: unknown }).toDate
    if (typeof toDate === 'function') return toDate()
  }
  return null
}

function endOfDay(date: Date | null) {
  if (!date) return null
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

function isInScheduleRange(createdAt: string | null, startsAt: unknown, endsAt: unknown) {
  const created = toDate(createdAt)
  const start = toDate(startsAt)
  const end = endOfDay(toDate(endsAt))
  if (!created || !start) return false
  if (created.getTime() < start.getTime()) return false
  if (end && created.getTime() > end.getTime()) return false
  return true
}

async function loadTeamMembership(scheduleId: string) {
  const snapshot = await adminDb
    .collection('league_schedules')
    .doc(scheduleId)
    .collection('deeplol_participants')
    .where('status', '==', 'ACTIVE')
    .get()
  const inputs = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      puuId: String(data.puu_id ?? data.puuId ?? doc.id).trim(),
      teamId: String(data.team_id ?? '').trim() || null,
      teamName: String(data.team_name ?? '').trim(),
    }
  })
  const validation = validateTeamRosterMemberships(inputs)
  if (!validation.valid) throw new Error(`팀 로스터/PUUID 매핑 검증 실패: ${validation.errors.join(' ')}`)
  return { byPuuId: validation.memberships, counts: validation.teamCounts }
}

function teamKey(team: NormalizedTeamMembership) {
  return team.teamKey
}

function groupMatchParticipantsByTeam(
  participants: DeeplolMatch['participants'],
  membership: Map<string, NormalizedTeamMembership>,
) {
  const groups = new Map<string, { membership: NormalizedTeamMembership; participants: DeeplolMatch['participants'] }>()
  for (const participant of participants) {
    if (!participant.puuId) continue
    const member = membership.get(participant.puuId)
    if (!member) continue
    const key = teamKey(member)
    const group = groups.get(key) ?? { membership: member, participants: [] }
    group.participants.push(participant)
    groups.set(key, group)
  }
  return groups
}

function toTeamAggregate(
  group: { membership: NormalizedTeamMembership; participants: DeeplolMatch['participants'] },
  updatedAt: string,
): DeeplolTeamAggregate {
  const players = group.participants
  const wins = players.filter((participant) => participant.win === true).length
  const kills = players.reduce((sum, participant) => sum + participant.kills, 0)
  const deaths = players.reduce((sum, participant) => sum + participant.deaths, 0)
  const assists = players.reduce((sum, participant) => sum + participant.assists, 0)
  return {
    teamKey: teamKey(group.membership),
    teamId: group.membership.teamId,
    teamName: group.membership.teamName,
    rosterSize: players.length,
    matches: 1,
    wins: wins >= Math.ceil(players.length / 2) ? 1 : 0,
    losses: wins >= Math.ceil(players.length / 2) ? 0 : 1,
    kills,
    deaths,
    assists,
    kda: deaths > 0 ? (kills + assists) / deaths : kills + assists,
    updatedAt,
  }
}

function mergeTeamAggregate(current: DeeplolTeamAggregate, next: DeeplolTeamAggregate): DeeplolTeamAggregate {
  const matches = current.matches + next.matches
  const wins = current.wins + next.wins
  const losses = current.losses + next.losses
  const kills = current.kills + next.kills
  const deaths = current.deaths + next.deaths
  const assists = current.assists + next.assists
  return {
    ...current,
    matches,
    wins,
    losses,
    kills,
    deaths,
    assists,
    kda: deaths > 0 ? (kills + assists) / deaths : kills + assists,
    updatedAt: next.updatedAt,
  }
}

export async function syncLeagueDeeplolSchedule(
  scheduleId: string,
  overrideConfig?: Partial<DeeplolSyncConfig>,
): Promise<DeeplolSyncResult> {
  const scheduleRef = adminDb.collection('league_schedules').doc(scheduleId)
  const scheduleSnapshot = await scheduleRef.get()
  if (!scheduleSnapshot.exists) throw new Error('리그 일정을 찾을 수 없습니다.')
  const schedule = scheduleSnapshot.data() ?? {}
  const config: DeeplolSyncConfig = {
    tournamentName: String(overrideConfig?.tournamentName ?? schedule.deeplol_tournament_name ?? '').trim(),
    memberPuuIds: overrideConfig?.memberPuuIds ?? (Array.isArray(schedule.deeplol_member_puu_ids) ? schedule.deeplol_member_puu_ids.map(String) : []),
    platformId: String(overrideConfig?.platformId ?? schedule.deeplol_platform_id ?? 'KR').trim().toUpperCase(),
    pageSize: Math.min(Math.max(Number(overrideConfig?.pageSize ?? schedule.deeplol_page_size ?? 20) || 20, 1), 100),
    timezone: String(overrideConfig?.timezone ?? schedule.deeplol_timezone ?? 'Asia/Seoul'),
    maxAttempts: Math.min(Math.max(Number(overrideConfig?.maxAttempts ?? schedule.deeplol_max_attempts ?? 3) || 3, 1), 5),
    lockLeaseSeconds: Math.min(Math.max(Number(overrideConfig?.lockLeaseSeconds ?? schedule.deeplol_lock_lease_seconds ?? 120) || 120, 30), 900),
  }
  if (!config.tournamentName) throw new Error('Deeplol tournamentName 설정이 필요합니다.')
  if (config.memberPuuIds.length === 0) throw new Error('Deeplol memberPuuIds 설정이 필요합니다.')

  const lockRef = scheduleRef.collection('deeplol_sync_runs').doc('_active')
  const lockToken = crypto.randomUUID()
  const now = Date.now()
  await adminDb.runTransaction(async (transaction) => {
    const lockSnapshot = await transaction.get(lockRef)
    const lockData = lockSnapshot.data() ?? {}
    const leaseUntil = typeof lockData.lease_until_ms === 'number' ? lockData.lease_until_ms : 0
    if (lockData.status === 'RUNNING' && leaseUntil > now) {
      throw new Error('이 리그의 Deeplol 동기화가 이미 실행 중입니다.')
    }
    transaction.set(lockRef, {
      status: 'RUNNING',
      lock_token: lockToken,
      lease_until_ms: now + config.lockLeaseSeconds * 1000,
      started_at: FieldValue.serverTimestamp(),
    }, { merge: true })
  })

  const syncRef = scheduleRef.collection('deeplol_sync_runs').doc()
  const startedAt = new Date()
  await syncRef.set({
    status: 'RUNNING',
    tournament_name: config.tournamentName,
    started_at: Timestamp.fromDate(startedAt),
    created_at: FieldValue.serverTimestamp(),
  })

  const result: DeeplolSyncResult = {
    scheduleId,
    tournamentName: config.tournamentName,
    discoveredMatchIds: 0,
    importedMatches: 0,
    duplicateMatches: 0,
    skippedMatches: 0,
    importedTeams: 0,
    teamStats: [],
    retriedRequests: 0,
    failedMatchIds: [],
    errors: [],
  }

  try {
    const matchIds = new Set<string>()
    for (const puuId of config.memberPuuIds) {
      const memberMatchIds = await fetchMemberMatchIds(
        puuId,
        config.platformId,
        config.pageSize,
        config.maxAttempts,
        () => { result.retriedRequests += 1 },
      )
      for (const matchId of memberMatchIds) matchIds.add(matchId)
    }
    result.discoveredMatchIds = matchIds.size

    const membership = await loadTeamMembership(scheduleId)
    if (membership.byPuuId.size === 0) throw new Error('활성 Deeplol 참가자와 팀 매핑이 필요합니다.')
    for (const [key, count] of membership.counts) {
      if (count < 5 || count > 6) throw new Error(`팀 ${key}의 등록 인원은 5명 또는 6명이어야 합니다.`)
    }
    const aggregates = new Map<string, DeeplolTeamAggregate>()
    const matchesCollection = scheduleRef.collection('deeplol_matches')

    for (const matchId of matchIds) {
      try {
        const match = await fetchDeeplolMatch(
          matchId,
          config.platformId,
          config.maxAttempts,
          () => { result.retriedRequests += 1 },
        )
        const matchRef = matchesCollection.doc(match.matchId)
        const existing = await matchRef.get()
        if (existing.exists && existing.data()?.import_status === 'IMPORTED') {
          result.duplicateMatches += 1
          continue
        }
        if (!matchesTournamentKeyword(match.tournamentName, config.tournamentName)) {
          result.skippedMatches += 1
          await matchRef.set({
            external_match_id: match.matchId,
            tournament_name: match.tournamentName,
            import_status: 'SKIPPED_TOURNAMENT',
            checked_at: FieldValue.serverTimestamp(),
          }, { merge: true })
          continue
        }
        if (!isInScheduleRange(match.createdAt, schedule.starts_at, schedule.ends_at)) {
          result.skippedMatches += 1
          await matchRef.set({
            external_match_id: match.matchId,
            tournament_name: match.tournamentName,
            created_at_external: match.createdAt,
            import_status: 'SKIPPED_OUT_OF_RANGE',
            checked_at: FieldValue.serverTimestamp(),
          }, { merge: true })
          continue
        }

        const matchValidation = validateMatchTeamComposition(match.participants, membership.byPuuId)
        const teamGroups = groupMatchParticipantsByTeam(match.participants, membership.byPuuId)
        const validTeamGroups = Array.from(teamGroups.values()).filter((group) => group.participants.length === 5)
        if (!matchValidation.valid || teamGroups.size !== 2 || validTeamGroups.length !== 2) {
          result.skippedMatches += 1
          await matchRef.set({
            external_match_id: match.matchId,
            tournament_name: match.tournamentName,
            import_status: 'PENDING_REVIEW',
            review_reason: 'INCOMPLETE_TEAM_MAPPING',
            mapped_team_count: teamGroups.size,
            mapped_participant_count: Array.from(teamGroups.values()).reduce((sum, group) => sum + group.participants.length, 0),
            checked_at: FieldValue.serverTimestamp(),
          }, { merge: true })
          continue
        }

        await matchRef.set({
          external_match_id: match.matchId,
          tournament_name: match.tournamentName,
          platform_id: match.platformId,
          created_at_external: match.createdAt,
          duration_seconds: match.durationSeconds,
          queue_id: match.queueId,
          participants: match.participants,
          import_status: 'IMPORTED',
          imported_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        }, { merge: true })

        for (const group of validTeamGroups) {
          const aggregate = toTeamAggregate(group, new Date().toISOString())
          const current = aggregates.get(aggregate.teamKey)
          aggregates.set(aggregate.teamKey, current ? mergeTeamAggregate(current, aggregate) : aggregate)
        }
        result.importedMatches += 1
      } catch (error) {
        result.failedMatchIds.push(matchId)
        result.errors.push(`${matchId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // 멱등성을 보장하기 위해 현재 실행분이 아니라 등록된 전체 원본 경기에서 팀 단위로 재계산한다.
    aggregates.clear()
    const importedSnapshot = await matchesCollection.where('import_status', '==', 'IMPORTED').get()
    for (const matchDoc of importedSnapshot.docs) {
      const data = matchDoc.data()
      const participants = Array.isArray(data.participants) ? data.participants : []
      const groups = groupMatchParticipantsByTeam(participants, membership.byPuuId)
      const validGroups = Array.from(groups.values()).filter((group) => group.participants.length === 5)
      if (groups.size !== 2 || validGroups.length !== 2) continue
      for (const group of validGroups) {
        const aggregate = toTeamAggregate(group, new Date().toISOString())
        const current = aggregates.get(aggregate.teamKey)
        aggregates.set(aggregate.teamKey, current ? mergeTeamAggregate(current, aggregate) : aggregate)
      }
    }

    const statsCollection = scheduleRef.collection('deeplol_team_stats')
    for (const aggregate of aggregates.values()) {
      await statsCollection.doc(encodeURIComponent(aggregate.teamKey)).set({
        ...aggregate,
        win_rate: aggregate.matches > 0 ? Math.round((aggregate.wins / aggregate.matches) * 1000) / 10 : 0,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true })
      result.importedTeams += 1
      result.teamStats.push({ ...aggregate, win_rate: aggregate.matches > 0 ? Math.round((aggregate.wins / aggregate.matches) * 1000) / 10 : 0 })
    }

    await syncRef.set({
      status: result.errors.length ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      finished_at: FieldValue.serverTimestamp(),
      ...result,
    }, { merge: true })
    return result
  } catch (error) {
    await syncRef.set({
      status: 'ERROR',
      finished_at: FieldValue.serverTimestamp(),
      error: error instanceof Error ? error.message : String(error),
      ...result,
    }, { merge: true })
    throw error
  } finally {
    await lockRef.set({
      status: 'IDLE',
      lock_token: null,
      lease_until_ms: 0,
      released_at: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => undefined)
  }
}

export async function listLeagueDeeplolStats(scheduleId: string) {
  const snapshot = await adminDb
    .collection('league_schedules')
    .doc(scheduleId)
    .collection('deeplol_team_stats')
    .get()
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}
