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
    throw new Error(
      "사용법: node scripts/seed_hall_of_fame_from_json.js <json-file> [--dry-run]"
    );
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

function normalizeWinningPlayer(player, index) {
  if (!player || typeof player !== "object") {
    throw new Error(`winning_team_players[${index}] 데이터 형식이 올바르지 않습니다.`);
  }

  return {
    name: assertString(player.name, `winning_team_players[${index}].name`),
    sold_price: typeof player.sold_price === "number" ? player.sold_price : null,
  };
}

function normalizeHallOfFameEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`hallOfFameTemplates[${index}] 데이터 형식이 올바르지 않습니다.`);
  }

  const players = Array.isArray(entry.winning_team_players)
    ? entry.winning_team_players.map((player, playerIndex) =>
        normalizeWinningPlayer(player, playerIndex)
      )
    : [];

  return {
    archive_id: assertString(entry.archive_id, `hallOfFameTemplates[${index}].archive_id`),
    room_id: assertString(entry.room_id, `hallOfFameTemplates[${index}].room_id`),
    season_name: assertString(entry.season_name, `hallOfFameTemplates[${index}].season_name`),
    season_label: assertNullableString(
      entry.season_label,
      `hallOfFameTemplates[${index}].season_label`
    ),
    winning_team_name: assertString(
      entry.winning_team_name,
      `hallOfFameTemplates[${index}].winning_team_name`
    ),
    winning_team_leader:
      assertNullableString(
        entry.winning_team_leader,
        `hallOfFameTemplates[${index}].winning_team_leader`
      ) ?? "",
    winning_team_players: players,
    won_at: assertNullableString(entry.won_at, `hallOfFameTemplates[${index}].won_at`),
  };
}

function buildHallOfFameEntries(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("JSON 안에 hallOfFameTemplates 배열이 없습니다.");
  }

  return payload.map((entry, index) => normalizeHallOfFameEntry(entry, index));
}

async function main() {
  const { jsonPath, dryRun } = parseArgs(process.argv.slice(2));
  const { absolutePath, data } = readJsonFile(jsonPath);
  const entries = buildHallOfFameEntries(data?.hallOfFameTemplates);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          sourceFile: absolutePath,
          entryCount: entries.length,
          archiveIds: entries.map((entry) => entry.archive_id),
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

  for (const entry of entries) {
    await db.collection("hall_of_fame").doc(entry.archive_id).set(
      {
        archive_id: entry.archive_id,
        room_id: entry.room_id,
        season_name: entry.season_name,
        season_label: entry.season_label,
        winning_team_name: entry.winning_team_name,
        winning_team_leader: entry.winning_team_leader,
        winning_team_players: entry.winning_team_players,
        won_at: entry.won_at,
        registered_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceFile: absolutePath,
        entryCount: entries.length,
        archiveIds: entries.map((entry) => entry.archive_id),
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
