"use server";

// 타이머 랩 전용 Firestore 정본과 RTDB 팬아웃 서버 액션
import * as admin from "firebase-admin";
import { getAuctionServerServices } from "@/features/auction/realtime/serverAdapter";

export type TimerLabStatus = "auction_waiting" | "auction_active" | "auction_closed";

export type TimerLabEventType = "LAB_CREATED" | "AUCTION_STARTED" | "BID_PLACED" | "AUCTION_CLOSED";

export type TimerLabEvent = {
  eventId: string;
  labId: string;
  type: TimerLabEventType;
  revision: number;
  serverCreatedAt: number;
  endsAtMs: number | null;
  status: TimerLabStatus;
  highestBidAmount: number | null;
  highestBidderNickname: string | null;
  nextMinBidAmount: number;
  message: string;
};

export type TimerLabState = {
  kind: "timer_lab";
  status: TimerLabStatus;
  itemName: string;
  startedAtMs: number | null;
  endsAtMs: number | null;
  closedAtMs: number | null;
  highestBidAmount: number | null;
  highestBidderId: string | null;
  highestBidderNickname: string | null;
  nextMinBidAmount: number;
  bidCount: number;
  revision: number;
  recentBids: TimerLabBidRecord[];
  lastEvent: TimerLabEvent | null;
  createdAtMs: number;
  expiresAtMs: number;
};

export type TimerLabBidRecord = {
  id: string;
  bidderId: string;
  bidderNickname: string;
  amount: number;
  remainingBeforeMs: number;
  timerChanged: boolean;
  createdAtMs: number;
};

type TimerLabActionResult = {
  error?: string;
  labId?: string;
};

const START_DURATION_MS = 10_000;
const EXTEND_THRESHOLD_MS = 5_000;
const EXTEND_DURATION_MS = 5_000;
const BID_STEP = 10;
const INITIAL_BID_AMOUNT = 10;
const LAB_TTL_MS = 24 * 60 * 60 * 1000;
const GENERIC_BID_ERROR = "입찰에 실패하였습니다.";

function nowMs(): number {
  return Date.now();
}

function createEventId(type: TimerLabEventType): string {
  return `${type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFirestore() {
  return getAuctionServerServices().firestore;
}

function createEvent(
  labId: string,
  type: TimerLabEventType,
  revision: number,
  state: Pick<
    TimerLabState,
    | "status"
    | "endsAtMs"
    | "highestBidAmount"
    | "highestBidderNickname"
    | "nextMinBidAmount"
  >,
  message: string,
): TimerLabEvent {
  return {
    eventId: createEventId(type),
    labId,
    type,
    revision,
    serverCreatedAt: nowMs(),
    endsAtMs: state.endsAtMs,
    status: state.status,
    highestBidAmount: state.highestBidAmount,
    highestBidderNickname: state.highestBidderNickname,
    nextMinBidAmount: state.nextMinBidAmount,
    message,
  };
}

async function publishTimerLabEvent(event: TimerLabEvent): Promise<void> {
  const { rtdb } = getAuctionServerServices();
  await Promise.all([
    rtdb.ref(`timerLabSignals/${event.labId}/auctionEvent`).set(event),
    rtdb.ref(`timerLabSignals/${event.labId}/auctionEvents/${event.eventId}`).set(event),
  ]);
}

function toTimerLabState(data: admin.firestore.DocumentData | undefined): TimerLabState | null {
  if (!data || data.kind !== "timer_lab") return null;

  return {
    kind: "timer_lab",
    status: data.status ?? "auction_waiting",
    itemName: data.itemName ?? "MID Player 01",
    startedAtMs: data.startedAtMs ?? null,
    endsAtMs: data.endsAtMs ?? null,
    closedAtMs: data.closedAtMs ?? null,
    highestBidAmount: data.highestBidAmount ?? null,
    highestBidderId: data.highestBidderId ?? null,
    highestBidderNickname: data.highestBidderNickname ?? null,
    nextMinBidAmount: data.nextMinBidAmount ?? INITIAL_BID_AMOUNT,
    bidCount: data.bidCount ?? 0,
    revision: data.revision ?? 0,
    recentBids: Array.isArray(data.recentBids) ? data.recentBids : [],
    lastEvent: data.lastEvent ?? null,
    createdAtMs: data.createdAtMs ?? nowMs(),
    expiresAtMs: data.expiresAtMs ?? nowMs() + LAB_TTL_MS,
  };
}

export async function createTimerLab(): Promise<TimerLabActionResult> {
  const createdAt = nowMs();
  const labRef = getFirestore().collection("timerLabs").doc();
  const revision = 1;
  const state: TimerLabState = {
    kind: "timer_lab",
    status: "auction_waiting",
    itemName: "MID Player 01",
    startedAtMs: null,
    endsAtMs: null,
    closedAtMs: null,
    highestBidAmount: null,
    highestBidderId: null,
    highestBidderNickname: null,
    nextMinBidAmount: INITIAL_BID_AMOUNT,
    bidCount: 0,
    revision,
    recentBids: [],
    lastEvent: null,
    createdAtMs: createdAt,
    expiresAtMs: createdAt + LAB_TTL_MS,
  };
  const event = createEvent(labRef.id, "LAB_CREATED", revision, state, "타이머 랩이 생성되었습니다.");

  await labRef.set({
    ...state,
    lastEvent: event,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await publishTimerLabEvent(event);

  return { labId: labRef.id };
}

export async function startTimerLab(labId: string): Promise<TimerLabActionResult> {
  let event: TimerLabEvent | null = null;

  await getFirestore().runTransaction(async (tx) => {
    const labRef = getFirestore().collection("timerLabs").doc(labId);
    const snap = await tx.get(labRef);
    const current = toTimerLabState(snap.data());
    if (!current) throw new Error("타이머 랩을 찾을 수 없습니다.");

    const startedAt = nowMs();
    const revision = current.revision + 1;
    const nextState: TimerLabState = {
      ...current,
      status: "auction_active",
      startedAtMs: startedAt,
      endsAtMs: startedAt + START_DURATION_MS,
      closedAtMs: null,
      highestBidAmount: null,
      highestBidderId: null,
      highestBidderNickname: null,
      nextMinBidAmount: INITIAL_BID_AMOUNT,
      bidCount: 0,
      recentBids: [],
      revision,
    };
    event = createEvent(labId, "AUCTION_STARTED", revision, nextState, "경매가 시작되었습니다.");

    tx.set(
      labRef,
      {
        ...nextState,
        lastEvent: event,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  if (event) await publishTimerLabEvent(event);
  return {};
}

export async function placeTimerLabBid(args: {
  labId: string;
  bidderId: string;
  bidderNickname: string;
  amount: number;
}): Promise<TimerLabActionResult> {
  if (!Number.isInteger(args.amount) || args.amount <= 0 || args.amount % BID_STEP !== 0) {
    return { error: GENERIC_BID_ERROR };
  }

  let event: TimerLabEvent | null = null;
  let shouldReturnBidError = false;

  await getFirestore().runTransaction(async (tx) => {
    const labRef = getFirestore().collection("timerLabs").doc(args.labId);
    const snap = await tx.get(labRef);
    const current = toTimerLabState(snap.data());
    if (!current) {
      shouldReturnBidError = true;
      return;
    }

    const receivedAt = nowMs();
    const remainingMs = (current.endsAtMs ?? 0) - receivedAt;

    if (current.status !== "auction_active" || !current.endsAtMs) {
      shouldReturnBidError = true;
      return;
    }

    if (remainingMs <= 0) {
      const revision = current.revision + 1;
      const closedState = {
        ...current,
        status: "auction_closed" as const,
        endsAtMs: current.endsAtMs,
        closedAtMs: receivedAt,
        revision,
      };
      event = createEvent(args.labId, "AUCTION_CLOSED", revision, closedState, "경매가 종료되었습니다.");
      tx.set(
        labRef,
        {
          ...closedState,
          lastEvent: event,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      shouldReturnBidError = true;
      return;
    }

    if (
      args.bidderId === "host" ||
      args.amount < current.nextMinBidAmount
    ) {
      shouldReturnBidError = true;
      return;
    }

    const timerChanged = remainingMs <= EXTEND_THRESHOLD_MS;
    const revision = current.revision + 1;
    const nextBidCount = current.bidCount + 1;
    const nextState: TimerLabState = {
      ...current,
      endsAtMs: timerChanged ? receivedAt + EXTEND_DURATION_MS : current.endsAtMs,
      highestBidAmount: args.amount,
      highestBidderId: args.bidderId,
      highestBidderNickname: args.bidderNickname,
      nextMinBidAmount: args.amount + BID_STEP,
      bidCount: nextBidCount,
      revision,
      recentBids: [
        {
          id: `${revision}-${args.bidderId}`,
          bidderId: args.bidderId,
          bidderNickname: args.bidderNickname,
          amount: args.amount,
          remainingBeforeMs: remainingMs,
          timerChanged,
          createdAtMs: receivedAt,
        },
        ...current.recentBids,
      ].slice(0, 12),
    };
    event = createEvent(
      args.labId,
      "BID_PLACED",
      revision,
      nextState,
      `${args.bidderNickname}님이 ${args.amount}에 입찰했습니다.`,
    );

    tx.set(
      labRef,
      {
        ...nextState,
        lastEvent: event,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  if (event) await publishTimerLabEvent(event);

  if (shouldReturnBidError) {
    return { error: GENERIC_BID_ERROR };
  }

  return {};
}

export async function closeExpiredTimerLab(labId: string): Promise<TimerLabActionResult> {
  let event: TimerLabEvent | null = null;

  await getFirestore().runTransaction(async (tx) => {
    const labRef = getFirestore().collection("timerLabs").doc(labId);
    const snap = await tx.get(labRef);
    const current = toTimerLabState(snap.data());
    if (!current || current.status !== "auction_active" || !current.endsAtMs) return;

    const receivedAt = nowMs();
    if (current.endsAtMs > receivedAt) return;

    const revision = current.revision + 1;
    const nextState = {
      ...current,
      status: "auction_closed" as const,
      closedAtMs: receivedAt,
      revision,
    };
    event = createEvent(labId, "AUCTION_CLOSED", revision, nextState, "경매가 종료되었습니다.");

    tx.set(
      labRef,
      {
        ...nextState,
        lastEvent: event,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  if (event) await publishTimerLabEvent(event);
  return {};
}
