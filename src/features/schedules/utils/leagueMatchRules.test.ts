import { describe, expect, it } from "vitest";
import {
  deriveLeagueMatchWinner,
  getLeagueMatchFormatLabel,
  isCompletedLeagueMatch,
  normalizeLeagueMatchFormat,
  normalizeLeagueSetLogs,
  summarizeLeagueSetLogs,
} from "./leagueMatchRules";

describe("leagueMatchRules", () => {
  it("derives a winner for completed series scores", () => {
    expect(
      deriveLeagueMatchWinner({
        homeScore: 2,
        awayScore: 1,
        format: { winsToClinch: 2, maxGames: 3 },
      }),
    ).toBe("HOME");

    expect(
      deriveLeagueMatchWinner({
        homeScore: 2,
        awayScore: 3,
        format: { winsToClinch: 3, maxGames: 5 },
      }),
    ).toBe("AWAY");
  });

  it("keeps incomplete or invalid scores pending", () => {
    expect(
      deriveLeagueMatchWinner({
        homeScore: 1,
        awayScore: 1,
        format: { winsToClinch: 2, maxGames: 3 },
      }),
    ).toBe("PENDING");

    expect(
      isCompletedLeagueMatch({
        homeScore: 3,
        awayScore: 2,
        format: { winsToClinch: 2, maxGames: 3 },
      }),
    ).toBe(false);
  });

  it("normalizes and labels match formats", () => {
    expect(normalizeLeagueMatchFormat({ winsToClinch: 3, maxGames: 1 })).toEqual(
      { winsToClinch: 3, maxGames: 3 },
    );
    expect(getLeagueMatchFormatLabel({ winsToClinch: 1, maxGames: 1 })).toBe(
      "단판",
    );
    expect(getLeagueMatchFormatLabel({ winsToClinch: 2, maxGames: 3 })).toBe(
      "3판 2선승",
    );
  });

  it("normalizes set logs and derives score from them", () => {
    const setLogs = normalizeLeagueSetLogs(
      [
        { winner: "HOME", note: "1세트" },
        { winner: "AWAY", note: "2세트" },
        { winner: "HOME", note: "3세트" },
      ],
      3,
    );

    expect(setLogs).toHaveLength(3);
    expect(summarizeLeagueSetLogs(setLogs)).toEqual({
      homeScore: 2,
      awayScore: 1,
    });
  });
});
