// 아카이브 상세 모달의 팀 로스터 엑셀 다운로드 데이터를 만든다.
import type { ArchiveTeam } from "@/features/auction/api/auctionActions";

const TEAMS_PER_SIDE = 4;
const ROSTER_ROWS_PER_TEAM = 5;
const TEAM_WIDTH = 2;
const GAP_COLUMNS = 1;
const GAP_ROWS = 1;
const FIRST_TEAM_ROW = 0;
const BLUE_START_COLUMN = 0;
const CENTER_COLUMN = 2;
const RED_START_COLUMN = 3;
const BLUE_TEAM_FILL = "D8E6F7";
const RED_TEAM_FILL = "F8DADA";
const WHITE_FILL = "FFFFFF";
const BLACK = "000000";
const VS_TOP_ROW = 9;

export interface AuctionArchiveExcelSource {
  id: string;
  room_name: string;
  result_snapshot: ArchiveTeam[];
}

export type ArchiveRosterSheetRows = Array<Array<string>>;
type XlsxModule = typeof import("xlsx-js-style");
type CellStyle = Record<string, unknown>;
type StyledCell = {
  v: string;
  t: "s";
  s: CellStyle;
};

function getNicknameOnly(name: string | null | undefined) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return "";
  return trimmed.split("#")[0]?.trim() ?? "";
}

function getSortedTeams(teams: ArchiveTeam[]) {
  return [...teams].sort((a, b) =>
    a.name.localeCompare(b.name, "ko-KR", { numeric: true }),
  );
}

function createEmptyRows() {
  const rowCount =
    FIRST_TEAM_ROW +
    TEAMS_PER_SIDE * ROSTER_ROWS_PER_TEAM +
    (TEAMS_PER_SIDE - 1) * GAP_ROWS;
  const columnCount = TEAM_WIDTH * 2 + GAP_COLUMNS;
  return Array.from({ length: rowCount }, () =>
    Array.from({ length: columnCount }, () => ""),
  );
}

function getTeamPosition(teamIndex: number) {
  const isBlueSide = teamIndex < TEAMS_PER_SIDE;
  const rowGroup = teamIndex % TEAMS_PER_SIDE;

  return {
    isBlueSide,
    startColumn: isBlueSide ? BLUE_START_COLUMN : RED_START_COLUMN,
    startRow: FIRST_TEAM_ROW + rowGroup * (ROSTER_ROWS_PER_TEAM + GAP_ROWS),
  };
}

export function buildArchiveRosterSheetRows(
  teams: ArchiveTeam[],
): ArchiveRosterSheetRows {
  const rows = createEmptyRows();

  getSortedTeams(teams)
    .slice(0, TEAMS_PER_SIDE * 2)
    .forEach((team, teamIndex) => {
      const { startColumn, startRow } = getTeamPosition(teamIndex);
      const rosterNames = team.players
        .map((player) => getNicknameOnly(player.name))
        .slice(0, ROSTER_ROWS_PER_TEAM);

      rows[startRow][startColumn] = `${teamIndex + 1}팀`;
      rosterNames.forEach((playerName, playerIndex) => {
        rows[startRow + playerIndex][startColumn + 1] = playerName;
      });
    });

  rows[VS_TOP_ROW][CENTER_COLUMN] = "V";
  rows[VS_TOP_ROW + 1][CENTER_COLUMN] = "S";

  return rows;
}

export function getArchiveRosterExcelFileName(archive: AuctionArchiveExcelSource) {
  const safeRoomName = archive.room_name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
  return `${safeRoomName || archive.id}-roster.xlsx`;
}

export function buildArchiveRosterWorkbook(
  xlsx: XlsxModule,
  archive: AuctionArchiveExcelSource,
) {
  const worksheet = xlsx.utils.aoa_to_sheet(buildArchiveRosterSheetRows(archive.result_snapshot));
  const sortedTeams = getSortedTeams(archive.result_snapshot).slice(0, TEAMS_PER_SIDE * 2);

  applyArchiveRosterSheetStyle(xlsx, worksheet, sortedTeams.length);

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "팀장 결과");
  return workbook;
}

function makeBorder(style: "thin" | "medium" = "thin") {
  return {
    top: { style, color: { rgb: BLACK } },
    right: { style, color: { rgb: BLACK } },
    bottom: { style, color: { rgb: BLACK } },
    left: { style, color: { rgb: BLACK } },
  };
}

function makeCell(value: string, style: CellStyle): StyledCell {
  return {
    v: value,
    t: "s",
    s: style,
  };
}

function makeStyle(options: {
  fill: string;
  fontColor?: string;
  bold?: boolean;
  fontSize?: number;
  borderStyle?: "thin" | "medium";
}): CellStyle {
  return {
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: makeBorder(options.borderStyle),
    fill: { patternType: "solid", fgColor: { rgb: options.fill } },
    font: {
      name: "맑은 고딕",
      sz: options.fontSize ?? 11,
      bold: options.bold ?? false,
      color: { rgb: options.fontColor ?? BLACK },
    },
  };
}

function setStyledCell(
  xlsx: XlsxModule,
  worksheet: import("xlsx-js-style").WorkSheet,
  row: number,
  column: number,
  value: string,
  style: CellStyle,
) {
  const address = xlsx.utils.encode_cell({ r: row, c: column });
  worksheet[address] = makeCell(value, style);
}

function applyArchiveRosterSheetStyle(
  xlsx: XlsxModule,
  worksheet: import("xlsx-js-style").WorkSheet,
  teamCount: number,
) {
  const blueTeamStyle = makeStyle({
    fill: BLUE_TEAM_FILL,
    bold: true,
    fontSize: 15,
    borderStyle: "medium",
  });
  const redTeamStyle = makeStyle({
    fill: RED_TEAM_FILL,
    bold: true,
    fontSize: 15,
    borderStyle: "medium",
  });
  const rosterStyle = makeStyle({ fill: WHITE_FILL, fontSize: 10 });
  const vsStyle = makeStyle({ fill: WHITE_FILL, bold: true, fontSize: 13 });

  setStyledCell(xlsx, worksheet, VS_TOP_ROW, CENTER_COLUMN, "V", vsStyle);
  setStyledCell(xlsx, worksheet, VS_TOP_ROW + 1, CENTER_COLUMN, "S", vsStyle);

  for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
    const { isBlueSide, startColumn, startRow } = getTeamPosition(teamIndex);
    const teamStyle = isBlueSide ? blueTeamStyle : redTeamStyle;

    for (let rowOffset = 0; rowOffset < ROSTER_ROWS_PER_TEAM; rowOffset += 1) {
      const teamNumberValue = rowOffset === 0 ? `${teamIndex + 1}팀` : "";
      const teamAddress = xlsx.utils.encode_cell({
        r: startRow + rowOffset,
        c: startColumn,
      });
      const rosterAddress = xlsx.utils.encode_cell({
        r: startRow + rowOffset,
        c: startColumn + 1,
      });
      const rosterValue = typeof worksheet[rosterAddress]?.v === "string"
        ? worksheet[rosterAddress].v
        : "";

      worksheet[teamAddress] = makeCell(teamNumberValue, teamStyle);
      worksheet[rosterAddress] = makeCell(rosterValue, rosterStyle);
    }
  }

  const totalRows =
    FIRST_TEAM_ROW +
    TEAMS_PER_SIDE * ROSTER_ROWS_PER_TEAM +
    (TEAMS_PER_SIDE - 1) * GAP_ROWS;

  worksheet["!ref"] = xlsx.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: totalRows - 1, c: RED_START_COLUMN + 1 },
  });
  worksheet["!merges"] = [
    ...Array.from({ length: teamCount }, (_, teamIndex) => {
      const { startColumn, startRow } = getTeamPosition(teamIndex);
      return {
        s: { r: startRow, c: startColumn },
        e: { r: startRow + ROSTER_ROWS_PER_TEAM - 1, c: startColumn },
      };
    }),
  ];
  worksheet["!cols"] = [
    { wch: 9 },
    { wch: 27 },
    { wch: 3 },
    { wch: 9 },
    { wch: 27 },
  ];
  worksheet["!rows"] = Array.from({ length: totalRows }, () => ({
    hpt: 17,
  }));
}
