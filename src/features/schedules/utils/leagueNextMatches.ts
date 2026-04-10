import type {
  LeagueScheduleDay,
  LeagueScheduleMatch,
} from "@/features/schedules/types";

function parseLeagueDateKey(dateKey: string) {
  const match = dateKey.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseLeagueTime(time: string | null | undefined) {
  const match = (time?.trim() || "23:59").match(/^(\d{1,2}):(\d{2})$/);
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

  return { hour, minute };
}

export function getLeagueMatchTimestamp(
  dateKey: string,
  startsAt: string | null | undefined,
) {
  const date = parseLeagueDateKey(dateKey);
  const time = parseLeagueTime(startsAt);
  if (!date || !time) return Number.NaN;

  return new Date(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
    0,
    0,
  ).getTime();
}

export function sortLeagueMatches(
  matches: LeagueScheduleMatch[],
  dateKey?: string,
) {
  return [...matches].sort((left, right) => {
    if (dateKey) {
      const leftTimestamp = getLeagueMatchTimestamp(dateKey, left.startsAt);
      const rightTimestamp = getLeagueMatchTimestamp(dateKey, right.startsAt);

      if (
        Number.isFinite(leftTimestamp) &&
        Number.isFinite(rightTimestamp) &&
        leftTimestamp !== rightTimestamp
      ) {
        return leftTimestamp - rightTimestamp;
      }
    }

    const leftTime = left.startsAt || "99:99";
    const rightTime = right.startsAt || "99:99";
    return leftTime.localeCompare(rightTime, "ko-KR");
  });
}

export function buildNextMatches(days: LeagueScheduleDay[]) {
  const now = Date.now();
  const candidates = days.flatMap((day) =>
    day.matches.filter((match) => !match.isCompleted).map((match) => ({
      day,
      match,
      timestamp: getLeagueMatchTimestamp(day.dateKey, match.startsAt),
    })),
  );

  const futureMatches = candidates
    .filter((entry) => Number.isFinite(entry.timestamp) && entry.timestamp >= now)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (futureMatches.length > 0) {
    const nextDateKey = futureMatches[0].day.dateKey;
    return sortLeagueMatches(
      futureMatches
        .filter((entry) => entry.day.dateKey === nextDateKey)
        .map((entry) => entry.match),
      nextDateKey,
    );
  }

  const pending = candidates
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (pending.length > 0) {
    const nextDateKey = pending[0].day.dateKey;
    return sortLeagueMatches(
      pending
        .filter((entry) => entry.day.dateKey === nextDateKey)
        .map((entry) => entry.match),
      nextDateKey,
    );
  }

  return [];
}

export function buildNextMatchesPreview(args: {
  days: LeagueScheduleDay[];
  selectedDateKey: string;
  previewMatches: LeagueScheduleMatch[];
}) {
  const { days, selectedDateKey, previewMatches } = args;
  const hasSelectedDay = days.some((day) => day.dateKey === selectedDateKey);

  const previewDays = days.map((day) => {
    if (day.dateKey !== selectedDateKey) return day;

    return {
      ...day,
      matches: previewMatches,
    };
  });

  if (!hasSelectedDay && previewMatches.length > 0) {
    previewDays.push({
      id: `preview-day-${selectedDateKey}`,
      dateKey: selectedDateKey,
      dateLabel: selectedDateKey,
      matches: previewMatches,
    });
  }

  return buildNextMatches(previewDays);
}
