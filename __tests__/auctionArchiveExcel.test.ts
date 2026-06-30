// 아카이브 엑셀 다운로드 로스터 행 생성을 검증한다.
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";
import type { ArchiveTeam } from "@/features/auction/api/auctionActions";
import {
  buildArchiveRosterWorkbook,
  buildArchiveRosterSheetRows,
  getArchiveRosterExcelFileName,
} from "@/components/auctionArchiveExcel";

function team(
  name: string,
  leaderName: string,
  rosterNames: string[],
): ArchiveTeam {
  return {
    id: name,
    name,
    leader_name: leaderName,
    point_balance: 0,
    players: rosterNames.map((playerName, index) => ({
      name: playerName,
      tier: "",
      main_position: "",
      sub_position: "",
      sold_price: index * 10,
    })),
  };
}

describe("auction archive excel export", () => {
  it("팀장이 roster에 포함되면 오른쪽 로스터 열에 팀장 이름을 유지한다", () => {
    const rows = buildArchiveRosterSheetRows([
      team("1팀", "Captain#KR1", [
        "Captain#KR1",
        "PlayerA#KR1",
        "PlayerB",
        "PlayerC",
        "PlayerD",
      ]),
    ]);

    expect(rows[0][0]).toBe("1팀");
    expect(rows[0][1]).toBe("Captain");
    expect(rows[1][1]).toBe("PlayerA");
    expect(rows[4][1]).toBe("PlayerD");
  });

  it("팀장이 roster에 없으면 오른쪽 로스터 열에 팀장 이름을 추가하지 않는다", () => {
    const rows = buildArchiveRosterSheetRows([
      team("1팀", "LeaderOnly", [
        "PlayerA",
        "PlayerB",
        "PlayerC",
        "PlayerD",
        "PlayerE",
      ]),
    ]);

    expect(rows[0][0]).toBe("1팀");
    expect(rows.slice(0, 5).map((row) => row[1])).toEqual([
      "PlayerA",
      "PlayerB",
      "PlayerC",
      "PlayerD",
      "PlayerE",
    ]);
    expect(rows.slice(0, 5).map((row) => row[1])).not.toContain("LeaderOnly");
  });

  it("5번째 팀부터 오른쪽 팀 영역에 배치한다", () => {
    const rows = buildArchiveRosterSheetRows([
      team("1팀", "Leader1", ["P1"]),
      team("2팀", "Leader2", ["P2"]),
      team("3팀", "Leader3", ["P3"]),
      team("4팀", "Leader4", ["P4"]),
      team("5팀", "Leader5", ["P5"]),
    ]);

    expect(rows[0][3]).toBe("5팀");
    expect(rows[0][4]).toBe("P5");
  });

  it("팀 번호 병합과 블루 레드 팀 배경 스타일을 만든다", () => {
    const workbook = buildArchiveRosterWorkbook(XLSX, {
      id: "archive-id",
      room_name: "테스트",
      result_snapshot: [
        team("1팀", "Leader1", ["P1", "P2", "P3", "P4", "P5"]),
        team("2팀", "Leader2", ["P6"]),
        team("3팀", "Leader3", ["P7"]),
        team("4팀", "Leader4", ["P8"]),
        team("5팀", "Leader5", ["P9", "P10", "P11", "P12", "P13"]),
      ],
    });
    const worksheet = workbook.Sheets["팀장 결과"];

    expect(worksheet["A1"]?.v).toBe("1팀");
    expect(worksheet["B1"]?.v).toBe("P1");
    expect(worksheet["D1"]?.v).toBe("5팀");
    expect(worksheet["E1"]?.v).toBe("P9");
    expect(worksheet["C10"]?.v).toBe("V");
    expect(worksheet["C11"]?.v).toBe("S");
    expect(worksheet["A1"]?.s).toMatchObject({
      fill: { fgColor: { rgb: "D8E6F7" } },
      font: { bold: true },
    });
    expect(worksheet["D1"]?.s).toMatchObject({
      fill: { fgColor: { rgb: "F8DADA" } },
      font: { bold: true },
    });
    expect(worksheet["!merges"]).toContainEqual({
      s: { r: 0, c: 0 },
      e: { r: 4, c: 0 },
    });
  });

  it("파일명에 사용할 수 없는 문자를 치환한다", () => {
    expect(
      getArchiveRosterExcelFileName({
        id: "archive-id",
        room_name: "리그/결승: A팀?",
        result_snapshot: [],
      }),
    ).toBe("리그_결승__A팀_-roster.xlsx");
  });
});
