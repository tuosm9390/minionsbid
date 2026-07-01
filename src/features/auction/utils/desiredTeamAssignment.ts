// 희망 팀 문자열과 실제 팀 배정 후보를 계산하는 순수 유틸
export type AssignmentExceptionReason =
  | "NO_COMMON_CANDIDATE"
  | "CANDIDATES_EXHAUSTED"
  | "INVALID_DESIRED_TEAM"
  | "FORCED_BY_ORGANIZER";

export type AssignmentSelectionStatus =
  | "MANUAL"
  | "SUGGESTED"
  | "EXCEPTION"
  | "UNASSIGNED";

export interface DesiredTeamParseResult {
  raw: string;
  teamIds: number[];
  unrestricted: boolean;
  invalidTokens: string[];
}

export interface DesiredTeamPlayerInput {
  desired_team?: string | null;
}

export interface RosterAssignmentCandidate {
  auctionTeamId: string;
  candidateTeamIds: number[];
  restricted: boolean;
  invalidReasons: AssignmentExceptionReason[];
}

export interface AssignmentSelection {
  auctionTeamId: string;
  assignedTeamId: number | null;
  status: AssignmentSelectionStatus;
  exceptionReason?: AssignmentExceptionReason;
}

export interface AssignmentResolution extends AssignmentSelection {
  candidateTeamIds: number[];
  availableCandidateTeamIds: number[];
  restricted: boolean;
  invalidReasons: AssignmentExceptionReason[];
  message: string | null;
}

export type DesiredTeamConflictStatus = "NONE" | "NARROWED" | "CONFLICT";

export interface DesiredTeamConflictEvaluation {
  status: DesiredTeamConflictStatus;
  rosterCandidateTeamIds: number[];
  targetCandidateTeamIds: number[];
  remainingTeamIds: number[];
  invalidReasons: AssignmentExceptionReason[];
}

const UNRESTRICTED_VALUES = new Set(["", "상관없음", "상관 없음", "무관"]);

export function getAllTeamIds(totalTeamCount: number) {
  return Array.from({ length: Math.max(0, totalTeamCount) }, (_, index) => index + 1);
}

function uniqueSorted(values: number[]) {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function intersect(left: number[], right: number[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

export function parseDesiredTeam(
  value: string | null | undefined,
  totalTeamCount: number,
): DesiredTeamParseResult {
  const raw = String(value ?? "").trim();
  if (UNRESTRICTED_VALUES.has(raw)) {
    return { raw, teamIds: [], unrestricted: true, invalidTokens: [] };
  }

  const tokens = raw
    .split(/[,/|·\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const teamIds: number[] = [];
  const invalidTokens: string[] = [];

  tokens.forEach((token) => {
    const normalized = token.replace(/팀$/u, "");
    if (!/^\d+$/u.test(normalized)) {
      invalidTokens.push(token);
      return;
    }
    const teamId = Number(normalized);
    if (teamId < 1 || teamId > totalTeamCount) {
      invalidTokens.push(token);
      return;
    }
    teamIds.push(teamId);
  });

  return {
    raw,
    teamIds: uniqueSorted(teamIds),
    unrestricted: false,
    invalidTokens,
  };
}

export function buildRosterAssignmentCandidates(
  rosters: Array<{ auctionTeamId: string; players: DesiredTeamPlayerInput[] }>,
  totalTeamCount: number,
): RosterAssignmentCandidate[] {
  const allTeamIds = getAllTeamIds(totalTeamCount);

  return rosters.map((roster) => {
    const parsedPlayers = roster.players.map((player) =>
      parseDesiredTeam(player.desired_team, totalTeamCount),
    );
    const restrictedPlayers = parsedPlayers.filter(
      (parsed) => !parsed.unrestricted && parsed.teamIds.length > 0,
    );
    const hasInvalidToken = parsedPlayers.some(
      (parsed) => parsed.invalidTokens.length > 0,
    );
    const candidateTeamIds =
      restrictedPlayers.length === 0
        ? allTeamIds
        : restrictedPlayers.reduce(
            (candidateIds, parsed) => intersect(candidateIds, parsed.teamIds),
            restrictedPlayers[0]?.teamIds ?? allTeamIds,
          );
    const invalidReasons: AssignmentExceptionReason[] = [];

    if (hasInvalidToken) invalidReasons.push("INVALID_DESIRED_TEAM");
    if (restrictedPlayers.length > 0 && candidateTeamIds.length === 0) {
      invalidReasons.push("NO_COMMON_CANDIDATE");
    }

    return {
      auctionTeamId: roster.auctionTeamId,
      candidateTeamIds,
      restricted: restrictedPlayers.length > 0,
      invalidReasons,
    };
  });
}

export function evaluateDesiredTeamConflict(
  rosterPlayers: DesiredTeamPlayerInput[],
  targetPlayer: DesiredTeamPlayerInput,
  totalTeamCount: number,
): DesiredTeamConflictEvaluation {
  const [rosterCandidate] = buildRosterAssignmentCandidates(
    [{ auctionTeamId: "current", players: rosterPlayers }],
    totalTeamCount,
  );
  const targetParsed = parseDesiredTeam(targetPlayer.desired_team, totalTeamCount);
  const targetCandidateTeamIds = targetParsed.unrestricted
    ? getAllTeamIds(totalTeamCount)
    : targetParsed.teamIds;
  const remainingTeamIds = targetParsed.unrestricted
    ? rosterCandidate.candidateTeamIds
    : intersect(rosterCandidate.candidateTeamIds, targetCandidateTeamIds);
  const invalidReasons = [...rosterCandidate.invalidReasons];

  if (targetParsed.invalidTokens.length > 0) {
    invalidReasons.push("INVALID_DESIRED_TEAM");
  }

  if (targetParsed.unrestricted) {
    return {
      status: "NONE",
      rosterCandidateTeamIds: rosterCandidate.candidateTeamIds,
      targetCandidateTeamIds: [],
      remainingTeamIds,
      invalidReasons,
    };
  }

  return {
    status:
      remainingTeamIds.length === 0
        ? "CONFLICT"
        : remainingTeamIds.length < rosterCandidate.candidateTeamIds.length
          ? "NARROWED"
          : "NONE",
    rosterCandidateTeamIds: rosterCandidate.candidateTeamIds,
    targetCandidateTeamIds,
    remainingTeamIds,
    invalidReasons,
  };
}

export function formatTeamIds(teamIds: number[]) {
  return teamIds.map((teamId) => `${teamId}팀`).join(", ");
}

export function getAssignmentExceptionMessage(
  reason: AssignmentExceptionReason,
) {
  switch (reason) {
    case "NO_COMMON_CANDIDATE":
      return "희망 팀 조건을 만족하는 배정 후보가 없습니다. 예외 배정이 필요합니다.";
    case "CANDIDATES_EXHAUSTED":
      return "다른 팀 배정으로 인해 이 로스터의 희망 팀 후보가 모두 소진되었습니다.";
    case "INVALID_DESIRED_TEAM":
      return "인식할 수 없는 희망 팀 값이 있어 예외 배정 검토가 필요합니다.";
    case "FORCED_BY_ORGANIZER":
      return "희망 팀 후보와 다른 팀으로 예외 배정되었습니다.";
  }
}

export function applyTeamAssignmentSelections(
  candidates: RosterAssignmentCandidate[],
  selections: AssignmentSelection[],
  totalTeamCount: number,
): AssignmentResolution[] {
  const selectionByTeam = new Map(
    selections.map((selection) => [selection.auctionTeamId, selection]),
  );
  const assignedTeamIds = new Set(
    selections
      .map((selection) => selection.assignedTeamId)
      .filter((teamId): teamId is number => typeof teamId === "number"),
  );
  const restrictedCandidates = candidates.filter((candidate) => candidate.restricted);
  const restrictedTeamIds = new Set(restrictedCandidates.map((candidate) => candidate.auctionTeamId));
  const restrictedAssignmentsComplete = restrictedCandidates.every((candidate) =>
    assignedTeamIds.has(selectionByTeam.get(candidate.auctionTeamId)?.assignedTeamId ?? -1),
  );
  const allTeamIds = getAllTeamIds(totalTeamCount);

  return candidates.map((candidate) => {
    const selection = selectionByTeam.get(candidate.auctionTeamId);
    const availableCandidateTeamIds = candidate.candidateTeamIds.filter(
      (teamId) => teamId === selection?.assignedTeamId || !assignedTeamIds.has(teamId),
    );
    const exhausted =
      candidate.restricted &&
      candidate.candidateTeamIds.length > 0 &&
      availableCandidateTeamIds.length === 0 &&
      !selection;
    const invalidReasons = exhausted
      ? uniqueReasons([...candidate.invalidReasons, "CANDIDATES_EXHAUSTED"])
      : candidate.invalidReasons;
    const firstReason = invalidReasons[0] ?? null;

    if (selection) {
      return {
        auctionTeamId: candidate.auctionTeamId,
        assignedTeamId: selection.assignedTeamId,
        status: selection.status,
        exceptionReason: selection.exceptionReason,
        candidateTeamIds: candidate.candidateTeamIds,
        availableCandidateTeamIds,
        restricted: candidate.restricted,
        invalidReasons,
        message: selection.exceptionReason
          ? getAssignmentExceptionMessage(selection.exceptionReason)
          : firstReason
            ? getAssignmentExceptionMessage(firstReason)
            : null,
      };
    }

    if (!candidate.restricted && !restrictedTeamIds.has(candidate.auctionTeamId)) {
      const availableAllTeamIds = allTeamIds.filter((teamId) => !assignedTeamIds.has(teamId));
      if (restrictedAssignmentsComplete && availableAllTeamIds.length === 1) {
        return {
          auctionTeamId: candidate.auctionTeamId,
          assignedTeamId: availableAllTeamIds[0] ?? null,
          status: "SUGGESTED",
          candidateTeamIds: candidate.candidateTeamIds,
          availableCandidateTeamIds: availableAllTeamIds,
          restricted: candidate.restricted,
          invalidReasons,
          message: null,
        };
      }
    }

    return {
      auctionTeamId: candidate.auctionTeamId,
      assignedTeamId: null,
      status: "UNASSIGNED",
      candidateTeamIds: candidate.candidateTeamIds,
      availableCandidateTeamIds,
      restricted: candidate.restricted,
      invalidReasons,
      message: firstReason ? getAssignmentExceptionMessage(firstReason) : null,
    };
  });
}

function uniqueReasons(reasons: AssignmentExceptionReason[]) {
  return Array.from(new Set(reasons));
}
