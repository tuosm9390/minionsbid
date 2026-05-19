'use server'

import { adminDb } from '@/lib/firebaseAdmin'
import * as admin from 'firebase-admin'
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
    result_snapshot: Array.isArray(data.result_snapshot) ? data.result_snapshot : [],
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
    const [excludedArchiveIds, snapshot] = await Promise.all([
      getHallOfFameArchiveIdSet(),
      adminDb.collection('auction_archives').orderBy('closed_at', 'desc').limit(20).get(),
    ])

    return snapshot.docs
      .filter((doc) => !excludedArchiveIds.has(doc.id))
      .map(mapAuctionArchive)
  } catch {
    return []
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
        registered_at: admin.firestore.FieldValue.serverTimestamp(),
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
