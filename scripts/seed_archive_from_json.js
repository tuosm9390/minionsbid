require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

function initializeAdmin() {
  if (admin.apps.length) return;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL.replace(/"/g, ""),
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/"/g, "").replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

function parseArgs(argv) {
  const args = { jsonPath: null, dryRun: false };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (!args.jsonPath) {
      args.jsonPath = arg;
    }
  }

  if (!args.jsonPath) {
    throw new Error("사용법: node scripts/seed_archive_from_json.js <json-file> [--dry-run]");
  }

  return args;
}

function readJsonFile(jsonPath) {
  const absolutePath = path.resolve(jsonPath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return {
    absolutePath,
    data: JSON.parse(raw),
  };
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} 값이 비어 있습니다.`);
  }
  return value.trim();
}

function assertNullableString(value, label) {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new Error(`${label} 값은 문자열 또는 null 이어야 합니다.`);
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizePlayer(player, index) {
  if (!player || typeof player !== "object") {
    throw new Error(`players[${index}] 데이터 형식이 올바르지 않습니다.`);
  }

  return {
    name: assertString(player.name, `players[${index}].name`),
    tier: typeof player.tier === "string" ? player.tier : "",
    main_position: typeof player.main_position === "string" ? player.main_position : "",
    sub_position: typeof player.sub_position === "string" ? player.sub_position : "",
    sold_price: typeof player.sold_price === "number" ? player.sold_price : null,
  };
}

function normalizeTeam(team, index) {
  if (!team || typeof team !== "object") {
    throw new Error(`result_snapshot[${index}] 데이터 형식이 올바르지 않습니다.`);
  }

  const players = Array.isArray(team.players)
    ? team.players.map((player, playerIndex) => normalizePlayer(player, playerIndex))
    : [];

  return {
    id: assertString(team.id, `result_snapshot[${index}].id`),
    name: assertString(team.name, `result_snapshot[${index}].name`),
    leader_name: typeof team.leader_name === "string" ? team.leader_name : "",
    point_balance: typeof team.point_balance === "number" ? team.point_balance : 0,
    players,
  };
}

function buildArchiveDocument(payload) {
  const archiveId = assertString(payload.archive_id, "auctionArchiveDraft.archive_id");
  const closedAt = assertString(payload.closed_at, "auctionArchiveDraft.closed_at");
  const closedAtDate = new Date(closedAt);

  if (Number.isNaN(closedAtDate.getTime())) {
    throw new Error("auctionArchiveDraft.closed_at 값이 올바른 날짜가 아닙니다.");
  }

  const teams = Array.isArray(payload.result_snapshot)
    ? payload.result_snapshot.map((team, index) => normalizeTeam(team, index))
    : [];

  if (teams.length === 0) {
    throw new Error("auctionArchiveDraft.result_snapshot 이 비어 있습니다.");
  }

  return {
    archiveId,
    doc: {
      room_id: assertString(payload.room_id, "auctionArchiveDraft.room_id"),
      room_name: assertString(payload.room_name, "auctionArchiveDraft.room_name"),
      schedule_id: assertNullableString(payload.schedule_id, "auctionArchiveDraft.schedule_id"),
      schedule_name: assertNullableString(payload.schedule_name, "auctionArchiveDraft.schedule_name"),
      linked_auction_id: assertNullableString(
        payload.linked_auction_id,
        "auctionArchiveDraft.linked_auction_id"
      ),
      linked_league_name: assertNullableString(
        payload.linked_league_name,
        "auctionArchiveDraft.linked_league_name"
      ),
      room_created_at: assertNullableString(
        payload.room_created_at,
        "auctionArchiveDraft.room_created_at"
      ),
      closed_at: admin.firestore.Timestamp.fromDate(closedAtDate),
      result_snapshot: teams,
    },
  };
}

async function main() {
  const { jsonPath, dryRun } = parseArgs(process.argv.slice(2));
  const { absolutePath, data } = readJsonFile(jsonPath);
  const draft = data?.auctionArchiveDraft;

  if (!draft || typeof draft !== "object") {
    throw new Error("JSON 안에 auctionArchiveDraft 객체가 없습니다.");
  }

  const { archiveId, doc } = buildArchiveDocument(draft);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          sourceFile: absolutePath,
          archiveId,
          roomName: doc.room_name,
          teamCount: doc.result_snapshot.length,
          playerCount: doc.result_snapshot.reduce((sum, team) => sum + team.players.length, 0),
        },
        null,
        2
      )
    );
    return;
  }

  initializeAdmin();

  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  const db = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore(admin.app());

  await db.collection("auction_archives").doc(archiveId).set(doc, { merge: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceFile: absolutePath,
        archiveId,
        roomName: doc.room_name,
        teamCount: doc.result_snapshot.length,
        playerCount: doc.result_snapshot.reduce((sum, team) => sum + team.players.length, 0),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
