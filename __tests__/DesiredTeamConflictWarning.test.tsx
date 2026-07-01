// 입찰 중 희망 팀 충돌 경고 표시를 검증한다.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesiredTeamConflictWarning } from "@/features/auction/components/DesiredTeamConflictWarning";

describe("DesiredTeamConflictWarning", () => {
  it("충돌 상태면 강한 경고 문구를 표시한다", () => {
    render(
      <DesiredTeamConflictWarning
        evaluation={{
          status: "CONFLICT",
          rosterCandidateTeamIds: [1],
          targetCandidateTeamIds: [3],
          remainingTeamIds: [],
          invalidReasons: [],
        }}
      />,
    );

    expect(
      screen.getByText(
        "현재 로스터의 희망 팀과 입찰 대상 선수의 희망 팀이 겹치지 않습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("desired-team-conflict-warning")).toHaveClass(
      "border-minion-red",
    );
  });

  it("후보가 줄어드는 상태면 남은 후보를 표시한다", () => {
    render(
      <DesiredTeamConflictWarning
        evaluation={{
          status: "NARROWED",
          rosterCandidateTeamIds: [1, 2, 3],
          targetCandidateTeamIds: [2, 3],
          remainingTeamIds: [2, 3],
          invalidReasons: [],
        }}
      />,
    );

    expect(screen.getByText("남은 배정 후보: 2팀, 3팀")).toBeInTheDocument();
  });

  it("충돌이 없으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <DesiredTeamConflictWarning
        evaluation={{
          status: "NONE",
          rosterCandidateTeamIds: [1, 2, 3],
          targetCandidateTeamIds: [],
          remainingTeamIds: [1, 2, 3],
          invalidReasons: [],
        }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
