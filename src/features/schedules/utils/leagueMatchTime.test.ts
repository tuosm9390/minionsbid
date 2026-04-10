import { describe, expect, it } from "vitest";
import { normalizeLeagueMatchStartTime } from "./leagueMatchTime";

describe("leagueMatchTime", () => {
  it("keeps plain HH:mm values", () => {
    expect(normalizeLeagueMatchStartTime("21:00")).toBe("21:00");
    expect(normalizeLeagueMatchStartTime("9:05")).toBe("09:05");
  });

  it("normalizes strings with seconds", () => {
    expect(normalizeLeagueMatchStartTime("21:00:00")).toBe("21:00");
  });

  it("reads ISO datetimes as Seoul local time", () => {
    expect(normalizeLeagueMatchStartTime("2026-04-10T12:00:00.000Z")).toBe(
      "21:00",
    );
  });

  it("reads Firestore-like timestamp objects", () => {
    const firestoreLike = {
      toDate() {
        return new Date("2026-04-10T12:30:00.000Z");
      },
    };

    expect(normalizeLeagueMatchStartTime(firestoreLike)).toBe("21:30");
  });
});
