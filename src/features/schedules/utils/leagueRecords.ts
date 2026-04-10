import type {
  LeagueScheduleDay,
  LeagueScheduleMatch,
  LeagueRosterTeam,
} from "@/features/schedules/types";

const LEAGUE_TIME_ZONE_OFFSET = "+09:00";

export interface LeagueRecordRow {
  rank: number;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  setWins: number;
  setLosses: number;
  setDiff: number;
  winRate: number;
}

export interface LeagueMatchSummary {
  totalMatches: number;
  completedMatches: number;
  inProgressMatches: number;
  pendingMatches: number;
  totalHomeScore: number;
  totalAwayScore: number;
}

export type LeagueMatchStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type LeagueMatchStatusFilter = LeagueMatchStatus | "ALL";

export interface LeagueMatchListItem {
  id: string;
  dateKey: string;
  dateLabel: string;
  startsAt: string;
  stageLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  winner: LeagueScheduleMatch["winner"];
  isCompleted: boolean;
  status: LeagueMatchStatus;
  note: string;
}

interface MutableLeagueRecordRow extends Omit<LeagueRecordRow, "rank"> {}

interface LeagueRecordFilters {
  stageLabel?: string | null;
  status?: LeagueMatchStatusFilter;
  now?: number | Date;
}

function createEmptyRecord(teamName: string): MutableLeagueRecordRow {
  return {
    teamName,
    played: 0,
    wins: 0,
    losses: 0,
    setWins: 0,
    setLosses: 0,
    setDiff: 0,
    winRate: 0,
  };
}

function ensureRecord(
  recordMap: Map<string, MutableLeagueRecordRow>,
  teamName: string,
) {
  if (!teamName) return;
  if (!recordMap.has(teamName)) {
    recordMap.set(teamName, createEmptyRecord(teamName));
  }
}

function updateWinRate(record: MutableLeagueRecordRow) {
  record.winRate =
    record.played > 0 ? Math.round((record.wins / record.played) * 100) : 0;
}

function normalizeNow(now?: number | Date) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "number") return now;
  return Date.now();
}

function normalizeStageLabel(stageLabel: string) {
  return stageLabel.trim();
}

function normalizeStartsAt(startsAt: string) {
  const match = startsAt.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toLeagueMatchStartTimestamp(dateKey: string, startsAt: string) {
  const normalizedTime = normalizeStartsAt(startsAt);
  if (!normalizedTime) return null;

  const parsed = new Date(
    `${dateKey}T${normalizedTime}:00${LEAGUE_TIME_ZONE_OFFSET}`,
  ).getTime();

  return Number.isNaN(parsed) ? null : parsed;
}

export function getLeagueMatchStatus(args: {
  dateKey: string;
  match: LeagueScheduleMatch;
  now?: number | Date;
}): LeagueMatchStatus {
  if (args.match.isCompleted && ["HOME", "AWAY"].includes(args.match.winner)) {
    return "COMPLETED";
  }

  const startsAtTimestamp = toLeagueMatchStartTimestamp(
    args.dateKey,
    args.match.startsAt,
  );

  if (startsAtTimestamp !== null && startsAtTimestamp <= normalizeNow(args.now)) {
    return "IN_PROGRESS";
  }

  return "PENDING";
}

function matchPassesFilters(args: {
  dateKey: string;
  match: LeagueScheduleMatch;
  filters?: LeagueRecordFilters;
}) {
  const { filters, dateKey, match } = args;
  const normalizedStageLabel = normalizeStageLabel(match.stageLabel);

  if (
    filters?.stageLabel &&
    normalizedStageLabel !== normalizeStageLabel(filters.stageLabel)
  ) {
    return false;
  }

  if (filters?.status && filters.status !== "ALL") {
    const status = getLeagueMatchStatus({
      dateKey,
      match,
      now: filters.now,
    });

    if (status !== filters.status) {
      return false;
    }
  }

  return true;
}

function applyCompletedMatch(
  match: LeagueScheduleMatch,
  recordMap: Map<string, MutableLeagueRecordRow>,
) {
  const homeTeamName = match.homeTeamName.trim();
  const awayTeamName = match.awayTeamName.trim();

  if (!homeTeamName || !awayTeamName || !match.isCompleted) return;
  if (!["HOME", "AWAY"].includes(match.winner)) return;

  ensureRecord(recordMap, homeTeamName);
  ensureRecord(recordMap, awayTeamName);

  const homeRecord = recordMap.get(homeTeamName);
  const awayRecord = recordMap.get(awayTeamName);

  if (!homeRecord || !awayRecord) return;

  homeRecord.played += 1;
  awayRecord.played += 1;
  homeRecord.setWins += match.homeScore;
  homeRecord.setLosses += match.awayScore;
  awayRecord.setWins += match.awayScore;
  awayRecord.setLosses += match.homeScore;
  homeRecord.setDiff = homeRecord.setWins - homeRecord.setLosses;
  awayRecord.setDiff = awayRecord.setWins - awayRecord.setLosses;

  if (match.winner === "HOME") {
    homeRecord.wins += 1;
    awayRecord.losses += 1;
  } else {
    awayRecord.wins += 1;
    homeRecord.losses += 1;
  }

  updateWinRate(homeRecord);
  updateWinRate(awayRecord);
}

export function summarizeLeagueMatches(
  days: LeagueScheduleDay[],
  filters?: LeagueRecordFilters,
): LeagueMatchSummary {
  let totalMatches = 0;
  let completedMatches = 0;
  let inProgressMatches = 0;
  let pendingMatches = 0;
  let totalHomeScore = 0;
  let totalAwayScore = 0;

  days.forEach((day) => {
    day.matches.forEach((match) => {
      if (!matchPassesFilters({ dateKey: day.dateKey, match, filters })) {
        return;
      }

      totalMatches += 1;
      totalHomeScore += match.homeScore;
      totalAwayScore += match.awayScore;

      const status = getLeagueMatchStatus({
        dateKey: day.dateKey,
        match,
        now: filters?.now,
      });

      if (status === "COMPLETED") {
        completedMatches += 1;
      } else if (status === "IN_PROGRESS") {
        inProgressMatches += 1;
      } else {
        pendingMatches += 1;
      }
    });
  });

  return {
    totalMatches,
    completedMatches,
    inProgressMatches,
    pendingMatches,
    totalHomeScore,
    totalAwayScore,
  };
}

export function listLeagueMatches(args: {
  days: LeagueScheduleDay[];
  filters?: LeagueRecordFilters;
}): LeagueMatchListItem[] {
  const items: LeagueMatchListItem[] = [];

  args.days.forEach((day) => {
    day.matches.forEach((match) => {
      if (
        !matchPassesFilters({
          dateKey: day.dateKey,
          match,
          filters: args.filters,
        })
      ) {
        return;
      }

      items.push({
        id: match.id,
        dateKey: day.dateKey,
        dateLabel: day.dateLabel,
        startsAt: match.startsAt,
        stageLabel: normalizeStageLabel(match.stageLabel),
        homeTeamName: match.homeTeamName.trim(),
        awayTeamName: match.awayTeamName.trim(),
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        winner: match.winner,
        isCompleted: match.isCompleted,
        status: getLeagueMatchStatus({
          dateKey: day.dateKey,
          match,
          now: args.filters?.now,
        }),
        note: match.note,
      });
    });
  });

  return items.sort((left, right) => {
    const leftTime = toLeagueMatchStartTimestamp(left.dateKey, left.startsAt) ?? 0;
    const rightTime =
      toLeagueMatchStartTimestamp(right.dateKey, right.startsAt) ?? 0;

    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.id.localeCompare(right.id, "ko-KR");
  });
}

export function buildLeagueRecordRows(args: {
  rosterTeams: LeagueRosterTeam[];
  days: LeagueScheduleDay[];
  filters?: LeagueRecordFilters;
  seedTeamNames?: string[];
}): LeagueRecordRow[] {
  const recordMap = new Map<string, MutableLeagueRecordRow>();
  const shouldExpandFromMatches = !args.seedTeamNames || args.seedTeamNames.length === 0;

  if (args.seedTeamNames && args.seedTeamNames.length > 0) {
    args.seedTeamNames.forEach((teamName) =>
      ensureRecord(recordMap, teamName.trim()),
    );
  } else {
    args.rosterTeams.forEach((team) => ensureRecord(recordMap, team.name.trim()));
  }

  args.days.forEach((day) => {
    day.matches.forEach((match) => {
      if (shouldExpandFromMatches) {
        ensureRecord(recordMap, match.homeTeamName.trim());
        ensureRecord(recordMap, match.awayTeamName.trim());
      }

      if (
        !matchPassesFilters({
          dateKey: day.dateKey,
          match,
          filters: args.filters,
        })
      ) {
        return;
      }

      applyCompletedMatch(match, recordMap);
    });
  });

  return Array.from(recordMap.values())
    .sort((left, right) => {
      if (right.wins !== left.wins) return right.wins - left.wins;
      if (right.setDiff !== left.setDiff) return right.setDiff - left.setDiff;
      if (right.setWins !== left.setWins) return right.setWins - left.setWins;
      if (left.losses !== right.losses) return left.losses - right.losses;
      if (right.played !== left.played) return right.played - left.played;
      return left.teamName.localeCompare(right.teamName, "ko-KR");
    })
    .map((record, index) => ({
      rank: index + 1,
      ...record,
    }));
}
