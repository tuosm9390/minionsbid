import { describe, expect, it } from "vitest";
import {
  bucketAuctionPlayers,
  isAuctionRoomComplete,
} from "@/features/auction/store/auctionSelectors";
import type { Player } from "@/features/auction/store/useAuctionStore";

const players: Player[] = [
  {
    id: "p1",
    room_id: "room-1",
    name: "대기선수",
    tier: "골드",
    main_position: "TOP",
    sub_position: "",
    status: "WAITING",
    team_id: null,
    sold_price: null,
    description: "",
  },
  {
    id: "p2",
    room_id: "room-1",
    name: "경매선수",
    tier: "플래티넘",
    main_position: "MID",
    sub_position: "",
    status: "IN_AUCTION",
    team_id: null,
    sold_price: null,
    description: "",
  },
  {
    id: "p3",
    room_id: "room-1",
    name: "낙찰선수1",
    tier: "실버",
    main_position: "ADC",
    sub_position: "",
    status: "SOLD",
    team_id: "team-1",
    sold_price: 100,
    description: "",
  },
  {
    id: "p4",
    room_id: "room-1",
    name: "낙찰선수2",
    tier: "실버",
    main_position: "SUP",
    sub_position: "",
    status: "SOLD",
    team_id: "team-1",
    sold_price: 120,
    description: "",
  },
  {
    id: "p5",
    room_id: "room-1",
    name: "유찰선수",
    tier: "브론즈",
    main_position: "JGL",
    sub_position: "",
    status: "UNSOLD",
    team_id: null,
    sold_price: null,
    description: "",
  },
];

describe("auctionSelectors", () => {
  it("players 배열을 한 번 순회해 상태별 bucket과 팀별 sold index를 만든다", () => {
    const result = bucketAuctionPlayers(players, "p2");

    expect(result.currentPlayer?.id).toBe("p2");
    expect(result.waitingPlayers.map((player) => player.id)).toEqual(["p1"]);
    expect(result.unsoldPlayers.map((player) => player.id)).toEqual(["p5"]);
    expect(result.soldPlayers.map((player) => player.id)).toEqual(["p3", "p4"]);
    expect(result.soldCountByTeam.get("team-1")).toBe(2);
    expect(result.soldPlayersByTeam.get("team-1")?.map((player) => player.id)).toEqual([
      "p3",
      "p4",
    ]);
  });

  it("currentPlayerId가 없어도 IN_AUCTION 상태 선수를 fallback currentPlayer로 잡는다", () => {
    const result = bucketAuctionPlayers(players);

    expect(result.currentPlayer?.id).toBe("p2");
  });

  it("room complete 여부를 팀별 sold count로 판단한다", () => {
    const soldCountByTeam = new Map<string, number>([
      ["team-1", 4],
      ["team-2", 4],
    ]);

    expect(
      isAuctionRoomComplete({
        teamIds: ["team-1", "team-2"],
        soldCountByTeam,
        membersPerTeam: 5,
        captainMode: "IN_ROSTER",
      }),
    ).toBe(true);

    soldCountByTeam.set("team-2", 3);

    expect(
      isAuctionRoomComplete({
        teamIds: ["team-1", "team-2"],
        soldCountByTeam,
        membersPerTeam: 5,
        captainMode: "IN_ROSTER",
      }),
    ).toBe(false);
  });
});
