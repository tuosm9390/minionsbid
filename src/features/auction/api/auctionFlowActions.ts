"use server";

import * as admin from "firebase-admin";
import {
  getAuctionSlotsPerTeam,
  normalizeCaptainMode,
} from "@/features/auction/utils/roster";
import { normalizeAuctionMode } from "@/features/auction/utils/auctionMode";
import {
  getAuctionBidEligibility,
  type AuctionEventEnvelope,
} from "@/features/auction/utils/auctionRealtime";
import type {
  SealedBidRevealCard,
  SealedBidState,
} from "@/features/auction/store/useAuctionStore";
import { getAuctionServerServices } from "@/features/auction/realtime/serverAdapter";
import {
  awardFixturePlayer,
  closeFixtureLottery,
  draftFixturePlayer,
  drawFixtureNextPlayer,
  isE2EAuctionFixtureEnabled,
  placeFixtureBid,
  pauseFixtureAuction,
  recoverFixtureExpiredAuction,
  restartFixtureAuctionWithUnsold,
  resumeFixtureAuction,
  startFixtureAuction,
} from "@/features/auction/api/e2eAuctionFixture";
import {
  AUCTION_DURATION_MS,
  EXTEND_DURATION_MS,
  EXTEND_THRESHOLD_MS,
  RE_AUCTION_DURATION_MS,
} from "@/features/auction/constants/auctionTimings";

// ---------- 상수 ----------

const LATENCY_DEBUG =
  process.env.NEXT_PUBLIC_DEBUG_LATENCY === "1" ||
  process.env.DEBUG_LATENCY === "1";

function nowMs(): number {
  return Date.now();
}

function logLatency(label: string, data: Record<string, unknown>) {
  if (!LATENCY_DEBUG) return;
  console.info(`[latency][server] ${label}`, data);
}

function getAuctionFirestore() {
  return getAuctionServerServices().firestore;
}

type AuctionRoomState = {
  auction_mode?: string | null;
  current_player_id?: string | null;
  timer_ends_at?: admin.firestore.Timestamp | null;
  next_auction_duration_ms?: number | null;
  active_bid?: {
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

type SealedBidRoundOptions = {
  minAmount?: number;
  eligibleTeamIds?: string[] | null;
  durationMs?: number;
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- 내부 헬퍼 ----------

async function sysMsg(
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
    messageRef.set({
      event_id: messageId,
      sender_name: "시스템",
      sender_role: "SYSTEM",
      content,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }),
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

async function publishAuctionEvent(
  event: AuctionEventEnvelope,
): Promise<void> {
  const { rtdb } = getAuctionServerServices();
  await Promise.all([
    rtdb.ref(`signals/${event.roomId}/auctionEvent`).set(event),
    rtdb.ref(`signals/${event.roomId}/auctionEvents/${event.eventId}`).set(event),
  ]);
}

function createEventId(type: AuctionEventEnvelope["type"]): string {
  return `${type.toLowerCase()}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function createAuctionEvent(
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

function createAuctionEventPatch(
  roomRef: admin.firestore.DocumentReference,
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

function toTimestamp(value: admin.firestore.Timestamp | null | undefined) {
  return value ? value.toDate().toISOString() : null;
}

function queueSystemMessage(roomId: string, content: string, eventId: string) {
  void sysMsg(roomId, content, `${eventId}:system`).catch((error) => {
    console.error("[auction] async sysMsg failed", {
      roomId,
      eventId,
      error,
    });
  });
}

function getSealedBidPatch(roomData: AuctionRoomState): SealedBidState {
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

async function startSealedBidRound(
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
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(roomRef, {
      timer_ends_at: admin.firestore.Timestamp.fromDate(timerEndsAt),
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

/**
 * 클라이언트 직접 입찰(placeBidDirect) 성공 후 호출.
 * RTDB에 BID_PLACED 이벤트를 전파하고 시스템 메시지를 생성한다.
 * fire-and-forget으로 호출되므로 입찰 레이턴시에 영향을 주지 않는다.
 */
export async function broadcastBidEvent(
  roomId: string,
  playerId: string,
  teamId: string,
  teamName: string,
  amount: number,
  timerEndsAt: string | null,
  revision: number,
  timerDurationMs: number | null = null,
): Promise<void> {
  const event = createAuctionEvent(roomId, "BID_PLACED", revision, {
    currentPlayerId: playerId,
    // timerEndsAt이 제공된 경우에만 포함, 아니면 undefined로 설정하여 수신측에서 기존 값을 유지하게 함
    ...(timerEndsAt ? { timerEndsAt } : {}),
    timerDurationMs,
    liveBid: {
      player_id: playerId,
      team_id: teamId,
      amount,
      created_at: new Date().toISOString(),
    },
  });

  // RTDB 이벤트 먼저 발행 — 채팅·Firestore 기록과 독립적으로 타이머를 갱신한다
  try {
    await publishAuctionEvent(event);
  } catch (error) {
    console.error("[auction] broadcastBidEvent RTDB publish failed", { roomId, error });
  }

  // Firestore last_auction_event 저장(onSnapshot fallback용) + 채팅은 독립 처리
  getAuctionFirestore()
    .collection("rooms")
    .doc(roomId)
    .update({ last_auction_event: event })
    .catch((err) => {
      console.error("[auction] last_auction_event update failed", { roomId, err });
    });
  queueSystemMessage(
    roomId,
    `💰 ${teamName}이 ${amount}P에 입찰했습니다!`,
    event.eventId,
  );
}

// ---------- 경매 흐름 ----------

/** 랜덤으로 WAITING 선수 1명을 IN_AUCTION으로 전환 */
export async function drawNextPlayer(
  roomId: string,
): Promise<{ error?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return drawFixtureNextPlayer(roomId)
    }
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return { error: "방을 찾을 수 없습니다." };

    const roomData = roomSnap.data() as AuctionRoomState;
    if (roomData.current_player_id) {
      return { error: "이미 경매 중인 선수가 있습니다." };
    }

    const waitingSnap = await getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .collection("players")
      .where("status", "==", "WAITING")
      .get();

    if (waitingSnap.empty) return { error: "대기 중인 선수가 없습니다." };

    const docs = waitingSnap.docs;
    const picked = docs[Math.floor(Math.random() * docs.length)];
    const pickedData = picked.data();

    // 1. 참여 인원 검증 (주최자 1명 + 리더 최소 2명 = 최소 3명)
    const { rtdb } = getAuctionServerServices();
    let organizerCount = 0;
    let leaderCount = 0;

    for (let attempt = 0; attempt < 3; attempt++) {
      const presenceSnap = await rtdb.ref(`presence/${roomId}`).get();
      const presenceData = presenceSnap.val() as Record<string, { role: string }> | null;
      const presences = presenceData ? Object.values(presenceData) : [];

      organizerCount = presences.filter(p => p.role === 'ORGANIZER').length;
      leaderCount = presences.filter(p => p.role === 'LEADER').length;
      if (organizerCount >= 1 && leaderCount >= 2) break;
      if (attempt < 2) await sleep(350);
    }
    
    if (organizerCount < 1 || leaderCount < 2) {
      return { error: `경매를 시작하려면 주최자 1명과 최소 2명의 리더가 필요합니다. (현재 주최자: ${organizerCount}, 리더: ${leaderCount})` };
    }

    let drawEvent: AuctionEventEnvelope | null = null;
    await getAuctionFirestore().runTransaction(async (tx) => {
      const freshRoomSnap = await tx.get(roomRef);
      const freshRoomData = (freshRoomSnap.data() ?? {}) as AuctionRoomState;
      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        freshRoomData,
        "LOTTERY_DRAWN",
        {
          currentPlayerId: picked.id,
          player: {
            id: picked.id,
            status: "IN_AUCTION",
          },
          lotteryPlayer: {
            id: picked.id,
            room_id: roomId,
            name: String(pickedData.name ?? ""),
            tier: String(pickedData.tier ?? ""),
            main_position: String(pickedData.main_position ?? ""),
            sub_position: String(pickedData.sub_position ?? ""),
            status: "IN_AUCTION",
            team_id: null,
            sold_price: null,
            description: String(pickedData.description ?? ""),
          },
          timerEndsAt: null,
          liveBid: null,
        },
      );
      tx.update(picked.ref, { status: "IN_AUCTION" });
      tx.update(roomRef, {
        current_player_id: picked.id,
        timer_ends_at: null,
        active_bid: null,
        ...roomPatch,
      });
      drawEvent = event;
    });

    if (drawEvent) {
      await publishAuctionEvent(drawEvent);
    }

    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 경매 시작 — timer_ends_at 설정 */
export async function startAuction(
  roomId: string,
  durationMs: number = AUCTION_DURATION_MS,
): Promise<{ error?: string; timerEndsAt?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return startFixtureAuction(roomId, durationMs)
    }
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return { error: "방을 찾을 수 없습니다." };

    const roomData = roomSnap.data() as AuctionRoomState;
    const currentPlayerId =
      typeof roomData.current_player_id === "string"
        ? roomData.current_player_id
        : null;
    if (!currentPlayerId) {
      return { error: "현재 경매 중인 선수가 없습니다." };
    }
    if (normalizeAuctionMode(roomData.auction_mode) === "SEALED_BID") {
      return startSealedBidRound(roomId, { durationMs });
    }
    let startEvent: AuctionEventEnvelope | null = null;
    let resolvedTimerEndsAt: string | undefined
    await getAuctionFirestore().runTransaction(async (tx) => {
      const freshRoomSnap = await tx.get(roomRef);
      const freshRoomData = (freshRoomSnap.data() ?? {}) as AuctionRoomState;
      const freshPlayerId = freshRoomData.current_player_id ?? null;
      if (!freshPlayerId) {
        throw new Error("현재 경매 중인 선수가 없습니다.");
      }
      const nextDurationMs =
        freshRoomData.next_auction_duration_ms ?? durationMs
      // 타이머 시작 시간은 서버 시간 기준으로 정확히 10초(또는 지정된 시간) 뒤
      const timerEndsAt = new Date(Date.now() + nextDurationMs);
      resolvedTimerEndsAt = timerEndsAt.toISOString()

      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        freshRoomData,
        "AUCTION_STARTED",
        {
          currentPlayerId: freshPlayerId,
          timerEndsAt: resolvedTimerEndsAt,
          timerDurationMs: nextDurationMs,
          player: {
            id: freshPlayerId,
            status: "IN_AUCTION",
          },
          liveBid: freshRoomData.active_bid ?? null,
        },
      );
      tx.update(roomRef, {
        timer_ends_at: admin.firestore.Timestamp.fromDate(timerEndsAt),
        ...roomPatch,
      });
      startEvent = event;
    });
    if (startEvent) {
      const event = startEvent as AuctionEventEnvelope;
      // RTDB 이벤트 전송 (시스템 메시지는 fire-and-forget)
      await publishAuctionEvent(event);
      queueSystemMessage(roomId, "⏱️ 경매가 시작되었습니다!", event.eventId);
    }
    return {
      timerEndsAt: resolvedTimerEndsAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 경매 일시정지 (팀장 연결 끊김) */
export async function pauseAuction(
  roomId: string,
): Promise<{ error?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return pauseFixtureAuction(roomId)
    }
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    let pauseEvent: AuctionEventEnvelope | null = null;
    await getAuctionFirestore().runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef);
      const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
      const pausedRemainingMs = roomData.timer_ends_at
        ? Math.max(0, roomData.timer_ends_at.toMillis() - Date.now())
        : null;
      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        roomData,
        "AUCTION_PAUSED",
        {
          currentPlayerId: roomData.current_player_id ?? null,
          timerEndsAt: null,
          liveBid: roomData.active_bid ?? null,
        },
      );
      tx.update(roomRef, {
        timer_ends_at: null,
        paused_remaining_ms: pausedRemainingMs,
        ...roomPatch,
      });
      pauseEvent = event;
    });
    if (pauseEvent) {
      const event = pauseEvent as AuctionEventEnvelope;
      await publishAuctionEvent(event);
      queueSystemMessage(
        roomId,
        "⚠️ 팀장 연결이 끊겼습니다. 경매가 일시 정지됩니다.",
        event.eventId,
      );
    }
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 경매 재개 (팀장 재연결) */
export async function resumeAuction(
  roomId: string,
): Promise<{ error?: string; timerEndsAt?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return resumeFixtureAuction(roomId)
    }
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    let resumeEvent: AuctionEventEnvelope | null = null;
    let resolvedTimerEndsAt: string | undefined;
    await getAuctionFirestore().runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef);
      const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
      const resumeDurationMs = Math.max(
        roomData.paused_remaining_ms ?? EXTEND_DURATION_MS,
        EXTEND_DURATION_MS,
      );
      const timerEndsAt = new Date(Date.now() + resumeDurationMs);
      resolvedTimerEndsAt = timerEndsAt.toISOString();
      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        roomData,
        "AUCTION_RESUMED",
        {
          currentPlayerId: roomData.current_player_id ?? null,
          timerEndsAt: resolvedTimerEndsAt,
          timerDurationMs: resumeDurationMs,
          liveBid: roomData.active_bid ?? null,
        },
      );
      tx.update(roomRef, {
        timer_ends_at: admin.firestore.Timestamp.fromDate(timerEndsAt),
        paused_remaining_ms: null,
        ...roomPatch,
      });
      resumeEvent = event;
    });
    if (resumeEvent) {
      const event = resumeEvent as AuctionEventEnvelope;
      await publishAuctionEvent(event);
      queueSystemMessage(
        roomId,
        "✅ 팀장이 재연결되었습니다. 남은 시간으로 경매가 재개됩니다.",
        event.eventId,
      );
    }
    return { timerEndsAt: resolvedTimerEndsAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 추첨 모달 닫기 신호 — RTDB에 timestamp 기록 */
export async function closeLotteryAction(
  roomId: string,
  playerName: string,
): Promise<{ error?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return closeFixtureLottery(roomId, playerName)
    }
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    let closeEvent: AuctionEventEnvelope | null = null;
    await getAuctionFirestore().runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef);
      const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        roomData,
        "LOTTERY_CLOSED",
        {
          currentPlayerId: roomData.current_player_id ?? null,
          liveBid: roomData.active_bid ?? null,
          timerEndsAt: toTimestamp(roomData.timer_ends_at),
        },
      );
      tx.update(roomRef, roomPatch);
      closeEvent = event;
    });
    if (closeEvent) {
      const event = closeEvent as AuctionEventEnvelope;
      await publishAuctionEvent(event);
      queueSystemMessage(roomId, `🎲 ${playerName} 선수 추첨!`, event.eventId);
    }
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 입찰 */
export async function placeBid(
  roomId: string,
  playerId: string,
  teamId: string,
  amount: number,
): Promise<{
  error?: string;
  timerEndsAt?: string;
  revision?: number;
  debug?: {
    eventId?: string;
    serverReceivedAt: number;
    validationDoneAt?: number;
    bidPersistedAt?: number;
    timerExtendedAt?: number;
    timerSignalSentAt?: number;
    messagePersistedAt?: number;
    serverCompletedAt: number;
  };
}> {
  if (!Number.isInteger(amount) || amount <= 0)
    return { error: "양의 정수 금액을 입력하세요." };
  if (amount % 10 !== 0) return { error: "10P 단위로 입찰해야 합니다." };
  if (amount > 100_000)
    return { error: "최대 입찰액(100,000P)을 초과했습니다." };

  const serverReceivedAt = nowMs();
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return placeFixtureBid(roomId, playerId, teamId, amount)
    }
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    const teamRef = roomRef.collection("teams").doc(teamId);
    const soldCountQuery = roomRef
      .collection("players")
      .where("team_id", "==", teamId)
      .where("status", "==", "SOLD");
    let validationDoneAt: number | undefined;
    let timerExtendedAt: number | undefined;
    let timerSignalSentAt: number | undefined;
    let messagePersistedAt: number | undefined;
    let newTimerEndsAt: string | undefined;
    let newRevision: number | undefined;
    let bidEvent: AuctionEventEnvelope | null = null;
    let bidEventId: string | undefined;
    let winningTeamName = "";

    await getAuctionFirestore().runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef);

      if (!roomSnap.exists) {
        throw new Error("방을 찾을 수 없습니다.");
      }

      const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
      const timerField = roomData.timer_ends_at ?? null;
      if (!timerField) {
        throw new Error("경매가 진행 중이지 않습니다.");
      }
      if (timerField.toMillis() - Date.now() < -500) {
        throw new Error("경매 시간이 종료되었습니다.");
      }
      if (roomData.current_player_id !== playerId) {
        throw new Error("현재 경매 중인 선수가 아닙니다.");
      }

      const [teamSnap, soldCountSnap] = await Promise.all([
        tx.get(teamRef),
        tx.get(soldCountQuery),
      ]);
      if (!teamSnap.exists) {
        throw new Error("팀을 찾을 수 없습니다.");
      }

      const teamData = teamSnap.data()!;
      winningTeamName = String(teamData.name ?? "");

      const membersPerTeam = roomData.members_per_team ?? 5;
      const captainMode = normalizeCaptainMode(roomData.captain_mode);
      const auctionSlotsPerTeam = getAuctionSlotsPerTeam(
        membersPerTeam,
        captainMode,
      );

      const bidState = getAuctionBidEligibility({
        currentBidAmount: roomData.active_bid?.amount ?? null,
        currentBidTeamId: roomData.active_bid?.team_id ?? null,
        teamId,
        teamPointBalance: teamData.point_balance ?? 0,
        isAuctionActive: true,
        hasCurrentPlayer: roomData.current_player_id === playerId,
        isTeamFull: soldCountSnap.size >= auctionSlotsPerTeam,
      });

      if (bidState.isLeading) {
        throw new Error("현재 최고 입찰자입니다. 추가 입찰이 불가합니다.");
      }
      if (soldCountSnap.size >= auctionSlotsPerTeam) {
        throw new Error("팀 인원이 가득 찼습니다.");
      }
      if (amount < bidState.minBid) {
        throw new Error(`최소 입찰액은 ${bidState.minBid}P입니다.`);
      }
      if ((teamData.point_balance ?? 0) < amount) {
        throw new Error(`포인트 부족 (보유: ${teamData.point_balance}P)`);
      }

      validationDoneAt = nowMs();

      const liveBid = {
        player_id: playerId,
        team_id: teamId,
        amount,
        created_at: new Date().toISOString(),
      };

      const now = Date.now();
      const timerRemaining = timerField.toMillis() - now;
      const shouldExtendTimer = timerRemaining < EXTEND_THRESHOLD_MS;
      const nextTimerTimestamp = shouldExtendTimer
        ? admin.firestore.Timestamp.fromDate(new Date(now + EXTEND_DURATION_MS))
        : timerField;
      newTimerEndsAt = nextTimerTimestamp.toDate().toISOString();
      if (shouldExtendTimer) timerExtendedAt = nowMs();

      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        roomData,
        "BID_PLACED",
        {
          currentPlayerId: playerId,
          timerEndsAt: nextTimerTimestamp.toDate().toISOString(),
          timerDurationMs: shouldExtendTimer ? EXTEND_DURATION_MS : null,
          liveBid,
        },
      );
      newRevision = event.revision;

      tx.update(roomRef, {
        current_player_id: playerId,
        timer_ends_at: nextTimerTimestamp,
        active_bid: liveBid,
        ...roomPatch,
      });

      bidEvent = event;
    });

    if (bidEvent) {
      const event = bidEvent as AuctionEventEnvelope;
      bidEventId = event.eventId;
      // RTDB 이벤트 전송 (시스템 메시지는 fire-and-forget)
      await publishAuctionEvent(event);
      timerSignalSentAt = nowMs();
      // RTDB에 입찰 내역 저장 (fire-and-forget)
      getAuctionServerServices().rtdb
        .ref(`bids/${roomId}/${playerId}/${event.eventId}`)
        .set({
          id: event.eventId,
          room_id: roomId,
          player_id: playerId,
          team_id: teamId,
          amount,
          created_at: new Date().toISOString(),
        })
        .catch((err: unknown) =>
          console.error("[auction] rtdb bid write failed", { roomId, err }),
        );
      queueSystemMessage(
        roomId,
        `💰 ${winningTeamName}이 ${amount}P에 입찰했습니다!`,
        event.eventId,
      );
      messagePersistedAt = nowMs();
    }

    const serverCompletedAt = nowMs();

    logLatency("placeBid", {
      roomId,
      teamId,
      amount,
      totalMs: serverCompletedAt - serverReceivedAt,
      validationMs:
        typeof validationDoneAt === "number"
          ? validationDoneAt - serverReceivedAt
          : null,
      timerExtendMs:
        timerExtendedAt && validationDoneAt
          ? timerExtendedAt - validationDoneAt
          : null,
      timerSignalMs:
        timerSignalSentAt && (timerExtendedAt ?? validationDoneAt)
          ? timerSignalSentAt - (timerExtendedAt ?? validationDoneAt ?? 0)
          : null,
      messagePersistMs:
        typeof messagePersistedAt === "number" &&
        typeof (timerSignalSentAt ?? validationDoneAt) === "number"
          ? messagePersistedAt -
            ((timerSignalSentAt ?? validationDoneAt) ?? 0)
          : null,
    });

    return {
      timerEndsAt: newTimerEndsAt,
      revision: newRevision,
      debug: {
        eventId: bidEventId,
        serverReceivedAt,
        validationDoneAt,
        timerExtendedAt,
        timerSignalSentAt,
        messagePersistedAt,
        serverCompletedAt,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 비공개 입찰 금액 제출/수정 */
export async function submitSealedBid(
  roomId: string,
  playerId: string,
  teamId: string,
  amount: number,
): Promise<{ error?: string; submittedAmount?: number }> {
  if (!Number.isInteger(amount) || amount < 0) {
    return { error: "0 이상의 정수 금액을 입력하세요." };
  }

  try {
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return { error: "방을 찾을 수 없습니다." };

    const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
    if (normalizeAuctionMode(roomData.auction_mode) !== "SEALED_BID") {
      return { error: "비공개 입찰 방이 아닙니다." };
    }
    if (roomData.current_player_id !== playerId) {
      return { error: "현재 경매 중인 선수가 아닙니다." };
    }
    if (roomData.sealed_bid_phase !== "ACTIVE" || !roomData.sealed_bid_round_id) {
      return { error: "비공개 입찰 제출 시간이 아닙니다." };
    }
    const timerEndsAt = roomData.timer_ends_at ?? null;
    if (!timerEndsAt || timerEndsAt.toMillis() <= Date.now()) {
      return { error: "비공개 입찰 시간이 종료되었습니다." };
    }
    const eligibleTeamIds = roomData.sealed_bid_eligible_team_ids ?? null;
    if (eligibleTeamIds && !eligibleTeamIds.includes(teamId)) {
      return { error: "재입찰 대상 팀만 입찰할 수 있습니다." };
    }

    const teamRef = roomRef.collection("teams").doc(teamId);
    const [teamSnap, soldCountSnap] = await Promise.all([
      teamRef.get(),
      roomRef
        .collection("players")
        .where("team_id", "==", teamId)
        .where("status", "==", "SOLD")
        .get(),
    ]);
    if (!teamSnap.exists) return { error: "팀을 찾을 수 없습니다." };

    const teamData = teamSnap.data() ?? {};
    const membersPerTeam = roomData.members_per_team ?? 5;
    const captainMode = normalizeCaptainMode(roomData.captain_mode);
    const auctionSlotsPerTeam = getAuctionSlotsPerTeam(
      membersPerTeam,
      captainMode,
    );
    if (soldCountSnap.size >= auctionSlotsPerTeam) {
      return { error: "팀 인원이 가득 찼습니다." };
    }

    const pointBalance = Number(teamData.point_balance ?? 0);
    if (amount > pointBalance) {
      return { error: `보유 포인트(${pointBalance}P)를 초과할 수 없습니다.` };
    }
    const minAmount = roomData.sealed_bid_min_amount ?? 0;
    if (amount > 0 && amount < minAmount) {
      return { error: `재입찰 최소 금액은 ${minAmount}P입니다.` };
    }

    await roomRef
      .collection("sealed_bid_rounds")
      .doc(roomData.sealed_bid_round_id)
      .collection("submissions")
      .doc(teamId)
      .set({
        room_id: roomId,
        player_id: playerId,
        team_id: teamId,
        amount,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

    return { submittedAmount: amount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 비공개 입찰 타이머 만료 후 제출을 잠근다. */
export async function lockSealedBidRound(
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
    queueSystemMessage(roomId, "🔒 비공개 입찰이 마감되었습니다.", event.eventId);
    return { locked: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 점수공개: 제출 결과를 집계해 공개 카드 데이터를 확정한다. */
export async function revealSealedBidRound(
  roomId: string,
): Promise<{ error?: string; revealResult?: SealedBidRevealCard[] }> {
  try {
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return { error: "방을 찾을 수 없습니다." };

    const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
    const roundId = roomData.sealed_bid_round_id;
    if (normalizeAuctionMode(roomData.auction_mode) !== "SEALED_BID" || !roundId) {
      return { error: "비공개 입찰 라운드가 없습니다." };
    }
    if (roomData.sealed_bid_phase !== "LOCKED") {
      return { error: "점수공개 가능한 상태가 아닙니다." };
    }

    const [teamsSnap, submissionsSnap] = await Promise.all([
      roomRef.collection("teams").get(),
      roomRef.collection("sealed_bid_rounds").doc(roundId).collection("submissions").get(),
    ]);
    const submissions = new Map(
      submissionsSnap.docs.map((doc) => [
        doc.id,
        Number((doc.data() ?? {}).amount ?? 0),
      ]),
    );
    const eligibleTeamIds = roomData.sealed_bid_eligible_team_ids ?? null;
    const revealOrder = teamsSnap.docs.map((doc) => doc.id);
    const effectiveAmounts = teamsSnap.docs.map((teamDoc) => {
      const eligible = !eligibleTeamIds || eligibleTeamIds.includes(teamDoc.id);
      const amount = eligible ? Math.max(0, submissions.get(teamDoc.id) ?? 0) : 0;
      return {
        teamDoc,
        eligible,
        amount,
      };
    });
    const highestAmount = Math.max(0, ...effectiveAmounts.map((item) => item.amount));
    const tiedTeamIds =
      highestAmount > 0
        ? effectiveAmounts
            .filter((item) => item.eligible && item.amount === highestAmount)
            .map((item) => item.teamDoc.id)
        : [];
    const revealResult: SealedBidRevealCard[] = effectiveAmounts.map((item) => ({
      team_id: item.teamDoc.id,
      team_name: String((item.teamDoc.data() ?? {}).name ?? ""),
      amount: item.amount,
      is_pass: item.amount <= 0,
      is_highest: highestAmount > 0 && item.amount === highestAmount,
      is_tied: highestAmount > 0 && tiedTeamIds.length > 1 && item.amount === highestAmount,
      eligible: item.eligible,
    }));

    let revealEvent: AuctionEventEnvelope | null = null;
    await getAuctionFirestore().runTransaction(async (tx) => {
      const freshRoomSnap = await tx.get(roomRef);
      const freshRoomData = (freshRoomSnap.data() ?? {}) as AuctionRoomState;
      if (
        freshRoomData.sealed_bid_phase !== "LOCKED" ||
        freshRoomData.sealed_bid_round_id !== roundId
      ) {
        throw new Error("비공개 입찰 상태가 변경되었습니다.");
      }
      const nextSealedBid: SealedBidState = {
        ...getSealedBidPatch(freshRoomData),
        phase: "REVEALING",
        revealOrder,
        revealResult,
        highestAmount,
        tiedTeamIds,
      };
      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        freshRoomData,
        "SEALED_BID_REVEALED",
        {
          currentPlayerId: freshRoomData.current_player_id ?? null,
          timerEndsAt: null,
          liveBid: null,
          sealedBid: nextSealedBid,
        },
      );
      tx.update(roomRef, {
        sealed_bid_phase: "REVEALING",
        sealed_bid_reveal_order: revealOrder,
        sealed_bid_reveal_result: revealResult,
        sealed_bid_highest_amount: highestAmount,
        sealed_bid_tied_team_ids: tiedTeamIds,
        ...roomPatch,
      });
      revealEvent = event;
    });

    if (revealEvent) {
      const event = revealEvent as AuctionEventEnvelope;
      await publishAuctionEvent(event);
      queueSystemMessage(roomId, "🃏 비공개 입찰 점수를 공개합니다.", event.eventId);
    }

    return { revealResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 카드 공개 애니메이션 완료 후 낙찰 또는 재입찰을 확정한다. */
export async function completeSealedBidReveal(
  roomId: string,
): Promise<{ error?: string; awarded?: boolean; rebidStarted?: boolean }> {
  try {
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return { error: "방을 찾을 수 없습니다." };

    const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
    if (normalizeAuctionMode(roomData.auction_mode) !== "SEALED_BID") {
      return { error: "비공개 입찰 방이 아닙니다." };
    }
    if (roomData.sealed_bid_phase !== "REVEALING") {
      return { error: "확정 가능한 상태가 아닙니다." };
    }
    const playerId = roomData.current_player_id ?? null;
    if (!playerId) return { error: "현재 경매 중인 선수가 없습니다." };
    const highestAmount = roomData.sealed_bid_highest_amount ?? 0;
    const tiedTeamIds = roomData.sealed_bid_tied_team_ids ?? [];

    if (highestAmount > 0 && tiedTeamIds.length > 1) {
      return startSealedBidRound(roomId, {
        minAmount: highestAmount,
        eligibleTeamIds: tiedTeamIds,
        durationMs: AUCTION_DURATION_MS,
      }).then((result) =>
        result.error ? { error: result.error } : { rebidStarted: true },
      );
    }

    const winnerTeamId = highestAmount > 0 ? tiedTeamIds[0] ?? null : null;
    const playerRef = roomRef.collection("players").doc(playerId);
    const winnerTeamRef = winnerTeamId
      ? roomRef.collection("teams").doc(winnerTeamId)
      : null;
    let awardEvent: AuctionEventEnvelope | null = null;
    let msgContent = "";

    await getAuctionFirestore().runTransaction(async (tx) => {
      const freshRoomSnap = await tx.get(roomRef);
      const freshPlayerSnap = await tx.get(playerRef);
      const freshRoomData = (freshRoomSnap.data() ?? {}) as AuctionRoomState;
      if (freshRoomData.sealed_bid_phase !== "REVEALING") {
        throw new Error("확정 가능한 상태가 아닙니다.");
      }
      if (!freshPlayerSnap.exists) throw new Error("선수를 찾을 수 없습니다.");

      const playerData = freshPlayerSnap.data() ?? {};
      const winnerTeamSnap = winnerTeamRef ? await tx.get(winnerTeamRef) : null;
      const winnerTeamData = winnerTeamSnap?.data() ?? null;
      const nextSealedBid: SealedBidState = {
        ...getSealedBidPatch(freshRoomData),
        phase: "AWARDED",
      };
      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        freshRoomData,
        "SEALED_BID_AWARDED",
        {
          currentPlayerId: null,
          timerEndsAt: null,
          liveBid: null,
          sealedBid: nextSealedBid,
        },
      );

      tx.update(roomRef, {
        current_player_id: null,
        timer_ends_at: null,
        active_bid: null,
        sealed_bid_phase: "AWARDED",
        ...roomPatch,
      });

      if (winnerTeamId && winnerTeamRef && winnerTeamData) {
        const nextPointBalance =
          Number(winnerTeamData.point_balance ?? 0) - highestAmount;
        tx.update(playerRef, {
          status: "SOLD",
          team_id: winnerTeamId,
          sold_price: highestAmount,
        });
        tx.update(winnerTeamRef, {
          point_balance: nextPointBalance,
        });
        awardEvent = {
          ...event,
          player: {
            id: playerId,
            status: "SOLD",
            team_id: winnerTeamId,
            sold_price: highestAmount,
          },
          team: {
            id: winnerTeamId,
            point_balance: nextPointBalance,
          },
        };
        tx.update(roomRef, { last_auction_event: awardEvent });
        msgContent = `🏆 ${winnerTeamData.name}이 ${playerData.name} 선수를 ${highestAmount}P에 비공개 낙찰!`;
      } else {
        tx.update(playerRef, { status: "UNSOLD" });
        awardEvent = {
          ...event,
          player: {
            id: playerId,
            status: "UNSOLD",
            team_id: null,
            sold_price: null,
          },
        };
        tx.update(roomRef, { last_auction_event: awardEvent });
        msgContent = `❌ ${playerData.name} 선수 비공개 입찰 포기로 유찰`;
      }
    });

    if (awardEvent) {
      const event = awardEvent as AuctionEventEnvelope;
      await publishAuctionEvent(event);
      queueSystemMessage(roomId, msgContent, event.eventId);
    }

    return { awarded: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 낙찰 처리 (Firestore Transaction) */
export async function awardPlayer(
  roomId: string,
  playerId: string,
): Promise<{ error?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return awardFixturePlayer(roomId, playerId)
    }
    const playerRef = getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .collection("players")
      .doc(playerId);
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    let msgContent = "";
    let awardEvent: AuctionEventEnvelope | null = null;

    await getAuctionFirestore().runTransaction(async (tx) => {
      // ── 모든 읽기를 먼저 수행 ──
      const roomSnap = await tx.get(roomRef);
      const playerSnap = await tx.get(playerRef);
      if (!playerSnap.exists) throw new Error("선수를 찾을 수 없습니다.");

      const playerData = playerSnap.data()!;
      const status = playerData.status as string;
      const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
      const timerEndsAt =
        roomData.timer_ends_at ?? null;

      // 타이머가 아직 살아있으면 처리 안 함 (레이스 컨디션 방어)
      if (timerEndsAt && timerEndsAt.toMillis() > Date.now()) return;
      // 멱등성: 이미 처리된 선수
      if (status === "SOLD" || status === "UNSOLD") return;
      if (roomData.current_player_id !== playerId) return;

      let teamRef: admin.firestore.DocumentReference | null = null;
      let teamData: admin.firestore.DocumentData | null = null;
      const topBid = roomData.active_bid ?? null;

      if (topBid?.team_id) {
        teamRef = getAuctionFirestore()
          .collection("rooms")
          .doc(roomId)
          .collection("teams")
          .doc(topBid.team_id);
        const teamSnap = await tx.get(teamRef);
        teamData = teamSnap.data()!;
      }

      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        roomData,
        topBid && teamRef && teamData ? "PLAYER_AWARDED" : "PLAYER_UNSOLD",
        {
          currentPlayerId: null,
          timerEndsAt: null,
          liveBid: null,
        },
      );

      // ── 모든 쓰기를 이후에 수행 ──
      tx.update(roomRef, {
        current_player_id: null,
        timer_ends_at: null,
        active_bid: null,
        ...roomPatch,
      });

      if (topBid && teamRef && teamData) {
        tx.update(playerRef, {
          status: "SOLD",
          team_id: topBid.team_id,
          sold_price: topBid.amount,
        });
        tx.update(teamRef, {
          point_balance: teamData.point_balance - (topBid.amount as number),
        });
        awardEvent = {
          ...event,
          type: "PLAYER_AWARDED",
          player: {
            id: playerId,
            status: "SOLD",
            team_id: topBid.team_id,
            sold_price: topBid.amount,
          },
          team: {
            id: topBid.team_id,
            point_balance: teamData.point_balance - topBid.amount,
          },
        };
        tx.update(roomRef, { last_auction_event: awardEvent });
        msgContent = `🏆 ${teamData.name}이 ${playerData.name} 선수를 ${topBid.amount}P에 낙찰!`;
      } else {
        tx.update(playerRef, { status: "UNSOLD" });
        awardEvent = {
          ...event,
          type: "PLAYER_UNSOLD",
          player: {
            id: playerId,
            status: "UNSOLD",
            team_id: null,
            sold_price: null,
          },
        };
        tx.update(roomRef, { last_auction_event: awardEvent });
        msgContent = `❌ ${playerData.name} 선수 유찰`;
      }
    });

    if (awardEvent) {
      const event = awardEvent as AuctionEventEnvelope;
      // RTDB 이벤트 전송 (시스템 메시지는 fire-and-forget)
      await publishAuctionEvent(event);
      // RTDB 입찰 내역 정리 (fire-and-forget)
      getAuctionServerServices().rtdb
        .ref(`bids/${roomId}/${playerId}`)
        .remove()
        .catch(() => {});
      if (msgContent) {
        queueSystemMessage(roomId, msgContent, event.eventId);
      }
    }
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 만료된 경매 복구 — 현재 room 상태를 읽고 필요한 경우에만 awardPlayer 호출 */
export async function recoverExpiredAuction(
  roomId: string,
): Promise<{ error?: string; recovered?: boolean }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return recoverFixtureExpiredAuction(roomId)
    }
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return { error: "방을 찾을 수 없습니다." };

    const roomData = roomSnap.data() as AuctionRoomState;
    const playerId = roomData.current_player_id as string | null | undefined;
    const timerEndsAt =
      roomData.timer_ends_at as admin.firestore.Timestamp | null | undefined;

    if (!playerId || !timerEndsAt) {
      return { recovered: false };
    }

    if (timerEndsAt.toMillis() > Date.now()) {
      return { recovered: false };
    }

    if (normalizeAuctionMode(roomData.auction_mode) === "SEALED_BID") {
      const result = await lockSealedBidRound(roomId);
      if (result.error) return result;
      return { recovered: !!result.locked };
    }

    const result = await awardPlayer(roomId, playerId);
    if (result.error) return result;

    return { recovered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 자유계약 영입 (마지막 슬롯이면 잔여 포인트 전액 사용) */
export async function draftPlayer(
  roomId: string,
  playerId: string,
  teamId: string,
): Promise<{ error?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return draftFixturePlayer(roomId, playerId, teamId)
    }
    const playerSnap = await getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .collection("players")
      .doc(playerId)
      .get();
    if (!playerSnap.exists) return { error: "선수를 찾을 수 없습니다." };
    const playerData = playerSnap.data()!;

    if (playerData.status !== "UNSOLD" && playerData.status !== "WAITING") {
      return { error: "영입 요청할 수 없는 상태의 선수입니다." };
    }
    if (playerData.room_id !== roomId) {
      return { error: "해당 선수는 이 방에 속하지 않습니다." };
    }

    const teamSnap = await getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .collection("teams")
      .doc(teamId)
      .get();
    if (!teamSnap.exists) return { error: "팀을 찾을 수 없습니다." };
    const teamData = teamSnap.data()!;

    const roomSnap = await getAuctionFirestore().collection("rooms").doc(roomId).get();
    const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
    const membersPerTeam = roomData.members_per_team ?? 5;
    const captainMode = normalizeCaptainMode(roomData.captain_mode);
    const auctionSlotsPerTeam = getAuctionSlotsPerTeam(
      membersPerTeam,
      captainMode,
    );

    const soldCountSnap = await getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .collection("players")
      .where("team_id", "==", teamId)
      .where("status", "==", "SOLD")
      .get();
    if (soldCountSnap.size >= auctionSlotsPerTeam) {
      return { error: "팀 인원이 가득 찼습니다." };
    }

    const isLastSlot = soldCountSnap.size === auctionSlotsPerTeam - 1;
    const draftPrice = isLastSlot ? teamData.point_balance : 0;

    const teamRef = getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .collection("teams")
      .doc(teamId);
    let finalDraftPrice = draftPrice;
    let finalPointBalance = teamData.point_balance;
    let draftEvent: AuctionEventEnvelope | null = null;

    await getAuctionFirestore().runTransaction(async (tx) => {
      const freshTeamSnap = await tx.get(teamRef);
      const freshPlayerSnap = await tx.get(
        getAuctionFirestore().collection("rooms").doc(roomId).collection("players").doc(playerId),
      );

      if (!freshTeamSnap.exists) {
        throw new Error("팀을 찾을 수 없습니다.");
      }
      if (!freshPlayerSnap.exists) {
        throw new Error("선수를 찾을 수 없습니다.");
      }

      const freshTeamData = freshTeamSnap.data()!;
      const freshPlayerData = freshPlayerSnap.data()!;
      if (
        freshPlayerData.status !== "UNSOLD" &&
        freshPlayerData.status !== "WAITING"
      ) {
        throw new Error("영입 요청할 수 없는 상태의 선수입니다.");
      }

      const transactionDraftPrice =
        soldCountSnap.size === auctionSlotsPerTeam - 1
          ? freshTeamData.point_balance
          : 0;
      finalDraftPrice = transactionDraftPrice;
      finalPointBalance =
        transactionDraftPrice > 0 ? 0 : freshTeamData.point_balance;

      const { event, roomPatch } = createAuctionEventPatch(
        getAuctionFirestore().collection("rooms").doc(roomId),
        roomData,
        "DRAFT_ASSIGNED",
        {
          currentPlayerId: roomData.current_player_id ?? null,
          timerEndsAt: toTimestamp(roomData.timer_ends_at),
          liveBid: roomData.active_bid ?? null,
          player: {
            id: playerId,
            status: "SOLD",
            team_id: teamId,
            sold_price: transactionDraftPrice,
          },
          team: {
            id: teamId,
            point_balance:
              transactionDraftPrice > 0 ? 0 : freshTeamData.point_balance,
          },
        },
      );

      tx.update(freshPlayerSnap.ref, {
        status: "SOLD",
        team_id: teamId,
        sold_price: transactionDraftPrice,
      });

      if (transactionDraftPrice > 0) {
        tx.update(teamRef, {
          point_balance: 0,
        });
      }
      tx.update(getAuctionFirestore().collection("rooms").doc(roomId), roomPatch);
      draftEvent = event;
    });

    if (draftEvent) {
      const event = {
        ...(draftEvent as AuctionEventEnvelope),
        player: {
          id: playerId,
          status: "SOLD" as const,
          team_id: teamId,
          sold_price: finalDraftPrice,
        },
        team: {
          id: teamId,
          point_balance: finalPointBalance,
        },
      } as AuctionEventEnvelope;
      await publishAuctionEvent(event);
      queueSystemMessage(
        roomId,
        isLastSlot
          ? `🤝 ${teamData.name}이(가) ${playerData.name} 선수를 ${finalDraftPrice}P에 드래프트 영입!`
          : `🤝 ${teamData.name}이(가) ${playerData.name} 선수를 자유계약으로 영입!`,
        event.eventId,
      );
    }
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** UNSOLD 선수 전부 WAITING으로 전환 (재경매) */
export async function restartAuctionWithUnsold(
  roomId: string,
): Promise<{ error?: string; reAuctionStarted?: boolean }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return restartFixtureAuctionWithUnsold(roomId)
    }
    const unsoldSnap = await getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .collection("players")
      .where("status", "==", "UNSOLD")
      .get();
    if (unsoldSnap.empty) return { error: "유찰된 선수가 없습니다." };

    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    let restartEvent: AuctionEventEnvelope | null = null;
    await getAuctionFirestore().runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef);
      const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        roomData,
        "RE_AUCTION_STARTED",
        {
          currentPlayerId: roomData.current_player_id ?? null,
          timerEndsAt: toTimestamp(roomData.timer_ends_at),
          liveBid: roomData.active_bid ?? null,
          playerIdsToWaiting: unsoldSnap.docs.map((doc) => doc.id),
        },
      );
      for (const doc of unsoldSnap.docs) {
        tx.update(doc.ref, { status: "WAITING" });
      }
      tx.update(roomRef, {
        next_auction_duration_ms: RE_AUCTION_DURATION_MS,
        ...roomPatch,
      });
      restartEvent = event;
    });

    if (restartEvent) {
      const event = restartEvent as AuctionEventEnvelope;
      await publishAuctionEvent(event);
      queueSystemMessage(
        roomId,
        `🔄 유찰 선수 재경매를 시작합니다! (${unsoldSnap.size}명)`,
        event.eventId,
      );
    }
    return { reAuctionStarted: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}
