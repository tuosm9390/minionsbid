// 아카이브 상세 모달의 팀 로스터 엑셀 다운로드 데이터를 만든다.
import type { ArchiveTeam } from "@/features/auction/api/auctionActions";

const TEAMS_PER_SIDE = 4;
const ROSTER_ROWS_PER_TEAM = 5;
const TEAM_WIDTH = 2;
const GAP_COLUMNS = 1;
const GAP_ROWS = 1;

export interface AuctionArchiveExcelSource {
  id: string;
  room_name: string;
  result_snapshot: ArchiveTeam[];
}

export type ArchiveRosterSheetRows = Array<Array<string>>;

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
    TEAMS_PER_SIDE * ROSTER_ROWS_PER_TEAM + (TEAMS_PER_SIDE - 1) * GAP_ROWS;
  const columnCount = TEAM_WIDTH * 2 + GAP_COLUMNS;
  return Array.from({ length: rowCount }, () =>
    Array.from({ length: columnCount }, () => ""),
  );
}

export function buildArchiveRosterSheetRows(
  teams: ArchiveTeam[],
): ArchiveRosterSheetRows {
  const rows = createEmptyRows();

  getSortedTeams(teams)
    .slice(0, TEAMS_PER_SIDE * 2)
    .forEach((team, teamIndex) => {
      const sideIndex = teamIndex < TEAMS_PER_SIDE ? 0 : 1;
      const rowGroup = teamIndex % TEAMS_PER_SIDE;
      const startColumn = sideIndex * (TEAM_WIDTH + GAP_COLUMNS);
      const startRow = rowGroup * (ROSTER_ROWS_PER_TEAM + GAP_ROWS);
      const rosterNames = team.players
        .map((player) => getNicknameOnly(player.name))
        .slice(0, ROSTER_ROWS_PER_TEAM);

      rows[startRow][startColumn] = getNicknameOnly(team.leader_name);
      rosterNames.forEach((playerName, playerIndex) => {
        rows[startRow + playerIndex][startColumn + 1] = playerName;
      });
    });

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
  xlsx: typeof import("xlsx"),
  archive: AuctionArchiveExcelSource,
) {
  const worksheet = xlsx.utils.aoa_to_sheet(
    buildArchiveRosterSheetRows(archive.result_snapshot),
  );
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 24 },
    { wch: 4 },
    { wch: 18 },
    { wch: 24 },
  ];

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "팀장 결과");
  return workbook;
}
