// auction archive 완료 팀장 데이터를 엑셀 파일로 추출한다.
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { cert, getApp, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const XLSX = require("xlsx");

const DEFAULT_ARCHIVE_ID = "c45A1cRNXiWbHXj41Tgt";
const DEFAULT_OUT_DIR = "results";
const TEAMS_PER_COLUMN = 4;
const TEAM_AREA_WIDTH = 2;
const GAP_COLUMNS = 1;
const GAP_ROWS = 1;

function normalizePrivateKey(privateKey) {
  return privateKey.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
}

function initializeAdmin() {
  if (getApps().length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin 환경 변수가 부족합니다. .env.local을 확인하세요.");
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail: clientEmail.trim().replace(/^["']|["']$/g, ""),
      privateKey: normalizePrivateKey(privateKey),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

function parseArgs(argv) {
  const args = {
    archiveId: DEFAULT_ARCHIVE_ID,
    outPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--archive-id") {
      args.archiveId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--out") {
      args.outPath = argv[index + 1];
      index += 1;
      continue;
    }
  }

  if (!args.archiveId) {
    throw new Error("사용법: node scripts/export_auction_archive_excel.js [--archive-id <id>] [--out <xlsx-path>]");
  }

  return args;
}

function getNicknameOnly(name) {
  if (typeof name !== "string") return "";
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.split("#")[0].trim();
}

function normalizeTeams(data) {
  const teams = Array.isArray(data?.result_snapshot) ? data.result_snapshot : [];

  return teams.map((team, index) => {
    const leaderName = getNicknameOnly(team?.leader_name) || getNicknameOnly(team?.name) || `${index + 1}팀`;
    const players = Array.isArray(team?.players)
      ? team.players
          .map((player) => getNicknameOnly(player?.name))
          .filter(Boolean)
          .slice(0, 5)
      : [];

    return {
      leaderName,
      players,
    };
  });
}

function makeCell(value) {
  return {
    v: value,
    t: "s",
    s: {
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
      },
      fill: { patternType: "solid", fgColor: { rgb: "D9E1F2" } },
      font: { name: "맑은 고딕", sz: 11, color: { rgb: "000000" } },
    },
  };
}

function setCell(sheet, row, column, value) {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  sheet[address] = makeCell(value);
}

function getBlockHeight(teams) {
  const maxPlayers = teams.reduce((max, team) => Math.max(max, team.players.length), 0);
  return Math.max(maxPlayers, 5);
}

function placeTeam(sheet, team, teamIndex, blockHeight) {
  const columnGroup = teamIndex < TEAMS_PER_COLUMN ? 0 : 1;
  const rowGroup = teamIndex % TEAMS_PER_COLUMN;
  const startColumn = columnGroup * (TEAM_AREA_WIDTH + GAP_COLUMNS);
  const startRow = rowGroup * (blockHeight + GAP_ROWS);

  for (let rowOffset = 0; rowOffset < blockHeight; rowOffset += 1) {
    setCell(sheet, startRow + rowOffset, startColumn, rowOffset === 0 ? team.leaderName : "");
    setCell(sheet, startRow + rowOffset, startColumn + 1, team.players[rowOffset] ?? "");
  }
}

function buildWorkbook(teams) {
  const sheet = {};
  const blockHeight = getBlockHeight(teams);
  const totalRows = TEAMS_PER_COLUMN * blockHeight + (TEAMS_PER_COLUMN - 1) * GAP_ROWS;
  const totalColumns = TEAM_AREA_WIDTH * 2 + GAP_COLUMNS;

  for (let index = 0; index < Math.min(teams.length, TEAMS_PER_COLUMN * 2); index += 1) {
    placeTeam(sheet, teams[index], index, blockHeight);
  }

  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: totalRows - 1, c: totalColumns - 1 },
  });
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 24 },
    { wch: 4 },
    { wch: 18 },
    { wch: 24 },
  ];
  sheet["!rows"] = Array.from({ length: totalRows }, () => ({ hpt: 22 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "팀장 결과");
  return workbook;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  initializeAdmin();

  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  const db = databaseId ? getFirestore(getApp(), databaseId) : getFirestore(getApp());
  const snapshot = await db.collection("auction_archives").doc(args.archiveId).get();

  if (!snapshot.exists) {
    throw new Error(`auction_archives/${args.archiveId} 문서를 찾을 수 없습니다.`);
  }

  const teams = normalizeTeams(snapshot.data());
  if (teams.length === 0) {
    throw new Error(`auction_archives/${args.archiveId} 문서에 result_snapshot 팀 데이터가 없습니다.`);
  }

  const outputPath = path.resolve(
    args.outPath ?? path.join(DEFAULT_OUT_DIR, `auction-archive-${args.archiveId}-leaders.xlsx`),
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(buildWorkbook(teams), outputPath, { bookType: "xlsx" });

  console.log(
    JSON.stringify(
      {
        ok: true,
        archiveId: args.archiveId,
        outputPath,
        teamCount: teams.length,
        playerCount: teams.reduce((sum, team) => sum + team.players.length, 0),
        firstLeader: teams[0]?.leaderName ?? null,
        firstMembers: teams[0]?.players.slice(0, 3) ?? [],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
