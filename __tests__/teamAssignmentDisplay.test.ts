import { describe, expect, it } from "vitest";
import { buildAssignedTeamLabelMap } from "@/features/auction/utils/teamAssignmentDisplay";

describe("buildAssignedTeamLabelMap", () => {
  it("confirmed assignment를 경매 팀별 실제 팀 배지 문구로 변환한다", () => {
    const labels = buildAssignedTeamLabelMap({
      status: "CONFIRMED",
      assignments: [
        { auction_team_id: "team-a", assigned_team_id: 2 },
        { auctionTeamId: "team-b", assignedTeamId: 4 },
      ],
    });

    expect(labels.get("team-a")).toBe("실제 2팀");
    expect(labels.get("team-b")).toBe("실제 4팀");
  });

  it("확정되지 않았거나 배정 정보가 없는 데이터는 빈 map을 반환한다", () => {
    expect(buildAssignedTeamLabelMap(null).size).toBe(0);
    expect(
      buildAssignedTeamLabelMap({
        status: "DRAFT",
        assignments: [{ auction_team_id: "team-a", assigned_team_id: 1 }],
      }).size,
    ).toBe(0);
  });
});
