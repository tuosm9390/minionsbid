import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildNextMatches,
  buildNextMatchesPreview,
} from "./leagueNextMatches";
import type { LeagueScheduleDay, LeagueScheduleMatch } from "@/features/schedules/types";

function createMatch(overrides?: Partial<LeagueScheduleMatch>): LeagueScheduleMatch {
  return {
    id: overrides?.id ?? "match-1",
    startsAt: overrides?.startsAt ?? "19:00",
    homeTeamName: overrides?.homeTeamName ?? "A",
    awayTeamName: overrides?.awayTeamName ?? "B",
    stageLabel: overrides?.stageLabel ?? "",
    format: overrides?.format ?? { winsToClinch: 1, maxGames: 1 },
    setLogs: overrides?.setLogs ?? [],
    homeScore: overrides?.homeScore ?? 0,
    awayScore: overrides?.awayScore ?? 0,
    winner: overrides?.winner ?? "PENDING",
    isCompleted: overrides?.isCompleted ?? false,
    note: overrides?.note ?? "",
    createdAt: overrides?.createdAt ?? null,
    updatedAt: overrides?.updatedAt ?? null,
  };
}

function createDay(dateKey: string, matches: LeagueScheduleMatch[]): LeagueScheduleDay {
  return {
    id: `day-${dateKey}`,
    dateKey,
    dateLabel: dateKey,
    matches,
  };
}

describe("leagueNextMatches", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns all upcoming matches on the nearest future day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 10, 13, 0, 0));

    const nextMatches = buildNextMatches([
      createDay("2026-04-10", [
        createMatch({ id: "today-1", startsAt: "18:00" }),
        createMatch({ id: "today-2", startsAt: "21:00" }),
        createMatch({ id: "today-3", startsAt: "22:00" }),
      ]),
      createDay("2026-04-11", [createMatch({ id: "tomorrow-1", startsAt: "19:00" })]),
    ]);

    expect(nextMatches.map((match) => match.id)).toEqual([
      "today-1",
      "today-2",
      "today-3",
    ]);
  });

  it("excludes already passed matches from the current day when a later one still exists", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 10, 20, 0, 0));

    const nextMatches = buildNextMatches([
      createDay("2026-04-10", [
        createMatch({ id: "today-1", startsAt: "18:00" }),
        createMatch({ id: "today-2", startsAt: "21:00" }),
        createMatch({ id: "today-3", startsAt: "22:00" }),
      ]),
      createDay("2026-04-11", [createMatch({ id: "tomorrow-1", startsAt: "19:00" })]),
    ]);

    expect(nextMatches.map((match) => match.id)).toEqual(["today-2", "today-3"]);
  });

  it("includes an unsaved selected day in the preview calculation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 10, 13, 0, 0));

    const nextMatches = buildNextMatchesPreview({
      days: [createDay("2026-04-09", [createMatch({ id: "old", startsAt: "19:00", isCompleted: true })])],
      selectedDateKey: "2026-04-10",
      previewMatches: [
        createMatch({ id: "preview-1", startsAt: "21:00", homeTeamName: "홈", awayTeamName: "원정" }),
        createMatch({ id: "preview-2", startsAt: "22:00", homeTeamName: "홈2", awayTeamName: "원정2" }),
      ],
    });

    expect(nextMatches.map((match) => match.id)).toEqual(["preview-1", "preview-2"]);
  });

  it("uses the edited time for an existing selected day preview", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 10, 13, 0, 0));

    const nextMatches = buildNextMatchesPreview({
      days: [
        createDay("2026-04-10", [
          createMatch({ id: "saved-match", startsAt: "19:00" }),
        ]),
      ],
      selectedDateKey: "2026-04-10",
      previewMatches: [
        createMatch({ id: "saved-match", startsAt: "21:00" }),
      ],
    });

    expect(nextMatches).toHaveLength(1);
    expect(nextMatches[0]?.startsAt).toBe("21:00");
  });
});
