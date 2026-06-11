import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { recoverExpiredAuction } from "@/features/auction/api/auctionActions";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    return request.headers.get("authorization") === `Bearer ${cronSecret}`;
  }

  const legacySecret = process.env.AUCTION_WATCHDOG_SECRET;
  if (legacySecret) {
    const authHeader = request.headers.get("authorization");
    const headerSecret = request.headers.get("x-auction-watchdog-secret");
    return (
      authHeader === `Bearer ${legacySecret}` || headerSecret === legacySecret
    );
  }

  return false;
}

async function runWatchdogSweep() {
  const now = admin.firestore.Timestamp.now();
  const snapshot = await adminDb
    .collection("rooms")
    .where("timer_ends_at", "<=", now)
    .get();

  const eligible = snapshot.docs.filter((roomDoc) => {
    const data = roomDoc.data() as {
      current_player_id?: string | null;
      roomDeleted?: boolean;
    };
    return !data.roomDeleted && !!data.current_player_id;
  });

  const results = await Promise.all(
    eligible.map(async (roomDoc) => {
      const result = await recoverExpiredAuction(roomDoc.id);
      return {
        roomId: roomDoc.id,
        recovered: result.recovered === true,
        error: result.error,
      };
    })
  );

  return results;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runWatchdogSweep();
  return NextResponse.json({
    ok: true,
    scanned: results.length,
    recovered: results.filter((item) => item.recovered).length,
    results,
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
