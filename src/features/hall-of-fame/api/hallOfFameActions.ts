'use server'

import { adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import type {
  HallOfFameEntry,
  HallOfFameRegistrationPayload,
  AuctionArchiveForHof,
} from '../types'

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

async function hasHallOfFameEntryForArchive(archiveId: string): Promise<boolean> {
  const snapshot = await adminDb
    .collection('hall_of_fame')
    .where('archive_id', '==', archiveId)
    .limit(1)
    .get()

  return !snapshot.empty
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function toIsoString(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate().toISOString()
  }
  return ''
}

function toSerializable(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  if (Array.isArray(value)) return value.map(toSerializable)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => [key, toSerializable(entry)])
        .filter(([, entry]) => entry !== undefined),
    )
  }
  return undefined
}

function normalizeHofPlayers(players: unknown): { name: string; sold_price: number | null }[] {
  if (!Array.isArray(players)) return []
  return players
    .map((player) => {
      const data = typeof player === 'object' && player !== null ? player : {}
      return {
        name: normalizeText((data as Record<string, unknown>).name),
        sold_price:
          typeof (data as Record<string, unknown>).sold_price === 'number'
            ? ((data as Record<string, unknown>).sold_price as number)
            : null,
      }
    })
    .filter((player) => player.name)
}

function mapAuctionArchive(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): AuctionArchiveForHof {
  const data = doc.data()
  return {
    id: doc.id,
    room_id: normalizeText(data.room_id),
    room_name: normalizeText(data.room_name),
    closed_at: toIsoString(data.closed_at),
    team_assignment:
      typeof data.team_assignment === 'object' && data.team_assignment !== null
        ? (toSerializable(data.team_assignment) as AuctionArchiveForHof['team_assignment'])
        : null,
    result_snapshot: Array.isArray(data.result_snapshot)
      ? (toSerializable(data.result_snapshot) as AuctionArchiveForHof['result_snapshot'])
      : [],
  }
}

function verifyAdminCode(code: string): { error?: string } {
  const adminCode = process.env.HALL_OF_FAME_ADMIN_CODE
  if (!adminCode || code !== adminCode) {
    return { error: '관리자 코드가 올바르지 않습니다.' }
  }
  return {}
}

export async function getHallOfFameEntries(): Promise<HallOfFameEntry[]> {
  try {
    const snapshot = await adminDb
      .collection('hall_of_fame')
      .orderBy('registered_at', 'desc')
      .get()

    return snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        archive_id: data.archive_id,
        room_id: data.room_id,
        season_name: data.season_name,
        season_label:
          typeof data.season_label === 'string' && data.season_label.trim().length > 0
            ? data.season_label
            : null,
        winning_team_name: data.winning_team_name,
        winning_team_leader: data.winning_team_leader,
        winning_team_players: data.winning_team_players ?? [],
        won_at: data.won_at,
        registered_at:
          data.registered_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      }
    })
  } catch {
    return []
  }
}

export async function getAuctionArchivesForHof(): Promise<AuctionArchiveForHof[]> {
  try {
    const [excludedArchiveIds, snapshot] = await Promise.all([
      getHallOfFameArchiveIdSet(),
      adminDb.collection('auction_archives').orderBy('closed_at', 'desc').limit(50).get(),
    ])

    return snapshot.docs
      .filter((doc) => !excludedArchiveIds.has(doc.id))
      .map(mapAuctionArchive)
  } catch {
    return []
  }
}

export async function getVisibleAuctionArchives(): Promise<AuctionArchiveForHof[]> {
  try {
    const snapshot = await adminDb
      .collection('auction_archives')
      .get()

    return snapshot.docs
      .map(mapAuctionArchive)
      .sort((left, right) => {
        const leftTime = Date.parse(left.closed_at) || 0
        const rightTime = Date.parse(right.closed_at) || 0
        return rightTime - leftTime
      })
      .slice(0, 20)
  } catch (error) {
    console.error('[hall-of-fame] getVisibleAuctionArchives failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export async function updateAuctionArchiveTeamAssignment(
  archiveId: string,
  adminCode: string,
  assignments: Array<{
    auctionTeamId: string
    assignedTeamId: number | null
    status: 'CONFIRMED' | 'DEFERRED'
  }>,
): Promise<{ error?: string }> {
  const { error } = verifyAdminCode(adminCode)
  if (error) return { error }
  if (!normalizeText(archiveId) || assignments.length === 0) {
    return { error: '수정할 아카이브 팀 배정이 없습니다.' }
  }

  const assignedTeamIds = new Set<number>()
  for (const assignment of assignments) {
    if (!normalizeText(assignment.auctionTeamId)) {
      return { error: '팀 배정 식별자가 올바르지 않습니다.' }
    }
    if (assignment.status === 'DEFERRED') {
      if (assignment.assignedTeamId !== null) {
        return { error: '추후 배정 예정 팀은 실제 팀을 지정할 수 없습니다.' }
      }
      continue
    }
    if (assignment.assignedTeamId === null) {
      return { error: '모든 팀을 배정하거나 추후 배정 예정으로 지정해주세요.' }
    }
    if (assignedTeamIds.has(assignment.assignedTeamId)) {
      return { error: '하나의 실제 팀은 한 경매 팀에만 배정할 수 있습니다.' }
    }
    assignedTeamIds.add(assignment.assignedTeamId)
  }

  try {
    const archiveRef = adminDb.collection('auction_archives').doc(archiveId)
    const archiveSnapshot = await archiveRef.get()
    if (!archiveSnapshot.exists) return { error: '아카이브를 찾을 수 없습니다.' }
    const resultSnapshot = Array.isArray(archiveSnapshot.data()?.result_snapshot)
      ? archiveSnapshot.data()?.result_snapshot
      : []
    const teamIds = new Set(
      resultSnapshot
        .map((team: unknown) => (typeof team === 'object' && team !== null ? normalizeText((team as Record<string, unknown>).id) : ''))
        .filter(Boolean),
    )
    if (teamIds.size !== assignments.length || assignments.some((assignment) => !teamIds.has(assignment.auctionTeamId))) {
      return { error: '아카이브의 모든 팀을 정확히 한 번씩 배정해주세요.' }
    }
    await archiveRef.update({
      team_assignment: {
        status: 'CONFIRMED',
        updated_at: FieldValue.serverTimestamp(),
        assignments: assignments.map((assignment) => ({
          auction_team_id: assignment.auctionTeamId,
          assigned_team_id: assignment.assignedTeamId,
          status: assignment.status,
        })),
      },
    })
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : '아카이브 팀 배정 수정에 실패했습니다.' }
  }
}

export async function registerHallOfFameEntry(
  payload: HallOfFameRegistrationPayload,
  adminCode: string
): Promise<{ error?: string }> {
  const { error } = verifyAdminCode(adminCode)
  if (error) return { error }

  const archiveId = normalizeText(payload.archiveId)
  const teamId = normalizeText(payload.teamId)
  const teamName = normalizeText(payload.teamName)
  const seasonName = normalizeText(payload.seasonName)
  const seasonLabel = normalizeText(payload.seasonLabel)
  if (!archiveId) return { error: '등록할 경매 기록을 선택해주세요.' }
  if (!teamId && !teamName) return { error: '우승팀을 선택해주세요.' }

  try {
    if (await hasHallOfFameEntryForArchive(archiveId)) {
      return { error: '이미 명예의 전당에 등록된 경매입니다.' }
    }

    const archiveRef = adminDb.collection('auction_archives').doc(archiveId)
    const hallOfFameRef = adminDb.collection('hall_of_fame').doc(`archive:${archiveId}`)

    await adminDb.runTransaction(async (transaction) => {
      const [archiveSnap, hallOfFameSnap] = await Promise.all([
        transaction.get(archiveRef),
        transaction.get(hallOfFameRef),
      ])

      if (hallOfFameSnap.exists) {
        throw new Error('이미 명예의 전당에 등록된 경매입니다.')
      }
      if (!archiveSnap.exists) {
        throw new Error('등록할 경매 기록을 찾을 수 없습니다.')
      }

      const archiveData = archiveSnap.data() ?? {}
      const resultSnapshot = Array.isArray(archiveData.result_snapshot)
        ? archiveData.result_snapshot
        : []
      const winningTeam = resultSnapshot.find((team) => {
        const teamData = typeof team === 'object' && team !== null ? team : {}
        const normalizedId = normalizeText((teamData as Record<string, unknown>).id)
        const normalizedName = normalizeText((teamData as Record<string, unknown>).name)
        return teamId ? normalizedId === teamId : normalizedName === teamName
      })

      if (!winningTeam || typeof winningTeam !== 'object') {
        throw new Error('우승팀 정보를 찾을 수 없습니다.')
      }

      const winningTeamData = winningTeam as Record<string, unknown>
      transaction.set(hallOfFameRef, {
        archive_id: archiveId,
        room_id: normalizeText(archiveData.room_id),
        season_name:
          seasonName ||
          normalizeText(archiveData.room_name) ||
          normalizeText(archiveData.schedule_name) ||
          '이름 없는 리그',
        season_label: seasonLabel || null,
        winning_team_name: normalizeText(winningTeamData.name),
        winning_team_leader: normalizeText(winningTeamData.leader_name),
        winning_team_players: normalizeHofPlayers(winningTeamData.players),
        won_at: toIsoString(archiveData.closed_at),
        registered_at: FieldValue.serverTimestamp(),
      })
    })
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}

export async function deleteHallOfFameEntry(
  entryId: string,
  adminCode: string
): Promise<{ error?: string }> {
  const { error } = verifyAdminCode(adminCode)
  if (error) return { error }

  try {
    await adminDb.collection('hall_of_fame').doc(entryId).delete()
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}
