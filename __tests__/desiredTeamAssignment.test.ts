// 희망 팀 문자열과 로스터 배정 후보 계산을 검증한다.
import { describe, expect, it } from "vitest";
import {
  applyTeamAssignmentSelections,
  buildRosterAssignmentCandidates,
  evaluateDesiredTeamConflict,
  getAssignmentExceptionMessage,
  parseDesiredTeam,
} from "@/features/auction/utils/desiredTeamAssignment";

describe("desiredTeamAssignment", () => {
  it("숫자 팀 문자열을 정렬된 후보로 정규화한다", () => {
    expect(parseDesiredTeam("2팀, 1 / 2", 8)).toEqual({
      raw: "2팀, 1 / 2",
      teamIds: [1, 2],
      unrestricted: false,
      invalidTokens: [],
    });
  });

  it("빈 값과 상관없음 계열은 제한 없음으로 처리한다", () => {
    expect(parseDesiredTeam("", 8).unrestricted).toBe(true);
    expect(parseDesiredTeam("무관", 8).unrestricted).toBe(true);
    expect(parseDesiredTeam("상관없음", 8).teamIds).toEqual([]);
  });

  it("범위 밖 숫자와 비숫자 토큰을 invalid로 기록한다", () => {
    expect(parseDesiredTeam("1팀, 9팀, Blue", 8)).toMatchObject({
      teamIds: [1],
      unrestricted: false,
      invalidTokens: ["9팀", "Blue"],
    });
  });

  it("로스터의 제한 있는 선수 희망 팀 교집합을 후보로 계산한다", () => {
    const candidates = buildRosterAssignmentCandidates(
      [
        {
          auctionTeamId: "team-a",
          players: [
            { desired_team: "1팀, 2팀" },
            { desired_team: "2팀, 3팀" },
            { desired_team: "상관없음" },
          ],
        },
      ],
      8,
    );

    expect(candidates[0]).toMatchObject({
      auctionTeamId: "team-a",
      candidateTeamIds: [2],
      restricted: true,
      invalidReasons: [],
    });
  });

  it("현재 로스터와 입찰 대상의 후보가 겹치지 않으면 충돌을 반환한다", () => {
    expect(
      evaluateDesiredTeamConflict(
        [{ desired_team: "1팀" }, { desired_team: "2팀" }],
        { desired_team: "3팀" },
        8,
      ),
    ).toMatchObject({
      status: "CONFLICT",
      remainingTeamIds: [],
    });
  });

  it("입찰 대상 때문에 후보가 줄어들면 주의 상태와 남은 후보를 반환한다", () => {
    expect(
      evaluateDesiredTeamConflict(
        [{ desired_team: "1팀, 2팀, 3팀" }],
        { desired_team: "2팀, 3팀" },
        8,
      ),
    ).toMatchObject({
      status: "NARROWED",
      remainingTeamIds: [2, 3],
    });
  });

  it("상관없음 선수는 충돌 제한 조건으로 계산하지 않는다", () => {
    expect(
      evaluateDesiredTeamConflict(
        [{ desired_team: "상관없음" }],
        { desired_team: "무관" },
        8,
      ),
    ).toMatchObject({
      status: "NONE",
      remainingTeamIds: [1, 2, 3, 4, 5, 6, 7, 8],
    });
  });

  it("제한 팀 배정 전에는 상관없음 중심 팀 자동 제안을 보류하고 완료 후 제안한다", () => {
    const candidates = buildRosterAssignmentCandidates(
      [
        { auctionTeamId: "team-c", players: [{ desired_team: "1팀" }] },
        { auctionTeamId: "team-d", players: [{ desired_team: "상관없음" }] },
      ],
      2,
    );

    const before = applyTeamAssignmentSelections(candidates, [], 2);
    expect(before.find((row) => row.auctionTeamId === "team-d")?.status).toBe(
      "UNASSIGNED",
    );

    const after = applyTeamAssignmentSelections(
      candidates,
      [{ auctionTeamId: "team-c", assignedTeamId: 1, status: "MANUAL" }],
      2,
    );
    expect(after.find((row) => row.auctionTeamId === "team-d")).toMatchObject({
      assignedTeamId: 2,
      status: "SUGGESTED",
    });
  });

  it("예외 배정 사유별 1차 표시 문구를 반환한다", () => {
    expect(getAssignmentExceptionMessage("NO_COMMON_CANDIDATE")).toBe(
      "희망 팀 조건을 만족하는 배정 후보가 없습니다. 예외 배정이 필요합니다.",
    );
  });
});
