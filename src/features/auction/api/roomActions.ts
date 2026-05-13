'use server'

import * as admin from 'firebase-admin'
import type { CaptainMode } from '@/features/auction/utils/roster'
import { normalizeCaptainMode } from '@/features/auction/utils/roster'
import type { AuctionMode } from '@/features/auction/utils/auctionMode'
import { normalizeAuctionMode } from '@/features/auction/utils/auctionMode'
import { getAuctionServerServices } from '@/features/auction/realtime/serverAdapter'
import {
  createE2EAuctionFixtureRoom,
  deleteFixtureRoom,
  isE2EAuctionFixtureEnabled,
} from '@/features/auction/api/e2eAuctionFixture'

// ---------- 타입 ----------

export interface CreateRoomCaptain {
  teamName: string
  name: string
  position: string
  description: string
  captainPoints: number
}

export interface CreateRoomPlayer {
  name: string
  tier: string
  mainPosition: string
  subPosition: string
  description: string
  aramTier?: string
  tftTier?: string
}

export interface CreateRoomPayload {
  name: string
  totalTeams: number
  basePoint: number
  membersPerTeam: number
  captainMode?: CaptainMode
  auctionMode?: AuctionMode
  scheduleId?: string | null
  scheduleName?: string | null
  linkedAuctionId?: string | null
  linkedLeagueName?: string | null
  captains: CreateRoomCaptain[]
  players: CreateRoomPlayer[]
}

export interface CreateRoomResult {
  error?: string
  roomId?: string
  organizerToken?: string
  viewerToken?: string
  teams?: { id: string; name: string; leader_token: string }[]
}

const ROOM_AUTH_COLLECTION = 'room_auth_secrets'
const ROOM_AUTH_TEAM_TOKENS_COLLECTION = 'team_tokens'
const LATENCY_DEBUG =
  process.env.NEXT_PUBLIC_DEBUG_LATENCY === '1' ||
  process.env.DEBUG_LATENCY === '1'

export interface ArchiveTeam {
  id: string
  name: string
  leader_name: string
  leader_position?: string
  captain_mode?: CaptainMode
  point_balance: number
  players: {
    name: string
    tier: string
    main_position: string
    sub_position: string
    sold_price: number | null
  }[]
}

export interface AuctionArchivePayload {
  roomId: string
  roomName: string
  roomCreatedAt: string
  teams: ArchiveTeam[]
}

// ---------- 방 생성 ----------

/** 방 + 팀 + 선수를 Firestore에 생성 */
export async function createRoom(payload: CreateRoomPayload): Promise<CreateRoomResult> {
  const startedAt = Date.now()
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return createE2EAuctionFixtureRoom({
        name: payload.name,
        totalTeams: payload.totalTeams,
        basePoint: payload.basePoint,
        membersPerTeam: payload.membersPerTeam,
        captainMode: normalizeCaptainMode(payload.captainMode),
        auctionMode: normalizeAuctionMode(payload.auctionMode),
        captains: payload.captains,
        players: payload.players,
      })
    }

    const { firestore } = getAuctionServerServices()
    const roomId = crypto.randomUUID()
    const organizerToken = crypto.randomUUID()
    const viewerToken = crypto.randomUUID()

    const roomRef = firestore.collection('rooms').doc(roomId)
    const roomAuthRef = firestore.collection(ROOM_AUTH_COLLECTION).doc(roomId)
    const batch = firestore.batch()

    batch.set(roomRef, {
      name: payload.name,
      schedule_id: payload.scheduleId ?? null,
      schedule_name: payload.scheduleName ?? payload.name,
      linked_auction_id: payload.linkedAuctionId ?? null,
      linked_league_name: payload.linkedLeagueName ?? null,
      total_teams: payload.captains.length,
      base_point: payload.basePoint,
      members_per_team: payload.membersPerTeam,
      captain_mode: normalizeCaptainMode(payload.captainMode),
      auction_mode: normalizeAuctionMode(payload.auctionMode),
      sealed_bid_phase: null,
      sealed_bid_round_id: null,
      sealed_bid_round_number: 0,
      sealed_bid_min_amount: 0,
      sealed_bid_eligible_team_ids: null,
      sealed_bid_reveal_order: null,
      sealed_bid_reveal_result: null,
      current_player_id: null,
      timer_ends_at: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    })

    batch.set(roomAuthRef, {
      organizer_token: organizerToken,
      viewer_token: viewerToken,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    })

    // teams 서브컬렉션 생성
    const teamsResult: { id: string; name: string; leader_token: string }[] = []
    for (const captain of payload.captains) {
      const teamRef = roomRef.collection('teams').doc()
      const leaderToken = crypto.randomUUID()
      batch.set(teamRef, {
        name: captain.teamName,
        point_balance: payload.basePoint - captain.captainPoints,
        leader_name: captain.name,
        leader_position: captain.position,
        leader_description: captain.description || '',
        captain_points: captain.captainPoints || 0,
      })
      batch.set(roomAuthRef.collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION).doc(teamRef.id), {
        leader_token: leaderToken,
        team_name: captain.teamName,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      })
      teamsResult.push({
        id: teamRef.id,
        name: captain.teamName,
        leader_token: leaderToken,
      })
    }

    // players 서브컬렉션 생성
    for (const player of payload.players) {
      const playerRef = roomRef.collection('players').doc()
      batch.set(playerRef, {
        name: player.name,
        tier: player.tier,
        main_position: player.mainPosition,
        sub_position: player.subPosition || '',
        description: player.description || '',
        aram_tier: player.aramTier || '',
        tft_tier: player.tftTier || '',
        status: 'WAITING',
        team_id: null,
        sold_price: null,
        room_id: roomId,
      })
    }

    await batch.commit()

    if (LATENCY_DEBUG) {
      console.info('[latency][server] createRoom', {
        roomId,
        totalTeams: payload.captains.length,
        playerCount: payload.players.length,
        totalMs: Date.now() - startedAt,
      })
    }

    return {
      roomId,
      organizerToken,
      viewerToken,
      teams: teamsResult,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('[room] createRoom failed', {
      roomName: payload.name,
      totalTeams: payload.captains.length,
      playerCount: payload.players.length,
      totalMs: Date.now() - startedAt,
      error: message,
    })
    return { error: message }
  }
}

// ---------- auction_archives ----------

/** 경매 결과를 auction_archives 컬렉션에 영구 저장 */
export async function saveAuctionArchive(payload: AuctionArchivePayload): Promise<{ error?: string }> {
  try {
    let roomData: Record<string, unknown> = {}
    const roomCollection = getAuctionServerServices().firestore.collection('rooms')
    const roomDocRef =
      typeof roomCollection.doc === 'function' ? roomCollection.doc(payload.roomId) : null

    if (roomDocRef && typeof roomDocRef.get === 'function') {
      const roomSnap = await roomDocRef.get()
      roomData =
        roomSnap && typeof roomSnap === 'object' && 'data' in roomSnap && typeof roomSnap.data === 'function'
          ? roomSnap.data() ?? {}
          : {}
    }

    await getAuctionServerServices().firestore.collection('auction_archives').add({
      room_id: payload.roomId,
      room_name: payload.roomName,
      schedule_id: roomData.schedule_id ?? null,
      schedule_name: roomData.schedule_name ?? payload.roomName,
      linked_auction_id: roomData.linked_auction_id ?? null,
      linked_league_name: roomData.linked_league_name ?? null,
      room_created_at: payload.roomCreatedAt,
      closed_at: admin.firestore.FieldValue.serverTimestamp(),
      result_snapshot: payload.teams,
    })
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}

// ---------- 팀 이름 수정 ----------

/** 팀 이름 변경 */
export async function updateTeamName(
  roomId: string,
  teamId: string,
  newName: string
): Promise<{ error?: string }> {
  const trimmed = newName.trim()
  if (!trimmed) return { error: '팀 이름을 입력해주세요.' }
  if (trimmed.length > 20) return { error: '팀 이름은 20자 이하여야 합니다.' }

  try {
    await getAuctionServerServices().firestore
      .collection('rooms')
      .doc(roomId)
      .collection('teams')
      .doc(teamId)
      .update({ name: trimmed })
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}

// ---------- 방 삭제 ----------

/** 방 종료 — 토큰 무효화 후 재귀 삭제 */
export async function deleteRoom(roomId: string): Promise<{ error?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return deleteFixtureRoom(roomId)
    }
    const { firestore } = getAuctionServerServices()
    const roomRef = firestore.collection('rooms').doc(roomId)
    const roomSnap = await roomRef.get()
    const currentName = roomSnap.data()?.name || '경매방'

    // 토큰 무효화 + roomDeleted 플래그 (클라이언트가 onSnapshot으로 감지)
    await roomRef.update({
      name: `[종료된 경매] ${currentName}`,
      roomDeleted: true,
    })

    const roomAuthRef = firestore.collection(ROOM_AUTH_COLLECTION).doc(roomId)

    // 서브컬렉션 포함 재귀 삭제
    await firestore.recursiveDelete(roomRef)
    await firestore.recursiveDelete(roomAuthRef)

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}
