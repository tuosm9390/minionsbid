const LEAGUE_TIME_ZONE = "Asia/Seoul";

function formatLeagueTime(date: Date, timeZone = LEAGUE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

function normalizeClockString(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";

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
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toDateLike(value: unknown) {
  if (value instanceof Date) return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date ? date : null;
  }

  return null;
}

export function normalizeLeagueMatchStartTime(value: unknown) {
  if (typeof value === "string") {
    const normalizedClock = normalizeClockString(value);
    if (normalizedClock) return normalizedClock;

    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
      return formatLeagueTime(parsedDate);
    }

    return "";
  }

  const date = toDateLike(value);
  if (date && !Number.isNaN(date.getTime())) {
    return formatLeagueTime(date);
  }

  return "";
}
