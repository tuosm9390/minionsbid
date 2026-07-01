// 최종 팀 배정 저장값을 화면 표시용 배지 텍스트로 변환한다.

export type TeamAssignmentDisplaySource = {
  status?: unknown;
  assignments?: unknown;
} | null | undefined;

export function buildAssignedTeamLabelMap(
  teamAssignment: TeamAssignmentDisplaySource,
): Map<string, string> {
  const labels = new Map<string, string>();
  if (teamAssignment?.status !== "CONFIRMED") return labels;
  if (!Array.isArray(teamAssignment.assignments)) return labels;

  for (const assignment of teamAssignment.assignments) {
    if (typeof assignment !== "object" || assignment === null) continue;
    const record = assignment as Record<string, unknown>;
    const auctionTeamId =
      typeof record.auction_team_id === "string"
        ? record.auction_team_id
        : typeof record.auctionTeamId === "string"
          ? record.auctionTeamId
          : "";
    const assignedTeamId =
      typeof record.assigned_team_id === "number"
        ? record.assigned_team_id
        : typeof record.assignedTeamId === "number"
          ? record.assignedTeamId
          : null;
    if (!auctionTeamId || assignedTeamId === null) continue;
    labels.set(auctionTeamId, `실제 ${assignedTeamId}팀`);
  }

  return labels;
}
