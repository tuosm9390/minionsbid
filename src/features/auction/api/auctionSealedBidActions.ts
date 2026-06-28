"use server";

// 비공개 입찰(sealed bid) 제출/잠금/점수공개/확정 서버 액션
import { FieldValue } from "firebase-admin/firestore";
import {
  getAuctionSlotsPerTeam,
  normalizeCaptainMode,
} from "@/features/auction/utils/roster";
import { normalizeAuctionMode } from "@/features/auction/utils/auctionMode";
import type { AuctionEventEnvelope } from "@/features/auction/utils/auctionRealtime";
import type {
  SealedBidRevealCard,
  SealedBidState,
} from "@/features/auction/store/useAuctionStore";
import { requireRoomOrganizer } from "@/features/auction/api/organizerAuth";
import { requireRoomLeader } from "@/features/auction/api/roomRoleAuth";
import {
  getAuctionFirestore,
  getNextRosterSlotsUsed,
  publishAuctionEvent,
  createAuctionEventPatch,
  queueSystemMessage,
  pruneAuctionEventHistory,
  getSealedBidPatch,
  lockSealedBidRoundInternal,
  type AuctionRoomState,
} from "./auctionFlowShared";
/** 비공개 입찰 금액 제출/수정 */
export async function submitSealedBid(
  roomId: string,
  playerId: string,
  teamId: string,
  amount: number,
  leaderToken: string = "",
): Promise<{ error?: string; submittedAmount?: number }> {
  if (!Number.isInteger(amount) || amount < 0) {
    return { error: "0 이상의 정수 금액을 입력하세요." };
  }

  try {
    const authError = await requireRoomLeader(roomId, teamId, leaderToken);
    if (authError) return { error: authError };

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
    if (
      roomData.sealed_bid_phase !== "ACTIVE" ||
      !roomData.sealed_bid_round_id
    ) {
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
      .set(
        {
          room_id: roomId,
          player_id: playerId,
          team_id: teamId,
          amount,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return { submittedAmount: amount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}

/** 비공개 입찰 타이머 만료 후 제출을 잠근다. */
export async function lockSealedBidRound(
  roomId: string,
  organizerToken: string,
): Promise<{ error?: string; locked?: boolean }> {
  const authError = await requireRoomOrganizer(roomId, organizerToken);
  if (authError) return { error: authError };
  return lockSealedBidRoundInternal(roomId);
}

/** 점수공개: 제출 결과를 집계해 공개 카드 데이터를 확정한다. */
export async function revealSealedBidRound(
  roomId: string,
  organizerToken: string,
): Promise<{ error?: string; revealResult?: SealedBidRevealCard[] }> {
  try {
    const authError = await requireRoomOrganizer(roomId, organizerToken);
    if (authError) return { error: authError };

    const roomRef = getAuctionFirestore().collection("rooms").doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return { error: "방을 찾을 수 없습니다." };

    const roomData = (roomSnap.data() ?? {}) as AuctionRoomState;
    const roundId = roomData.sealed_bid_round_id;
    if (
      normalizeAuctionMode(roomData.auction_mode) !== "SEALED_BID" ||
      !roundId
    ) {
      return { error: "비공개 입찰 라운드가 없습니다." };
    }
    if (roomData.sealed_bid_phase !== "LOCKED") {
      return { error: "점수공개 가능한 상태가 아닙니다." };
    }

    const [teamsSnap, submissionsSnap] = await Promise.all([
      roomRef.collection("teams").get(),
      roomRef
        .collection("sealed_bid_rounds")
        .doc(roundId)
        .collection("submissions")
        .get(),
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
      const amount = eligible
        ? Math.max(0, submissions.get(teamDoc.id) ?? 0)
        : 0;
      return {
        teamDoc,
        eligible,
        amount,
      };
    });
    const highestAmount = Math.max(
      0,
      ...effectiveAmounts.map((item) => item.amount),
    );
    const tiedTeamIds =
      highestAmount > 0
        ? effectiveAmounts
            .filter((item) => item.eligible && item.amount === highestAmount)
            .map((item) => item.teamDoc.id)
        : [];
    const revealResult: SealedBidRevealCard[] = effectiveAmounts.map(
      (item) => ({
        team_id: item.teamDoc.id,
        team_name: String((item.teamDoc.data() ?? {}).name ?? ""),
        amount: item.amount,
        is_pass: item.amount <= 0,
        is_highest: highestAmount > 0 && item.amount === highestAmount,
        is_tied:
          highestAmount > 0 &&
          tiedTeamIds.length > 1 &&
          item.amount === highestAmount,
        eligible: item.eligible,
      }),
    );

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
      queueSystemMessage(
        roomId,
        "🃏 비공개 입찰 점수를 공개합니다.",
        event.eventId,
      );
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
  organizerToken: string,
): Promise<{ error?: string; awarded?: boolean; rebidStarted?: boolean }> {
  try {
    const authError = await requireRoomOrganizer(roomId, organizerToken);
    if (authError) return { error: authError };

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
      await roomRef.update({
        timer_ends_at: null,
        active_bid: null,
        sealed_bid_phase: null,
        sealed_bid_min_amount: highestAmount,
        sealed_bid_eligible_team_ids: tiedTeamIds,
        sealed_bid_reveal_order: null,
        sealed_bid_reveal_result: null,
        sealed_bid_highest_amount: 0,
        sealed_bid_tied_team_ids: null,
      });
      return { rebidStarted: true };
    }

    const winnerTeamId = highestAmount > 0 ? (tiedTeamIds[0] ?? null) : null;
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
        minAmount: 0,
        eligibleTeamIds: null,
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
        sealed_bid_min_amount: 0,
        sealed_bid_eligible_team_ids: null,
        ...roomPatch,
      });

      if (winnerTeamId && winnerTeamRef && winnerTeamData) {
        const nextPointBalance =
          Number(winnerTeamData.point_balance ?? 0) - highestAmount;
        const nextRosterSlotsUsed = getNextRosterSlotsUsed(winnerTeamData);
        tx.update(playerRef, {
          status: "SOLD",
          team_id: winnerTeamId,
          sold_price: highestAmount,
        });
        tx.update(winnerTeamRef, {
          point_balance: nextPointBalance,
          roster_slots_used: nextRosterSlotsUsed,
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
            roster_slots_used: nextRosterSlotsUsed,
          },
        };
        tx.update(roomRef, { last_auction_event: awardEvent });
        msgContent = `🏆 ${winnerTeamData.name}이 ${playerData.name} 선수를 ${highestAmount}P에 낙찰!`;
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
        msgContent = `❌ ${playerData.name} 선수 입찰 포기로 유찰`;
      }
    });

    if (awardEvent) {
      const event = awardEvent as AuctionEventEnvelope;
      await publishAuctionEvent(event);
      pruneAuctionEventHistory(roomId, event.revision);
      queueSystemMessage(roomId, msgContent, event.eventId);
    }

    return { awarded: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}
