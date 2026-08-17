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

  it("preserves meaningful punctuation while normalizing Unicode and Riot ID tags", () => {
    const team = makeTeam(["ＫＤＡ・王!!#KR1"]);
    const participant = makeParticipant("puuid-special", " KDA・王!! ", {
      riotTag: "KR1",
      teamName: "Ａｌｐｈａ　Ｓｑｕａｄ",
    });

    expect(normalizeRosterPlayerKey("ＫＤＡ・王!!#KR1")).toBe("kda・王!!");
    expect(findRosterParticipant(team, "ＫＤＡ・王!!#KR1", [participant])?.puuId).toBe("puuid-special");
  });

  it("resolves same-named players by team ID before falling back to team name", () => {
    const alpha = makeTeam(["Shadow#KR1"]);
    const beta = { ...makeTeam(["Shadow#KR1"]), id: "team-b", name: "Beta Squad" };
    const participants = [
      makeParticipant("puuid-alpha", "Shadow", { teamName: null }),
      makeParticipant("puuid-beta", "Shadow", { teamId: "team-b", teamName: null }),
    ];

    expect(findRosterParticipant(alpha, "Shadow#KR1", participants)?.puuId).toBe("puuid-alpha");
    expect(findRosterParticipant(beta, "Shadow#KR1", participants)?.puuId).toBe("puuid-beta");
  });

  it("does not guess when duplicate active candidates belong to the same team", () => {
    const team = makeTeam(["Shadow#KR1"]);
    const participants = [
      makeParticipant("puuid-1", "Shadow"),
      makeParticipant("puuid-2", "Shadow"),
    ];

    expect(findRosterParticipant(team, "Shadow#KR1", participants)).toBeNull();
    expect(getMappedRosterPlayerCount([team], participants)).toBe(0);
  });

  it("does not match blank or missing Riot names even when the team matches", () => {
    const team = makeTeam(["#KR1"]);
    const participants = [
      makeParticipant("puuid-blank", "", { riotTag: "KR1" }),
      makeParticipant("puuid-null", "   ", { riotTag: null }),
    ];

    expect(findRosterParticipant(team, "#KR1", participants)).toBeNull();
  });
});
