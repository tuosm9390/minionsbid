'use server'

import { adminDb } from '@/lib/firebaseAdmin'
import * as admin from 'firebase-admin'
import type {
  HallOfFameEntry,
  HallOfFameRegistrationPayload,
  AuctionArchiveForHof,
} from '../types'

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

function mapAuctionArchive(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): AuctionArchiveForHof {
  const data = doc.data()
  return {
    id: doc.id,
    room_id: data.room_id,
    room_name: data.room_name,
    closed_at:
      data.closed_at?.toDate?.()?.toISOString() ?? data.closed_at ?? '',
    result_snapshot: data.result_snapshot ?? [],
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

  try {
    await adminDb.collection('hall_of_fame').add({
      archive_id: payload.archive_id,
      room_id: payload.room_id,
      season_name: payload.season_name,
      season_label: payload.season_label ?? null,
      winning_team_name: payload.winning_team_name,
      winning_team_leader: payload.winning_team_leader,
      winning_team_players: payload.winning_team_players,
      won_at: payload.won_at,
      registered_at: admin.firestore.FieldValue.serverTimestamp(),
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
