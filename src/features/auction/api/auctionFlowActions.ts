"use server";

import * as admin from "firebase-admin";
import {
  getAuctionSlotsPerTeam,
  normalizeCaptainMode,
} from "@/features/auction/utils/roster";
import type { AuctionEventEnvelope } from "@/features/auction/utils/auctionRealtime";
import { getAuctionServerServices } from "@/features/auction/realtime/serverAdapter";
import {
  awardFixturePlayer,
  closeFixtureLottery,
  draftFixturePlayer,
  drawFixtureNextPlayer,
  isE2EAuctionFixtureEnabled,
  placeFixtureBid,
  recoverFixtureExpiredAuction,
  restartFixtureAuctionWithUnsold,
  startFixtureAuction,
} from "@/features/auction/api/e2eAuctionFixture";

// ---------- 상수 ----------

const AUCTION_DURATION_MS = 10_000;
const EXTEND_THRESHOLD_MS = 5_000;
const EXTEND_DURATION_MS = 5_000;
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

// ---------- 내부 헬퍼 ----------

async function sysMsg(roomId: string, content: string): Promise<void> {
  const createdAt = new Date().toISOString();
  const { rtdb } = getAuctionServerServices();
  const eventId = `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await Promise.all([
    getAuctionFirestore().collection("rooms").doc(roomId).collection("messages").add({
      event_id: eventId,
      sender_name: "시스템",
      sender_role: "SYSTEM",
      content,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    }),
    rtdb.ref(`signals/${roomId}/latestMessage`).set({
      id: eventId,
      event_id: eventId,
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
  await rtdb.ref(`signals/${event.roomId}/auctionEvent`).set(event);
}

function createAuctionEvent(
  roomId: string,
  type: AuctionEventEnvelope["type"],
  overrides: Partial<AuctionEventEnvelope> = {},
): AuctionEventEnvelope {
  return {
    eventId: `${type.toLowerCase()}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    revision: Date.now(),
    roomId,
    type,
    serverCreatedAt: new Date().toISOString(),
    ...overrides,
  };
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

    const roomData = roomSnap.data()!;
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

    await getAuctionFirestore().runTransaction(async (tx) => {
      tx.update(picked.ref, { status: "IN_AUCTION" });
      tx.update(roomRef, { current_player_id: picked.id });
    });

    await publishAuctionEvent(
      createAuctionEvent(roomId, "LOTTERY_DRAWN", {
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
      }),
    );

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
    const timerEndsAt = new Date(Date.now() + durationMs);
    await getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .update({
        timer_ends_at: admin.firestore.Timestamp.fromDate(timerEndsAt),
      });
    await publishAuctionEvent(
      createAuctionEvent(roomId, "AUCTION_STARTED", {
        timerEndsAt: timerEndsAt.toISOString(),
      }),
    );
    await sysMsg(roomId, "⏱️ 경매가 시작되었습니다!");
    return { timerEndsAt: timerEndsAt.toISOString() };
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
    await getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .update({ timer_ends_at: null });
    await publishAuctionEvent(
      createAuctionEvent(roomId, "AUCTION_PAUSED", {
        timerEndsAt: null,
      }),
    );
    await sysMsg(roomId, "⚠️ 팀장 연결이 끊겼습니다. 경매가 일시 정지됩니다.");
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
    const timerEndsAt = new Date(Date.now() + EXTEND_DURATION_MS);
    await getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .update({
        timer_ends_at: admin.firestore.Timestamp.fromDate(timerEndsAt),
      });
    await publishAuctionEvent(
      createAuctionEvent(roomId, "AUCTION_RESUMED", {
        timerEndsAt: timerEndsAt.toISOString(),
      }),
    );
    await sysMsg(
      roomId,
      "✅ 팀장이 재연결되었습니다. 5초 후 경매가 재개됩니다.",
    );
    return { timerEndsAt: timerEndsAt.toISOString() };
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
    await sysMsg(roomId, `🎲 ${playerName} 선수 추첨!`);
    await publishAuctionEvent(
      createAuctionEvent(roomId, "LOTTERY_CLOSED"),
    );
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
  debug?: {
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
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return { error: "방을 찾을 수 없습니다." };
    const roomData = roomSnap.data()!;

    const timerField =
      roomData.timer_ends_at as admin.firestore.Timestamp | null;
    if (!timerField) return { error: "경매가 진행 중이지 않습니다." };
    if (timerField.toMillis() - Date.now() < -500)
      return { error: "경매 시간이 종료되었습니다." };

    if (roomData.current_player_id !== playerId) {
      return { error: "현재 경매 중인 선수가 아닙니다." };
    }

    const [topBidSnap, teamSnap, soldCountSnap] = await Promise.all([
      getAuctionFirestore()
        .collection("rooms")
        .doc(roomId)
        .collection("bids")
        .where("player_id", "==", playerId)
        .orderBy("amount", "desc")
        .limit(1)
        .get(),
      getAuctionFirestore().collection("rooms").doc(roomId).collection("teams").doc(teamId).get(),
      getAuctionFirestore()
        .collection("rooms")
        .doc(roomId)
        .collection("players")
        .where("team_id", "==", teamId)
        .where("status", "==", "SOLD")
        .get(),
    ]);

    const topBid = topBidSnap.empty ? null : topBidSnap.docs[0].data();

    if (topBid && topBid.team_id === teamId) {
      return { error: "현재 최고 입찰자입니다. 추가 입찰이 불가합니다." };
    }

    const minBid = topBid ? topBid.amount + 10 : 10;
    if (amount < minBid) return { error: `최소 입찰액은 ${minBid}P입니다.` };

    if (!teamSnap.exists) return { error: "팀을 찾을 수 없습니다." };
    const teamData = teamSnap.data()!;
    if (teamData.point_balance < amount) {
      return { error: `포인트 부족 (보유: ${teamData.point_balance}P)` };
    }

    const membersPerTeam = roomData.members_per_team ?? 5;
    const captainMode = normalizeCaptainMode(roomData.captain_mode);
    const auctionSlotsPerTeam = getAuctionSlotsPerTeam(
      membersPerTeam,
      captainMode,
    );

    if (soldCountSnap.size >= auctionSlotsPerTeam) {
      return { error: "팀 인원이 가득 찼습니다." };
    }
    const validationDoneAt = nowMs();

    await getAuctionFirestore().collection("rooms").doc(roomId).collection("bids").add({
      player_id: playerId,
      team_id: teamId,
      room_id: roomId,
      amount,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    const bidPersistedAt = nowMs();

    let newTimerEndsAt: string | undefined;
    let timerExtendedAt: number | undefined;
    let timerSignalSentAt: number | undefined;
    const liveBid = {
      player_id: playerId,
      team_id: teamId,
      amount,
      created_at: new Date().toISOString(),
    };

    const currentRemaining = timerField.toMillis() - Date.now();
    if (currentRemaining < EXTEND_THRESHOLD_MS) {
      const extended = new Date(Date.now() + EXTEND_DURATION_MS);
      await roomRef.update({
        timer_ends_at: admin.firestore.Timestamp.fromDate(extended),
      });
      newTimerEndsAt = extended.toISOString();
      timerExtendedAt = nowMs();
    }

    await publishAuctionEvent(
      createAuctionEvent(roomId, "BID_PLACED", {
        liveBid,
        timerEndsAt: newTimerEndsAt ?? timerField.toDate().toISOString(),
      }),
    );
    timerSignalSentAt = nowMs();

    await sysMsg(roomId, `💰 ${teamData.name}이 ${amount}P에 입찰했습니다!`);
    const messagePersistedAt = nowMs();
    const serverCompletedAt = nowMs();

    logLatency("placeBid", {
      roomId,
      teamId,
      amount,
      totalMs: serverCompletedAt - serverReceivedAt,
      validationMs: validationDoneAt - serverReceivedAt,
      bidPersistMs: bidPersistedAt - validationDoneAt,
      timerExtendMs:
        timerExtendedAt && bidPersistedAt
          ? timerExtendedAt - bidPersistedAt
          : null,
      timerSignalMs:
        timerSignalSentAt && timerExtendedAt
          ? timerSignalSentAt - timerExtendedAt
          : null,
      messagePersistMs: messagePersistedAt - (timerSignalSentAt ?? bidPersistedAt),
    });

    return {
      timerEndsAt: newTimerEndsAt,
      debug: {
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
    // Transaction 외부에서 bids 조회 (Transaction 내 collection query 불가)
    const topBidSnap = await getAuctionFirestore()
      .collection("rooms")
      .doc(roomId)
      .collection("bids")
      .where("player_id", "==", playerId)
      .orderBy("amount", "desc")
      .limit(1)
      .get();
    const topBid = topBidSnap.empty ? null : topBidSnap.docs[0].data();

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
      const roomData = roomSnap.data();
      const timerEndsAt =
        roomData?.timer_ends_at as admin.firestore.Timestamp | null;

      // 타이머가 아직 살아있으면 처리 안 함 (레이스 컨디션 방어)
      if (timerEndsAt && timerEndsAt.toMillis() > Date.now()) return;
      // 멱등성: 이미 처리된 선수
      if (status === "SOLD" || status === "UNSOLD") return;

      let teamRef: admin.firestore.DocumentReference | null = null;
      let teamData: admin.firestore.DocumentData | null = null;

      if (topBid) {
        teamRef = getAuctionFirestore()
          .collection("rooms")
          .doc(roomId)
          .collection("teams")
          .doc(topBid.team_id as string);
        const teamSnap = await tx.get(teamRef);
        teamData = teamSnap.data()!;
      }

      // ── 모든 쓰기를 이후에 수행 ──
      tx.update(roomRef, { current_player_id: null, timer_ends_at: null });

      if (topBid && teamRef && teamData) {
        tx.update(playerRef, {
          status: "SOLD",
          team_id: topBid.team_id,
          sold_price: topBid.amount,
        });
        tx.update(teamRef, {
          point_balance: teamData.point_balance - (topBid.amount as number),
        });
        awardEvent = createAuctionEvent(roomId, "PLAYER_AWARDED", {
          timerEndsAt: null,
          liveBid: null,
          player: {
            id: playerId,
            status: "SOLD",
            team_id: topBid.team_id as string,
            sold_price: topBid.amount as number,
          },
          team: {
            id: topBid.team_id as string,
            point_balance: teamData.point_balance - (topBid.amount as number),
          },
        });
        msgContent = `🏆 ${teamData.name}이 ${playerData.name} 선수를 ${topBid.amount}P에 낙찰!`;
      } else {
        tx.update(playerRef, { status: "UNSOLD" });
        awardEvent = createAuctionEvent(roomId, "PLAYER_UNSOLD", {
          timerEndsAt: null,
          liveBid: null,
          player: {
            id: playerId,
            status: "UNSOLD",
            team_id: null,
            sold_price: null,
          },
        });
        msgContent = `❌ ${playerData.name} 선수 유찰`;
      }
    });

    if (awardEvent) {
      await publishAuctionEvent(awardEvent);
    }
    if (msgContent) await sysMsg(roomId, msgContent);
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

    const roomData = roomSnap.data()!;
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
    const membersPerTeam = roomSnap.data()?.members_per_team ?? 5;
    const captainMode = normalizeCaptainMode(roomSnap.data()?.captain_mode);
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
    });

    await publishAuctionEvent(
      createAuctionEvent(roomId, "DRAFT_ASSIGNED", {
        player: {
          id: playerId,
          status: "SOLD",
          team_id: teamId,
          sold_price: finalDraftPrice,
        },
        team: {
          id: teamId,
          point_balance: finalPointBalance,
        },
      }),
    );

    await sysMsg(
      roomId,
      isLastSlot
        ? `🤝 ${teamData.name}이(가) ${playerData.name} 선수를 ${finalDraftPrice}P에 드래프트 영입!`
        : `🤝 ${teamData.name}이(가) ${playerData.name} 선수를 자유계약으로 영입!`,
    );
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

    const batch = getAuctionFirestore().batch();
    for (const doc of unsoldSnap.docs) {
      batch.update(doc.ref, { status: "WAITING" });
    }
    await batch.commit();

    await publishAuctionEvent(
      createAuctionEvent(roomId, "RE_AUCTION_STARTED", {
        playerIdsToWaiting: unsoldSnap.docs.map((doc) => doc.id),
      }),
    );

    await sysMsg(
      roomId,
      `🔄 유찰 선수 재경매를 시작합니다! (${unsoldSnap.size}명)`,
    );
    return { reAuctionStarted: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}
