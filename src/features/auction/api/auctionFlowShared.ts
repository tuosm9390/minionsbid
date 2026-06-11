// 경매 흐름 서버 액션들이 공유하는 헬퍼·타입·내부 로직 모음 (서버 전용 모듈)
import {
  Timestamp,
  FieldValue,
  type DocumentData,
  type DocumentReference,
} from "firebase-admin/firestore";
import { normalizeAuctionMode } from "@/features/auction/utils/auctionMode";
import type { AuctionEventEnvelope } from "@/features/auction/utils/auctionRealtime";
import type {
  SealedBidRevealCard,
  SealedBidState,
} from "@/features/auction/store/useAuctionStore";
import { getAuctionServerServices } from "@/features/auction/realtime/serverAdapter";
import { AUCTION_DURATION_MS } from "@/features/auction/constants/auctionTimings";

// ---------- 상수 ----------

export const LATENCY_DEBUG =
  process.env.NEXT_PUBLIC_DEBUG_LATENCY === "1" ||
  process.env.DEBUG_LATENCY === "1";

export function nowMs(): number {
  return Date.now();
}

export function logLatency(label: string, data: Record<string, unknown>) {
  if (!LATENCY_DEBUG) return;
  console.info(`[latency][server] ${label}`, data);
}

export function getAuctionFirestore() {
  return getAuctionServerServices().firestore;
}

export type AuctionRoomState = {
  auction_mode?: string | null;
  current_player_id?: string | null;
  timer_ends_at?: Timestamp | null;
  next_auction_duration_ms?: number | null;
  active_bid?: {
    event_id?: string;
    player_id: string;
    team_id: string;
    amount: number;
    created_at: string;
  } | null;
  paused_remaining_ms?: number | null;
  auction_revision?: number;
  last_auction_event?: AuctionEventEnvelope | null;
  members_per_team?: number;
  captain_mode?: string;
  sealed_bid_phase?: SealedBidState["phase"];
  sealed_bid_round_id?: string | null;
  sealed_bid_round_number?: number;
  sealed_bid_min_amount?: number;
  sealed_bid_eligible_team_ids?: string[] | null;
  sealed_bid_reveal_order?: string[] | null;
  sealed_bid_reveal_result?: SealedBidRevealCard[] | null;
  sealed_bid_highest_amount?: number;
  sealed_bid_tied_team_ids?: string[] | null;
};

export type SealedBidRoundOptions = {
  minAmount?: number;
  eligibleTeamIds?: string[] | null;
  durationMs?: number;
};

export type PresenceRecord = {
  role?: string | null;
};

export function getNextRosterSlotsUsed(teamData: DocumentData): number {
  return Math.max(0, Number(teamData.roster_slots_used ?? 0)) + 1;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- 내부 헬퍼 ----------

export async function sysMsg(
  roomId: string,
  content: string,
  eventId?: string,
): Promise<void> {
  const createdAt = new Date().toISOString();
  const { rtdb } = getAuctionServerServices();
  const messageId =
    eventId ?? `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const messageRef = getAuctionFirestore()
    .collection("rooms")
    .doc(roomId)
    .collection("messages")
    .doc(messageId);

  await Promise.all([
    messageRef.set(
      {
        event_id: messageId,
        sender_name: "시스템",
        sender_role: "SYSTEM",
        content,
        created_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
    rtdb.ref(`signals/${roomId}/latestMessage`).set({
      id: messageId,
      event_id: messageId,
      room_id: roomId,
      sender_name: "시스템",
      sender_role: "SYSTEM",
      content,
      created_at: createdAt,
      at: Date.now(),
    }),
  ]);
}

export async function publishAuctionEvent(event: AuctionEventEnvelope): Promise<void> {
  const { rtdb } = getAuctionServerServices();
  await rtdb.ref(`signals/${event.roomId}/auctionEvent`).set(event);
  // 히스토리는 타이머 갱신 경로 밖에서 처리 — 응답 지연에 영향 없음
  rtdb.ref(`signals/${event.roomId}/auctionEvents/${event.eventId}`).set(event).catch(() => {});
}

export function createEventId(type: AuctionEventEnvelope["type"]): string {
  return `${type.toLowerCase()}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function createAuctionEvent(
  roomId: string,
  type: AuctionEventEnvelope["type"],
  revision: number,
  overrides: Partial<AuctionEventEnvelope> = {},
): AuctionEventEnvelope {
  return {
    eventId: createEventId(type),
    revision,
    roomId,
    type,
    serverCreatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createAuctionEventPatch(
  roomRef: DocumentReference,
  roomData: AuctionRoomState,
  type: AuctionEventEnvelope["type"],
  overrides: Partial<AuctionEventEnvelope> = {},
) {
  const revision = (roomData.auction_revision ?? 0) + 1;
  const event = createAuctionEvent(roomRef.id, type, revision, overrides);

  return {
    event,
    revision,
    roomPatch: {
      auction_revision: revision,
      last_auction_event: event,
    },
  };
}

export function getPresenceRole(sessionId: string, record: PresenceRecord): string | null {
  if (record.role === "ORGANIZER" || record.role === "LEADER") {
    return record.role;
  }

  const parts = sessionId.split(":");
  const roleFromSessionId = parts.length >= 4 ? parts[2] : null;
  return roleFromSessionId === "ORGANIZER" || roleFromSessionId === "LEADER"
    ? roleFromSessionId
    : null;
}

export function toTimestamp(value: Timestamp | null | undefined) {
  return value ? value.toDate().toISOString() : null;
}

export function queueSystemMessage(roomId: string, content: string, eventId: string) {
  void sysMsg(roomId, content, `${eventId}:system`).catch((error) => {
    console.error("[auction] async sysMsg failed", {
      roomId,
      eventId,
      error,
    });
  });
}

/**
 * 경매 이벤트 히스토리에서 지정된 revision보다 오래된 항목을 삭제한다. (fire-and-forget)
 * PLAYER_AWARDED / SEALED_BID_AWARDED 이벤트 발행 후에만 호출한다.
 */
export function pruneAuctionEventHistory(roomId: string, currentRevision: number) {
  const { rtdb } = getAuctionServerServices();
  rtdb
    .ref(`signals/${roomId}/auctionEvents`)
    .orderByChild("revision")
    .endBefore(currentRevision)
    .get()
    .then((snap) => {
      if (!snap.exists()) return;
      const updates: Record<string, null> = {};
      snap.forEach((child) => {
        updates[child.key!] = null;
      });
      return rtdb.ref(`signals/${roomId}/auctionEvents`).update(updates);
    })
    .catch(() => {});
}

export function getSealedBidPatch(roomData: AuctionRoomState): SealedBidState {
  return {
    phase: roomData.sealed_bid_phase ?? null,
    roundId: roomData.sealed_bid_round_id ?? null,
    roundNumber: roomData.sealed_bid_round_number ?? 0,
    minAmount: roomData.sealed_bid_min_amount ?? 0,
    eligibleTeamIds: roomData.sealed_bid_eligible_team_ids ?? null,
    revealOrder: roomData.sealed_bid_reveal_order ?? [],
    revealResult: roomData.sealed_bid_reveal_result ?? [],
    highestAmount: roomData.sealed_bid_highest_amount ?? 0,
    tiedTeamIds: roomData.sealed_bid_tied_team_ids ?? [],
  };
}

export async function startSealedBidRound(
  roomId: string,
  options: SealedBidRoundOptions = {},
): Promise<{ error?: string; timerEndsAt?: string }> {
  const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
  let startEvent: AuctionEventEnvelope | null = null;
  let resolvedTimerEndsAt: string | undefined;
  const durationMs = options.durationMs ?? AUCTION_DURATION_MS;

  await getAuctionFirestore().runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new Error("방을 찾을 수 없습니다.");

    const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
    const currentPlayerId = roomData.current_player_id ?? null;
    if (!currentPlayerId) {
      throw new Error("현재 경매 중인 선수가 없습니다.");
    }

    const roundId = crypto.randomUUID();
    const timerEndsAt = new Date(Date.now() + durationMs);
    resolvedTimerEndsAt = timerEndsAt.toISOString();
    const nextRoundNumber = (roomData.sealed_bid_round_number ?? 0) + 1;
    const minAmount = Math.max(0, options.minAmount ?? 0);
    const eligibleTeamIds = options.eligibleTeamIds ?? null;
    const eventType = eligibleTeamIds
      ? "SEALED_BID_REBID_STARTED"
      : "SEALED_BID_STARTED";
    const nextSealedBid: SealedBidState = {
      phase: "ACTIVE",
      roundId,
      roundNumber: nextRoundNumber,
      minAmount,
      eligibleTeamIds,
      revealOrder: [],
      revealResult: [],
      highestAmount: 0,
      tiedTeamIds: [],
    };
    const { event, roomPatch } = createAuctionEventPatch(
      roomRef,
      roomData,
      eventType,
      {
        currentPlayerId,
        timerEndsAt: resolvedTimerEndsAt,
        timerDurationMs: durationMs,
        liveBid: null,
        sealedBid: nextSealedBid,
      },
    );
    tx.set(roomRef.collection("sealed_bid_rounds").doc(roundId), {
      player_id: currentPlayerId,
      round_number: nextRoundNumber,
      min_amount: minAmount,
      eligible_team_ids: eligibleTeamIds,
      created_at: FieldValue.serverTimestamp(),
    });
    tx.update(roomRef, {
      timer_ends_at: Timestamp.fromDate(timerEndsAt),
      active_bid: null,
      sealed_bid_phase: "ACTIVE",
      sealed_bid_round_id: roundId,
      sealed_bid_round_number: nextRoundNumber,
      sealed_bid_min_amount: minAmount,
      sealed_bid_eligible_team_ids: eligibleTeamIds,
      sealed_bid_reveal_order: null,
      sealed_bid_reveal_result: null,
      sealed_bid_highest_amount: 0,
      sealed_bid_tied_team_ids: null,
      ...roomPatch,
    });
    startEvent = event;
  });

  if (startEvent) {
    const event = startEvent as AuctionEventEnvelope;
    await publishAuctionEvent(event);
    queueSystemMessage(
      roomId,
      event.type === "SEALED_BID_REBID_STARTED"
        ? "🔒 최고 동점 팀 재입찰이 시작되었습니다."
        : "🔒 비공개 입찰이 시작되었습니다.",
      event.eventId,
    );
  }

  return { timerEndsAt: resolvedTimerEndsAt };
}

export async function lockSealedBidRoundInternal(
  roomId: string,
): Promise<{ error?: string; locked?: boolean }> {
  try {
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    let lockEvent: AuctionEventEnvelope | null = null;

    await getAuctionFirestore().runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists) throw new Error("방을 찾을 수 없습니다.");

      const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
      if (normalizeAuctionMode(roomData.auction_mode) !== "SEALED_BID") return;
      if (roomData.sealed_bid_phase !== "ACTIVE") return;
      const timerEndsAt = roomData.timer_ends_at ?? null;
      if (timerEndsAt && timerEndsAt.toMillis() > Date.now()) return;

      const nextSealedBid: SealedBidState = {
        ...getSealedBidPatch(roomData),
        phase: "LOCKED",
      };
      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        roomData,
        "SEALED_BID_LOCKED",
        {
          currentPlayerId: roomData.current_player_id ?? null,
          timerEndsAt: null,
          liveBid: null,
          sealedBid: nextSealedBid,
        },
      );
      tx.update(roomRef, {
        timer_ends_at: null,
        sealed_bid_phase: "LOCKED",
        ...roomPatch,
      });
      lockEvent = event;
    });

    if (!lockEvent) return { locked: false };

    const event = lockEvent as AuctionEventEnvelope;
    await publishAuctionEvent(event);
    queueSystemMessage(
      roomId,
      "🔒 비공개 입찰이 마감되었습니다.",
      event.eventId,
    );
    return { locked: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

