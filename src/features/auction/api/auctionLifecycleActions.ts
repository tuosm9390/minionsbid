"use server";

// 경매 시작/일시정지/재개/재경매(restartAuctionWithUnsold) 서버 액션
import { Timestamp } from "firebase-admin/firestore";
import { normalizeAuctionMode } from "@/features/auction/utils/auctionMode";
import type { AuctionEventEnvelope } from "@/features/auction/utils/auctionRealtime";
import {
  isE2EAuctionFixtureEnabled,
  pauseFixtureAuction,
  restartFixtureAuctionWithUnsold,
  resumeFixtureAuction,
  startFixtureAuction,
} from "@/features/auction/api/e2eAuctionFixture";
import {
  AUCTION_DURATION_MS,
  EXTEND_DURATION_MS,
  RE_AUCTION_DURATION_MS,
} from "@/features/auction/constants/auctionTimings";
import { requireRoomOrganizer } from "@/features/auction/api/organizerAuth";
import {
  getAuctionFirestore,
  publishAuctionEvent,
  createAuctionEventPatch,
  toTimestamp,
  queueSystemMessage,
  startSealedBidRound,
  type AuctionRoomState,
} from "./auctionFlowShared";
/** 경매 시작 — timer_ends_at 설정 */
export async function startAuction(
  roomId: string,
  organizerToken: string,
  durationMs: number = AUCTION_DURATION_MS,
): Promise<{ error?: string; timerEndsAt?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return startFixtureAuction(roomId, durationMs);
    }
    const authError = await requireRoomOrganizer(roomId, organizerToken);
    if (authError) return { error: authError };

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
      const rebidReadyTeamIds =
        roomData.sealed_bid_phase === null
          ? (roomData.sealed_bid_eligible_team_ids ?? null)
          : null;
      return startSealedBidRound(roomId, {
        durationMs,
        minAmount: rebidReadyTeamIds
          ? (roomData.sealed_bid_min_amount ?? 0)
          : 0,
        eligibleTeamIds: rebidReadyTeamIds,
      });
    }
    let startEvent: AuctionEventEnvelope | null = null;
    let resolvedTimerEndsAt: string | undefined;
    await getAuctionFirestore().runTransaction(async (tx) => {
      const freshRoomSnap = await tx.get(roomRef);
      const freshRoomData = (freshRoomSnap.data() ?? {}) as AuctionRoomState;
      const freshPlayerId = freshRoomData.current_player_id ?? null;
      if (!freshPlayerId) {
        throw new Error("현재 경매 중인 선수가 없습니다.");
      }
      const nextDurationMs =
        freshRoomData.next_auction_duration_ms ?? durationMs;
      // 타이머 시작 시간은 서버 시간 기준으로 정확히 10초(또는 지정된 시간) 뒤
      const timerEndsAt = new Date(Date.now() + nextDurationMs);
      resolvedTimerEndsAt = timerEndsAt.toISOString();

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
        timer_ends_at: Timestamp.fromDate(timerEndsAt),
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
  organizerToken: string,
): Promise<{ error?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return pauseFixtureAuction(roomId);
    }
    const authError = await requireRoomOrganizer(roomId, organizerToken);
    if (authError) return { error: authError };

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
  organizerToken: string,
): Promise<{ error?: string; timerEndsAt?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return resumeFixtureAuction(roomId);
    }
    const authError = await requireRoomOrganizer(roomId, organizerToken);
    if (authError) return { error: authError };

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
        timer_ends_at: Timestamp.fromDate(timerEndsAt),
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

/** UNSOLD 선수 전부 WAITING으로 전환 (재경매) */
export async function restartAuctionWithUnsold(
  roomId: string,
  organizerToken: string,
): Promise<{ error?: string; reAuctionStarted?: boolean }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return restartFixtureAuctionWithUnsold(roomId);
    }
    const authError = await requireRoomOrganizer(roomId, organizerToken);
    if (authError) return { error: authError };

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
