"use server";

// 입찰(placeBid)·입찰 전파·낙찰(awardPlayer)·만료 복구·자유계약(draftPlayer) 서버 액션
import {
  Timestamp,
  type DocumentData,
  type DocumentReference,
} from "firebase-admin/firestore";
import {
  getAuctionSlotsPerTeam,
  normalizeCaptainMode,
} from "@/features/auction/utils/roster";
import { normalizeAuctionMode } from "@/features/auction/utils/auctionMode";
import {
  getAuctionBidEligibility,
  type AuctionEventEnvelope,
} from "@/features/auction/utils/auctionRealtime";
import { getAuctionServerServices } from "@/features/auction/realtime/serverAdapter";
import {
  awardFixturePlayer,
  draftFixturePlayer,
  isE2EAuctionFixtureEnabled,
  placeFixtureBid,
  recoverFixtureExpiredAuction,
} from "@/features/auction/api/e2eAuctionFixture";
import {
  EXTEND_DURATION_MS,
  EXTEND_THRESHOLD_MS,
} from "@/features/auction/constants/auctionTimings";
import { requireRoomOrganizer } from "@/features/auction/api/organizerAuth";
import { requireRoomLeader } from "@/features/auction/api/roomRoleAuth";
import {
  nowMs,
  logLatency,
  getAuctionFirestore,
  getNextRosterSlotsUsed,
  publishAuctionEvent,
  createAuctionEvent,
  createAuctionEventPatch,
  toTimestamp,
  queueSystemMessage,
  pruneAuctionEventHistory,
  lockSealedBidRoundInternal,
  type AuctionRoomState,
} from "./auctionFlowShared";
/**
 * 클라이언트 직접 입찰(placeBidDirect) 성공 후 호출.
 * RTDB에 BID_PLACED 이벤트를 전파하고 시스템 메시지를 생성한다.
 * fire-and-forget으로 호출되므로 입찰 레이턴시에 영향을 주지 않는다.
 */
export async function broadcastBidEvent(
  roomId: string,
  playerId: string,
  teamId: string,
  leaderToken: string,
  amount: number,
  expectedRevision: number,
): Promise<void> {
  const authError = await requireRoomLeader(roomId, teamId, leaderToken);
  if (authError) return;

  const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
  const [roomSnap, teamSnap] = await Promise.all([
    roomRef.get(),
    roomRef.collection("teams").doc(teamId).get(),
  ]);
  if (!roomSnap.exists || !teamSnap.exists) return;

  const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
  const liveBid = roomData.active_bid ?? null;
  const revision = roomData.auction_revision ?? 0;
  if (
    revision !== expectedRevision ||
    liveBid?.player_id !== playerId ||
    liveBid.team_id !== teamId ||
    liveBid.amount !== amount
  ) {
    return;
  }

  const teamName = String(teamSnap.data()?.name ?? "팀");
  const timerEndsAt = toTimestamp(roomData.timer_ends_at);
  const event = createAuctionEvent(roomId, "BID_PLACED", revision, {
    ...(typeof liveBid.event_id === "string"
      ? { eventId: liveBid.event_id }
      : {}),
    currentPlayerId: playerId,
    ...(timerEndsAt ? { timerEndsAt } : {}),
    timerDurationMs: null,
    liveBid,
  });

  // RTDB 이벤트 먼저 발행 — 채팅·Firestore 기록과 독립적으로 타이머를 갱신한다
  try {
    await publishAuctionEvent(event);
  } catch (error) {
    console.error("[auction] broadcastBidEvent RTDB publish failed", {
      roomId,
      error,
    });
  }

  // Firestore last_auction_event 저장(onSnapshot fallback용) + 채팅은 독립 처리
  getAuctionFirestore()
    .collection("rooms")
    .doc(roomId)
    .update({ last_auction_event: event })
    .catch((err) => {
      console.error("[auction] last_auction_event update failed", {
        roomId,
        err,
      });
    });
  queueSystemMessage(
    roomId,
    `💰 ${teamName}이 ${amount}P에 입찰했습니다!`,
    event.eventId,
  );
}

/** 입찰 */
export async function placeBid(
  roomId: string,
  playerId: string,
  teamId: string,
  amount: number,
  leaderToken: string = "",
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
      return placeFixtureBid(roomId, playerId, teamId, amount);
    }
    const authError = await requireRoomLeader(roomId, teamId, leaderToken);
    if (authError) return { error: authError };

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
      const shouldExtendTimer = timerRemaining <= EXTEND_THRESHOLD_MS;
      const nextTimerTimestamp = shouldExtendTimer
        ? Timestamp.fromDate(new Date(now + EXTEND_DURATION_MS))
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
      getAuctionServerServices()
        .rtdb.ref(`bids/${roomId}/${playerId}/${event.eventId}`)
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
          ? messagePersistedAt - (timerSignalSentAt ?? validationDoneAt ?? 0)
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

/** 낙찰 처리 (Firestore Transaction) */
export async function awardPlayer(
  roomId: string,
  playerId: string,
  organizerToken: string,
): Promise<{ error?: string }> {
  if (isE2EAuctionFixtureEnabled()) {
    return awardFixturePlayer(roomId, playerId);
  }
  const authError = await requireRoomOrganizer(roomId, organizerToken);
  if (authError) return { error: authError };
  return awardPlayerInternal(roomId, playerId);
}

async function awardPlayerInternal(
  roomId: string,
  playerId: string,
): Promise<{ error?: string }> {
  try {
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
      const timerEndsAt = roomData.timer_ends_at ?? null;

      // 타이머가 아직 살아있으면 처리 안 함 (레이스 컨디션 방어)
      if (timerEndsAt && timerEndsAt.toMillis() > Date.now()) return;
      // 멱등성: 이미 처리된 선수
      if (status === "SOLD" || status === "UNSOLD") return;
      if (roomData.current_player_id !== playerId) return;

      let teamRef: DocumentReference | null = null;
      let teamData: DocumentData | null = null;
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
        const nextPointBalance = teamData.point_balance - (topBid.amount as number);
        const nextRosterSlotsUsed = getNextRosterSlotsUsed(teamData);
        tx.update(playerRef, {
          status: "SOLD",
          team_id: topBid.team_id,
          sold_price: topBid.amount,
        });
        tx.update(teamRef, {
          point_balance: nextPointBalance,
          roster_slots_used: nextRosterSlotsUsed,
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
            point_balance: nextPointBalance,
            roster_slots_used: nextRosterSlotsUsed,
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
      if (event.type === "PLAYER_AWARDED") {
        pruneAuctionEventHistory(roomId, event.revision);
      }
      // RTDB 입찰 내역 정리 (fire-and-forget)
      getAuctionServerServices()
        .rtdb.ref(`bids/${roomId}/${playerId}`)
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
      return recoverFixtureExpiredAuction(roomId);
    }
    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return { error: "방을 찾을 수 없습니다." };

    const roomData = roomSnap.data() as AuctionRoomState;
    const playerId = roomData.current_player_id as string | null | undefined;
    const timerEndsAt = roomData.timer_ends_at as
      | Timestamp
      | null
      | undefined;

    if (!playerId || !timerEndsAt) {
      return { recovered: false };
    }

    if (timerEndsAt.toMillis() > Date.now()) {
      return { recovered: false };
    }

    if (normalizeAuctionMode(roomData.auction_mode) === "SEALED_BID") {
      const result = await lockSealedBidRoundInternal(roomId);
      if (result.error) return result;
      return { recovered: !!result.locked };
    }

    const result = await awardPlayerInternal(roomId, playerId);
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
  organizerToken: string,
): Promise<{ error?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return draftFixturePlayer(roomId, playerId, teamId);
    }
    const authError = await requireRoomOrganizer(roomId, organizerToken);
    if (authError) return { error: authError };

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

    const roomSnap = await getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .get();
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
    let finalIsLastSlot = isLastSlot;
    let finalRosterSlotsUsed = Math.max(
      0,
      Number(teamData.roster_slots_used ?? soldCountSnap.size),
    );
    let draftEvent: AuctionEventEnvelope | null = null;

    await getAuctionFirestore().runTransaction(async (tx) => {
      const freshTeamSnap = await tx.get(teamRef);
      const freshPlayerSnap = await tx.get(
        getAuctionFirestore()
          .collection("rooms")
          .doc(roomId)
          .collection("players")
          .doc(playerId),
      );

      if (!freshTeamSnap.exists) {
        throw new Error("팀을 찾을 수 없습니다.");
      }
      if (!freshPlayerSnap.exists) {
        throw new Error("선수를 찾을 수 없습니다.");
      }

      const freshTeamData = freshTeamSnap.data()!;
      const freshPlayerData = freshPlayerSnap.data()!;
      const freshRosterSlotsUsed = Math.max(
        0,
        Number(freshTeamData.roster_slots_used ?? soldCountSnap.size),
      );
      if (
        freshPlayerData.status !== "UNSOLD" &&
        freshPlayerData.status !== "WAITING"
      ) {
        throw new Error("영입 요청할 수 없는 상태의 선수입니다.");
      }
      if (freshRosterSlotsUsed >= auctionSlotsPerTeam) {
        throw new Error("팀 인원이 가득 찼습니다.");
      }

      finalIsLastSlot = freshRosterSlotsUsed === auctionSlotsPerTeam - 1;
      const transactionDraftPrice = finalIsLastSlot
        ? freshTeamData.point_balance
        : 0;
      finalDraftPrice = transactionDraftPrice;
      finalPointBalance =
        transactionDraftPrice > 0 ? 0 : freshTeamData.point_balance;
      const nextRosterSlotsUsed = freshRosterSlotsUsed + 1;
      finalRosterSlotsUsed = nextRosterSlotsUsed;

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
            roster_slots_used: nextRosterSlotsUsed,
          },
        },
      );

      tx.update(freshPlayerSnap.ref, {
        status: "SOLD",
        team_id: teamId,
        sold_price: transactionDraftPrice,
      });

      tx.update(teamRef, {
        point_balance: finalPointBalance,
        roster_slots_used: nextRosterSlotsUsed,
      });
      tx.update(
        getAuctionFirestore().collection("rooms").doc(roomId),
        roomPatch,
      );
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
          roster_slots_used: finalRosterSlotsUsed,
        },
      } as AuctionEventEnvelope;
      await publishAuctionEvent(event);
      queueSystemMessage(
        roomId,
        finalIsLastSlot
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

