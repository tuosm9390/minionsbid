export type CaptainMode = "IN_ROSTER" | "COACH_ONLY";

export interface RosterPlayerLike {
  name: string;
  sold_price: number | null;
  tier?: string;
  main_position?: string;
  sub_position?: string;
}

export function normalizeCaptainMode(value: unknown): CaptainMode {
  return value === "COACH_ONLY" ? "COACH_ONLY" : "IN_ROSTER";
}

export function inferCaptainModeFromRoster(
  value: unknown,
  options: {
    leaderName: string;
    players: Array<{ name?: string | null }> | null | undefined;
  },
): CaptainMode {
  if (value === "IN_ROSTER" || value === "COACH_ONLY") {
    return value;
  }

  const leaderName = options.leaderName.trim();
  if (!leaderName) {
    return "COACH_ONLY";
  }

  const hasCaptainInPlayers = (options.players ?? []).some(
    (player) => (player?.name ?? "").trim() === leaderName,
  );

  return hasCaptainInPlayers ? "IN_ROSTER" : "COACH_ONLY";
}

export function getAuctionSlotsPerTeam(
  membersPerTeam: number,
  captainMode: CaptainMode,
): number {
  const normalizedMembers = Number.isFinite(membersPerTeam)
    ? Math.max(Math.trunc(membersPerTeam), 0)
    : 0;
  const captainSlots = captainMode === "IN_ROSTER" ? 1 : 0;
  return Math.max(normalizedMembers - captainSlots, 0);
}

export function buildRosterWithCaptain<T extends RosterPlayerLike>(
  players: T[],
  options: {
    captainMode: CaptainMode;
    leaderName: string;
    leaderPosition?: string;
    leaderTier?: string;
  },
): T[] {
  if (options.captainMode !== "IN_ROSTER" || !options.leaderName.trim()) {
    return players;
  }

  const captainEntry = {
    name: options.leaderName,
    sold_price: null,
    tier: options.leaderTier ?? "팀장",
    main_position: options.leaderPosition ?? "",
    sub_position: "",
  } as T;

  return [captainEntry, ...players];
}
