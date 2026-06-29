"use server";

// 선수 추첨(drawNextPlayer)과 추첨 모달 닫기(closeLotteryAction) 서버 액션
import type { AuctionEventEnvelope } from "@/features/auction/utils/auctionRealtime";
import {
  closeFixtureLottery,
  drawFixtureNextPlayer,
  isE2EAuctionFixtureEnabled,
} from "@/features/auction/api/e2eAuctionFixture";
import { requireRoomOrganizer } from "@/features/auction/api/organizerAuth";
import {
  getAuctionFirestore,
  publishAuctionEvent,
  createAuctionEventPatch,
  toTimestamp,
  queueSystemMessage,
  type AuctionRoomState,
} from "./auctionFlowShared";

/** 랜덤으로 WAITING 선수 1명을 IN_AUCTION으로 전환 */
export async function drawNextPlayer(
  roomId: string,
  organizerToken: string,
): Promise<{ error?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return drawFixtureNextPlayer(roomId);
    }
    const authError = await requireRoomOrganizer(roomId, organizerToken);
    if (authError) return { error: authError };

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
            status: "WAITING",
          },
          lotteryPlayer: {
            id: picked.id,
            room_id: roomId,
            name: String(pickedData.name ?? ""),
            tier: String(pickedData.tier ?? ""),
            main_position: String(pickedData.main_position ?? ""),
            sub_position: String(pickedData.sub_position ?? ""),
            status: "WAITING",
            team_id: null,
            sold_price: null,
            description: String(pickedData.description ?? ""),
            aram_tier: String(pickedData.aram_tier ?? ""),
            tft_tier: String(pickedData.tft_tier ?? ""),
            desired_team: String(pickedData.desired_team ?? ""),
          },
          timerEndsAt: null,
          liveBid: null,
        },
      );
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

/** 추첨 모달 닫기 신호 — RTDB에 timestamp 기록 */
export async function closeLotteryAction(
  roomId: string,
  playerName: string,
  organizerToken: string,
): Promise<{ error?: string }> {
  try {
    if (isE2EAuctionFixtureEnabled()) {
      return closeFixtureLottery(roomId, playerName);
    }
    const authError = await requireRoomOrganizer(roomId, organizerToken);
    if (authError) return { error: authError };

    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    let closeEvent: AuctionEventEnvelope | null = null;
    await getAuctionFirestore().runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef);
      const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
      const currentPlayerId = roomData.current_player_id ?? null;
      if (currentPlayerId) {
        const playerRef = roomRef.collection("players").doc(currentPlayerId);
        tx.update(playerRef, { status: "IN_AUCTION" });
      }
      const { event, roomPatch } = createAuctionEventPatch(
        roomRef,
        roomData,
        "LOTTERY_CLOSED",
        {
          currentPlayerId,
          player: currentPlayerId
            ? { id: currentPlayerId, status: "IN_AUCTION" }
            : undefined,
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
