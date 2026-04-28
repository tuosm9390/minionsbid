import { describe, expect, it } from "vitest";
import {
  buildLeagueRecordRows,
  getLeagueMatchStatus,
  listLeagueMatches,
  summarizeLeagueMatches,
} from "./leagueRecords";
import type {
  LeagueRosterTeam,
  LeagueScheduleDay,
} from "@/features/schedules/types";

const rosterTeams: LeagueRosterTeam[] = [
  {
    id: "team-a",
    name: "알파",
    leaderName: "리더A",
    captainMode: "IN_ROSTER",
    pointBalance: 0,
    players: [],
    source: "room",
    auctionKey: "room:1",
    auctionName: "테스트 리그",
  },
  {
    id: "team-b",
    name: "브라보",
    leaderName: "리더B",
    captainMode: "IN_ROSTER",
    pointBalance: 0,
    players: [],
    source: "room",
    auctionKey: "room:1",
    auctionName: "테스트 리그",
  },
  {
    id: "team-c",
    name: "찰리",
    leaderName: "리더C",
    captainMode: "IN_ROSTER",
    pointBalance: 0,
    players: [],
    source: "room",
    auctionKey: "room:1",
    auctionName: "테스트 리그",
  },
];

const days: LeagueScheduleDay[] = [
  {
    id: "day-1",
    dateKey: "2026-04-10",
    dateLabel: "4월 10일",
    matches: [
      {
        id: "match-1",
        startsAt: "19:00",
        homeTeamName: "알파",
        awayTeamName: "브라보",
        stageLabel: "4강",
        format: { winsToClinch: 2, maxGames: 3 },
        setLogs: [
          { setNumber: 1, winner: "HOME", note: "선취점" },
          { setNumber: 2, winner: "HOME", note: "바론 마무리" },
        ],
        homeScore: 2,
        awayScore: 0,
        winner: "HOME",
        isCompleted: true,
        note: "",
        createdAt: null,
        updatedAt: null,
      },
      {
        id: "match-2",
        startsAt: "20:00",
        homeTeamName: "브라보",
        awayTeamName: "찰리",
        stageLabel: "4강",
        format: { winsToClinch: 2, maxGames: 3 },
        setLogs: [
          { setNumber: 1, winner: "HOME", note: "" },
          { setNumber: 2, winner: "AWAY", note: "" },
          { setNumber: 3, winner: "AWAY", note: "" },
        ],
        homeScore: 1,
        awayScore: 2,
        winner: "AWAY",
        isCompleted: true,
        note: "",
        createdAt: null,
        updatedAt: null,
      },
    ],
  },
  {
    id: "day-2",
    dateKey: "2026-04-11",
    dateLabel: "4월 11일",
    matches: [
      {
        id: "match-3",
        startsAt: "19:00",
        homeTeamName: "찰리",
        awayTeamName: "알파",
        stageLabel: "결승",
        format: { winsToClinch: 3, maxGames: 5 },
        setLogs: [],
        homeScore: 0,
        awayScore: 0,
        winner: "PENDING",
        isCompleted: false,
        note: "",
        createdAt: null,
        updatedAt: null,
      },
    ],
  },
];

describe("leagueRecords", () => {
  it("builds standings from completed matches only", () => {
    const rows = buildLeagueRecordRows({ rosterTeams, days });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      rank: 1,
      teamName: "알파",
      played: 1,
      wins: 1,
      losses: 0,
      setWins: 2,
      setLosses: 0,
      setDiff: 2,
      winRate: 100,
    });
    expect(rows[1]).toMatchObject({
      rank: 2,
      teamName: "찰리",
      played: 1,
      wins: 1,
      losses: 0,
      setWins: 2,
      setLosses: 1,
      setDiff: 1,
      winRate: 100,
    });
    expect(rows[2]).toMatchObject({
      rank: 3,
      teamName: "브라보",
      played: 2,
      wins: 0,
      losses: 2,
      setWins: 1,
      setLosses: 4,
      setDiff: -3,
      winRate: 0,
    });
  });

  it("summarizes completed and pending match counts", () => {
    expect(
      summarizeLeagueMatches(days, {
        now: new Date("2026-04-11T08:00:00.000Z"),
      }),
    ).toEqual({
      totalMatches: 3,
      completedMatches: 2,
      inProgressMatches: 0,
      pendingMatches: 1,
      totalHomeScore: 3,
      totalAwayScore: 2,
    });
  });

  it("filters standings by stage label", () => {
    const rows = buildLeagueRecordRows({
      rosterTeams,
      days,
      filters: { stageLabel: "4강" },
    });

    expect(rows[0]).toMatchObject({
      teamName: "알파",
      wins: 1,
      losses: 0,
      setWins: 2,
      setLosses: 0,
    });
    expect(rows[1]).toMatchObject({
      teamName: "찰리",
      wins: 1,
      losses: 0,
      setWins: 2,
      setLosses: 1,
    });
    expect(rows[2]).toMatchObject({
      teamName: "브라보",
      wins: 0,
      losses: 2,
      setWins: 1,
      setLosses: 4,
    });
  });

  it("can seed standings only with teams participating in the selected stage", () => {
    const rows = buildLeagueRecordRows({
      rosterTeams,
      days,
      filters: { stageLabel: "결승" },
      seedTeamNames: ["찰리", "알파"],
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.teamName)).toEqual(["알파", "찰리"]);
    expect(rows[0]).toMatchObject({
      played: 0,
      wins: 0,
      losses: 0,
    });
    expect(rows[1]).toMatchObject({
      played: 0,
      wins: 0,
      losses: 0,
    });
  });

  it("summarizes and lists in-progress matches by status filter", () => {
    const now = new Date("2026-04-11T10:30:00.000Z");

    expect(
      summarizeLeagueMatches(days, { status: "IN_PROGRESS", now }),
    ).toEqual({
      totalMatches: 1,
      completedMatches: 0,
      inProgressMatches: 1,
      pendingMatches: 0,
      totalHomeScore: 0,
      totalAwayScore: 0,
    });

    expect(
      listLeagueMatches({
        days,
        filters: { status: "IN_PROGRESS", now },
      }),
    ).toMatchObject([
      {
        id: "match-3",
        dateKey: "2026-04-11",
        stageLabel: "결승",
        status: "IN_PROGRESS",
      },
    ]);
  });

  it("detects pending and completed match statuses", () => {
    expect(
      getLeagueMatchStatus({
        dateKey: "2026-04-10",
        match: days[0].matches[0],
        now: new Date("2026-04-10T08:00:00.000Z"),
      }),
    ).toBe("COMPLETED");

    expect(
      getLeagueMatchStatus({
        dateKey: "2026-04-11",
        match: days[1].matches[0],
        now: new Date("2026-04-11T08:00:00.000Z"),
      }),
    ).toBe("PENDING");
  });
});
