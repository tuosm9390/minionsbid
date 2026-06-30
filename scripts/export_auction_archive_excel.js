// auction archive 완료 팀장 데이터를 엑셀 파일로 추출한다.
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { cert, getApp, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const XLSX = require("xlsx-js-style");

const DEFAULT_ARCHIVE_ID = "c45A1cRNXiWbHXj41Tgt";
const DEFAULT_OUT_DIR = "results";
const TEAMS_PER_SIDE = 4;
const ROSTER_ROWS_PER_TEAM = 5;
const GAP_ROWS = 1;
const HEADER_ROW = 0;
const FIRST_TEAM_ROW = 3;
const BLUE_START_COLUMN = 0;
const CENTER_COLUMN = 2;
const RED_START_COLUMN = 3;
const BLUE_HEADER = "블루";
const RED_HEADER = "레드";
const BLUE_HEADER_FILL = "243C91";
const RED_HEADER_FILL = "A71919";
const BLUE_TEAM_FILL = "D8E6F7";
const RED_TEAM_FILL = "F8DADA";
const WHITE_FILL = "FFFFFF";
const BLACK = "000000";
const WHITE = "FFFFFF";

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
      name: getNicknameOnly(team?.name) || `${index + 1}팀`,
      leaderName,
      players,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "ko-KR", { numeric: true }));
}

function makeBorder(style = "thin") {
  return {
    top: { style, color: { rgb: BLACK } },
    right: { style, color: { rgb: BLACK } },
    bottom: { style, color: { rgb: BLACK } },
    left: { style, color: { rgb: BLACK } },
  };
}

function makeStyle({ fill, fontColor = BLACK, bold = false, fontSize = 11, borderStyle = "thin" }) {
  return {
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: makeBorder(borderStyle),
    fill: { patternType: "solid", fgColor: { rgb: fill } },
    font: {
      name: "맑은 고딕",
      sz: fontSize,
      bold,
      color: { rgb: fontColor },
    },
  };
}

function makeCell(value, style) {
  return {
    v: value,
    t: "s",
    s: style,
  };
}

function setCell(sheet, row, column, value, style) {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  sheet[address] = makeCell(value, style);
}

function getTeamPosition(teamIndex) {
  const isBlueSide = teamIndex < TEAMS_PER_SIDE;
  const rowGroup = teamIndex % TEAMS_PER_SIDE;

  return {
    isBlueSide,
    startColumn: isBlueSide ? BLUE_START_COLUMN : RED_START_COLUMN,
    startRow: FIRST_TEAM_ROW + rowGroup * (ROSTER_ROWS_PER_TEAM + GAP_ROWS),
  };
}

function getTotalRows() {
  return FIRST_TEAM_ROW + TEAMS_PER_SIDE * ROSTER_ROWS_PER_TEAM + (TEAMS_PER_SIDE - 1) * GAP_ROWS;
}

function buildWorkbook(teams) {
  const sheet = {};
  const headerBlueStyle = makeStyle({ fill: BLUE_HEADER_FILL, fontColor: WHITE, bold: true, fontSize: 24, borderStyle: "medium" });
  const headerRedStyle = makeStyle({ fill: RED_HEADER_FILL, fontColor: WHITE, bold: true, fontSize: 24, borderStyle: "medium" });
  const blueTeamStyle = makeStyle({ fill: BLUE_TEAM_FILL, bold: true, fontSize: 15, borderStyle: "medium" });
  const redTeamStyle = makeStyle({ fill: RED_TEAM_FILL, bold: true, fontSize: 15, borderStyle: "medium" });
  const rosterStyle = makeStyle({ fill: WHITE_FILL, fontSize: 10 });
  const vsStyle = makeStyle({ fill: WHITE_FILL, bold: true, fontSize: 13 });
  const visibleTeams = teams.slice(0, TEAMS_PER_SIDE * 2);
  const totalRows = getTotalRows();

  setCell(sheet, HEADER_ROW, BLUE_START_COLUMN, BLUE_HEADER, headerBlueStyle);
  setCell(sheet, HEADER_ROW, BLUE_START_COLUMN + 1, "", headerBlueStyle);
  setCell(sheet, HEADER_ROW, RED_START_COLUMN, RED_HEADER, headerRedStyle);
  setCell(sheet, HEADER_ROW, RED_START_COLUMN + 1, "", headerRedStyle);
  setCell(sheet, 12, CENTER_COLUMN, "V", vsStyle);
  setCell(sheet, 13, CENTER_COLUMN, "S", vsStyle);

  for (let teamIndex = 0; teamIndex < visibleTeams.length; teamIndex += 1) {
    const team = visibleTeams[teamIndex];
    const { isBlueSide, startColumn, startRow } = getTeamPosition(teamIndex);
    const teamStyle = isBlueSide ? blueTeamStyle : redTeamStyle;

    for (let rowOffset = 0; rowOffset < ROSTER_ROWS_PER_TEAM; rowOffset += 1) {
      setCell(sheet, startRow + rowOffset, startColumn, rowOffset === 0 ? `${teamIndex + 1}팀` : "", teamStyle);
      setCell(sheet, startRow + rowOffset, startColumn + 1, team.players[rowOffset] ?? "", rosterStyle);
    }
  }

  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: totalRows - 1, c: RED_START_COLUMN + 1 },
  });
  sheet["!merges"] = [
    { s: { r: HEADER_ROW, c: BLUE_START_COLUMN }, e: { r: HEADER_ROW, c: BLUE_START_COLUMN + 1 } },
    { s: { r: HEADER_ROW, c: RED_START_COLUMN }, e: { r: HEADER_ROW, c: RED_START_COLUMN + 1 } },
    ...Array.from({ length: visibleTeams.length }, (_, teamIndex) => {
      const { startColumn, startRow } = getTeamPosition(teamIndex);
      return {
        s: { r: startRow, c: startColumn },
        e: { r: startRow + ROSTER_ROWS_PER_TEAM - 1, c: startColumn },
      };
    }),
  ];
  sheet["!cols"] = [
    { wch: 9 },
    { wch: 27 },
    { wch: 3 },
    { wch: 9 },
    { wch: 27 },
  ];
  sheet["!rows"] = Array.from({ length: totalRows }, (_, rowIndex) => ({
    hpt: rowIndex === HEADER_ROW ? 34 : 17,
  }));

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
