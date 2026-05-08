"use server";

import * as admin from "firebase-admin";
import {
  getAuctionSlotsPerTeam,
  normalizeCaptainMode,
} from "@/features/auction/utils/roster";
import {
  getAuctionBidEligibility,
  type AuctionEventEnvelope,
} from "@/features/auction/utils/auctionRealtime";
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
};

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
): Promise<void> {
  const event = createAuctionEvent(roomId, "BID_PLACED", revision, {
    currentPlayerId: playerId,
    timerEndsAt,
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
      const timerEndsAt = new Date(Date.now() + nextDurationMs);
      resolvedTimerEndsAt = timerEndsAt.toISOString()

      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        freshRoomData,
        "AUCTION_STARTED",
        {
          currentPlayerId: freshPlayerId,
          timerEndsAt: resolvedTimerEndsAt,
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
    const bidHistoryRef = roomRef.collection("bids");

    let validationDoneAt: number | undefined;
    let bidPersistedAt: number | undefined;
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
          liveBid,
        },
      );
      newRevision = event.revision;

      tx.set(bidHistoryRef.doc(event.eventId), {
        event_id: event.eventId,
        player_id: playerId,
        team_id: teamId,
        room_id: roomId,
        amount,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      bidPersistedAt = nowMs();

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
      bidPersistMs:
        typeof validationDoneAt === "number" &&
        typeof bidPersistedAt === "number"
          ? bidPersistedAt - validationDoneAt
          : null,
      timerExtendMs:
        timerExtendedAt && bidPersistedAt
          ? timerExtendedAt - bidPersistedAt
          : null,
      timerSignalMs:
        timerSignalSentAt && timerExtendedAt
          ? timerSignalSentAt - timerExtendedAt
          : null,
      messagePersistMs:
        typeof messagePersistedAt === "number" &&
        typeof (timerSignalSentAt ?? bidPersistedAt) === "number"
          ? messagePersistedAt - (timerSignalSentAt ?? bidPersistedAt ?? 0)
          : null,
    });

    return {
      timerEndsAt: newTimerEndsAt,
      revision: newRevision,
      debug: {
        eventId: bidEventId,
        serverReceivedAt,
        validationDoneAt,
        bidPersistedAt,
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
