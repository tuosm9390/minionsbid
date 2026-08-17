import { describe, expect, it } from "vitest";
import type { LeagueDeeplolParticipant, LeagueRosterTeam } from "@/features/schedules/types";
import {
  findRosterParticipant,
  getMappedRosterPlayerCount,
  getRosterPuuidMappings,
  isRosterReady,
  normalizeRosterPlayerKey,
} from "./deeplolRosterMatching";

function makeTeam(playerNames: string[]): LeagueRosterTeam {
  return {
    id: "team-a",
    name: "Alpha Squad",
    leaderName: playerNames[0] ?? "",
    captainMode: "IN_ROSTER",
    pointBalance: 0,
    players: playerNames.map((name) => ({
      name,
      tier: "",
      mainPosition: "",
      subPosition: "",
      soldPrice: null,
    })),
    source: "room",
    auctionKey: "auction-a",
    auctionName: "Auction A",
  };
}

function makeParticipant(
  puuId: string,
  riotName: string,
  overrides: Partial<LeagueDeeplolParticipant> = {},
): LeagueDeeplolParticipant {
  return {
    puuId,
    riotName,
    riotTag: "KR1",
    teamId: "team-a",
    teamName: "Alpha Squad",
    position: null,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("deeplol roster matching", () => {
  it("matches a roster Riot ID with a #tag against Deeplol's split name fields", () => {
    const team = makeTeam(["Player One#KR1", "Player Two#KR1"]);
    const participant = makeParticipant("puuid-1", "Player One");

    expect(findRosterParticipant(team, "Player One#KR1", [participant])?.puuId).toBe("puuid-1");
    expect(normalizeRosterPlayerKey("Ｐｌａｙｅｒ　Ｏｎｅ#KR1")).toBe("player one");
  });

  it("normalizes whitespace and falls back to the team name when team IDs differ", () => {
    const team = makeTeam(["Player One#KR1"]);
    const participant = makeParticipant("puuid-1", " Player   One ", {
      teamId: "legacy-team-id",
      teamName: "  ALPHA   SQUAD ",
    });

    expect(findRosterParticipant(team, "Player One#KR1", [participant])?.puuId).toBe("puuid-1");
  });

  it("ignores inactive participants and reports the exact secured count", () => {
    const team = makeTeam(["One#KR1", "Two#KR1", "Three#KR1", "Four#KR1", "Five#KR1"]);
    const participants = [
      makeParticipant("puuid-1", "One"),
      makeParticipant("puuid-2", "Two"),
      makeParticipant("puuid-3", "Three"),
      makeParticipant("puuid-4", "Four"),
      makeParticipant("puuid-inactive", "Five", { status: "INACTIVE" }),
      makeParticipant("puuid-extra", "Not In Roster"),
    ];

    expect(getMappedRosterPlayerCount([team], participants)).toBe(4);
    expect(getRosterPuuidMappings([team], participants)).toHaveLength(4);
    expect(isRosterReady(team, participants)).toBe(false);
  });

  it("reports a valid five-player team as ready when every roster slot is mapped", () => {
    const team = makeTeam(["One#KR1", "Two#KR1", "Three#KR1", "Four#KR1", "Five#KR1"]);
    const participants = team.players.map((player, index) =>
      makeParticipant(`puuid-${index}`, player.name.split("#")[0]),
    );

    expect(getMappedRosterPlayerCount([team], participants)).toBe(5);
    expect(getRosterPuuidMappings([team], participants).map((mapping) => mapping.puuId)).toEqual([
      "puuid-0",
      "puuid-1",
      "puuid-2",
      "puuid-3",
      "puuid-4",
    ]);
    expect(isRosterReady(team, participants)).toBe(true);
  });
});
