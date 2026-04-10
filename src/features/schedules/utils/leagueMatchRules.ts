import type {
  LeagueMatchFormat,
  LeagueScheduleSetLog,
  LeagueSetWinner,
  LeagueMatchWinner,
} from "@/features/schedules/types";

export const DEFAULT_LEAGUE_MATCH_FORMAT: LeagueMatchFormat = {
  winsToClinch: 1,
  maxGames: 1,
};

function toSafePositiveInt(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export function normalizeLeagueMatchFormat(
  format?: Partial<LeagueMatchFormat> | null,
): LeagueMatchFormat {
  const winsToClinch = toSafePositiveInt(
    format?.winsToClinch,
    DEFAULT_LEAGUE_MATCH_FORMAT.winsToClinch,
  );
  const maxGames = Math.max(
    winsToClinch,
    toSafePositiveInt(format?.maxGames, DEFAULT_LEAGUE_MATCH_FORMAT.maxGames),
  );

  return {
    winsToClinch,
    maxGames,
  };
}

export function normalizeLeagueSetScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function normalizeLeagueStageLabel(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function normalizeLeagueSetWinner(value: unknown): LeagueSetWinner {
  return value === "AWAY" ? "AWAY" : "HOME";
}

export function normalizeLeagueSetLogs(
  logs: unknown,
  maxGames: number,
): LeagueScheduleSetLog[] {
  if (!Array.isArray(logs)) return [];

  return logs
    .slice(0, Math.max(0, maxGames))
    .map((entry, index) => {
      const record =
        typeof entry === "object" && entry !== null
          ? (entry as Record<string, unknown>)
          : {};

      return {
        setNumber: index + 1,
        winner: normalizeLeagueSetWinner(record.winner),
        note:
          typeof record.note === "string"
            ? record.note.trim()
            : typeof record.memo === "string"
              ? record.memo.trim()
              : "",
      };
    });
}

export function summarizeLeagueSetLogs(logs: LeagueScheduleSetLog[]) {
  return logs.reduce(
    (summary, log) => {
      if (log.winner === "HOME") {
        summary.homeScore += 1;
      } else {
        summary.awayScore += 1;
      }

      return summary;
    },
    { homeScore: 0, awayScore: 0 },
  );
}

export function deriveLeagueMatchWinner(args: {
  homeScore: number;
  awayScore: number;
  format: LeagueMatchFormat;
}): LeagueMatchWinner {
  const format = normalizeLeagueMatchFormat(args.format);
  const homeScore = normalizeLeagueSetScore(args.homeScore);
  const awayScore = normalizeLeagueSetScore(args.awayScore);

  if (homeScore > format.maxGames || awayScore > format.maxGames) {
    return "PENDING";
  }

  if (homeScore + awayScore > format.maxGames) {
    return "PENDING";
  }

  if (homeScore === format.winsToClinch && awayScore < format.winsToClinch) {
    return "HOME";
  }

  if (awayScore === format.winsToClinch && homeScore < format.winsToClinch) {
    return "AWAY";
  }

  return "PENDING";
}

export function isCompletedLeagueMatch(args: {
  homeScore: number;
  awayScore: number;
  format: LeagueMatchFormat;
}) {
  return deriveLeagueMatchWinner(args) !== "PENDING";
}

export function getLeagueMatchFormatLabel(format: LeagueMatchFormat) {
  const normalized = normalizeLeagueMatchFormat(format);

  if (normalized.winsToClinch === 1 && normalized.maxGames === 1) {
    return "단판";
  }

  return `${normalized.maxGames}판 ${normalized.winsToClinch}선승`;
}
