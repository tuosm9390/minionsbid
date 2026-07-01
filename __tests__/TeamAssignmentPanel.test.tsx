// 경매 종료 후 실제 팀 배정 패널 동작을 검증한다.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeamAssignmentPanel } from "@/features/auction/components/TeamAssignmentPanel";
import type { Player, Team } from "@/features/auction/store/useAuctionStore";

vi.mock("@/features/auction/api/teamAssignmentActions", () => ({
  saveTeamAssignment: vi.fn().mockResolvedValue({}),
}));

const teams: Team[] = [
  {
    id: "team-c",
    room_id: "room-1",
    name: "C팀",
    point_balance: 0,
    leader_name: "C",
    leader_position: "TOP",
    leader_description: "",
    captain_points: 0,
  },
  {
    id: "team-d",
    room_id: "room-1",
    name: "D팀",
    point_balance: 0,
    leader_name: "D",
    leader_position: "MID",
    leader_description: "",
    captain_points: 0,
  },
  {
    id: "team-e",
    room_id: "room-1",
    name: "E팀",
    point_balance: 0,
    leader_name: "E",
    leader_position: "JGL",
    leader_description: "",
    captain_points: 0,
  },
];

const players: Player[] = [
  {
    id: "p1",
    room_id: "room-1",
    name: "C1",
    tier: "",
    main_position: "",
    sub_position: "",
    status: "SOLD",
    team_id: "team-c",
    sold_price: 10,
    description: "",
    desired_team: "1팀, 5팀, 6팀",
  },
  {
    id: "p2",
    room_id: "room-1",
    name: "D1",
    tier: "",
    main_position: "",
    sub_position: "",
    status: "SOLD",
    team_id: "team-d",
    sold_price: 10,
    description: "",
    desired_team: "상관없음",
  },
  {
    id: "p3",
    room_id: "room-1",
    name: "E1",
    tier: "",
    main_position: "",
    sub_position: "",
    status: "SOLD",
    team_id: "team-e",
    sold_price: 10,
    description: "",
    desired_team: "7팀",
  },
  {
    id: "p4",
    room_id: "room-1",
    name: "E2",
    tier: "",
    main_position: "",
    sub_position: "",
    status: "SOLD",
    team_id: "team-e",
    sold_price: 10,
    description: "",
    desired_team: "8팀",
  },
];

describe("TeamAssignmentPanel", () => {
  it("제한 팀 배정 완료 전에는 상관없음 팀 자동 제안을 보류한다", async () => {
    render(
      <TeamAssignmentPanel
        roomId="room-1"
        organizerToken="organizer-token"
        teams={teams}
        players={players}
        totalTeamCount={8}
        onSaved={vi.fn()}
      />,
    );

    await userEvent.selectOptions(
      within(screen.getByTestId("team-assignment-row-team-c")).getByLabelText(
        "배정 예정 팀",
      ),
      "1",
    );

    expect(screen.getByTestId("team-assignment-row-team-d")).toHaveTextContent(
      "제안 대기",
    );
  });

  it("제한 팀 배정이 끝난 뒤 상관없음 팀에 남은 단일 후보를 제안한다", async () => {
    render(
      <TeamAssignmentPanel
        roomId="room-1"
        organizerToken="organizer-token"
        teams={teams.slice(0, 2)}
        players={players.slice(0, 2)}
        totalTeamCount={2}
        onSaved={vi.fn()}
      />,
    );

    await userEvent.selectOptions(
      within(screen.getByTestId("team-assignment-row-team-c")).getByLabelText(
        "배정 예정 팀",
      ),
      "1",
    );

    expect(screen.getByTestId("team-assignment-row-team-d")).toHaveTextContent(
      "2팀 제안",
    );
    expect(screen.getByRole("button", { name: "최종 배정 확정" })).toBeEnabled();
  });

  it("후보가 없는 로스터도 예외 배정을 선택할 수 있고 사유 문구를 표시한다", async () => {
    render(
      <TeamAssignmentPanel
        roomId="room-1"
        organizerToken="organizer-token"
        teams={teams}
        players={players}
        totalTeamCount={8}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByTestId("team-assignment-row-team-e")).toHaveTextContent(
      "후보: 팀 내 희망팀 충돌",
    );
    expect(screen.getByTestId("team-assignment-row-team-e")).toHaveTextContent(
      "희망 팀 조건을 만족하는 배정 후보가 없습니다. 예외 배정이 필요합니다.",
    );

    await userEvent.selectOptions(
      within(screen.getByTestId("team-assignment-row-team-e")).getByLabelText(
        "배정 예정 팀",
      ),
      "4",
    );

    expect(screen.getByTestId("team-assignment-row-team-e")).toHaveTextContent(
      "예외 배정",
    );
  });

  it("다른 로스터에 배정된 실제 팀은 남은 후보 표시에서 제거한다", async () => {
    render(
      <TeamAssignmentPanel
        roomId="room-1"
        organizerToken="organizer-token"
        teams={[
          {
            id: "team-blue",
            room_id: "room-1",
            name: "Blue",
            point_balance: 0,
            leader_name: "Blue",
            leader_position: "TOP",
            leader_description: "",
            captain_points: 0,
          },
          {
            id: "team-yellow",
            room_id: "room-1",
            name: "Yellow",
            point_balance: 0,
            leader_name: "Yellow",
            leader_position: "SUP",
            leader_description: "",
            captain_points: 0,
          },
        ]}
        players={[
          {
            id: "blue-1",
            room_id: "room-1",
            name: "Blue1",
            tier: "",
            main_position: "",
            sub_position: "",
            status: "SOLD",
            team_id: "team-blue",
            sold_price: 10,
            description: "",
            desired_team: "1팀",
          },
          {
            id: "yellow-1",
            room_id: "room-1",
            name: "Yellow1",
            tier: "",
            main_position: "",
            sub_position: "",
            status: "SOLD",
            team_id: "team-yellow",
            sold_price: 10,
            description: "",
            desired_team: "1팀, 4팀",
          },
        ]}
        totalTeamCount={4}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByTestId("team-assignment-row-team-yellow")).toHaveTextContent(
      "후보: 1팀, 4팀",
    );

    await userEvent.selectOptions(
      within(screen.getByTestId("team-assignment-row-team-blue")).getByLabelText(
        "배정 예정 팀",
      ),
      "1",
    );

    expect(screen.getByTestId("team-assignment-row-team-yellow")).toHaveTextContent(
      "후보: 4팀",
    );
    expect(screen.getByTestId("team-assignment-row-team-yellow")).not.toHaveTextContent(
      "후보: 1팀, 4팀",
    );
  });

  it("이미 다른 로스터에 배정된 실제 팀 option은 선택할 수 없게 비활성화한다", async () => {
    render(
      <TeamAssignmentPanel
        roomId="room-1"
        organizerToken="organizer-token"
        teams={teams.slice(0, 2)}
        players={[
          { ...players[0], team_id: "team-c", desired_team: "1팀, 2팀" },
          { ...players[1], team_id: "team-d", desired_team: "1팀, 2팀" },
        ]}
        totalTeamCount={2}
        onSaved={vi.fn()}
      />,
    );

    await userEvent.selectOptions(
      within(screen.getByTestId("team-assignment-row-team-c")).getByLabelText(
        "배정 예정 팀",
      ),
      "1",
    );

    const dSelect = within(
      screen.getByTestId("team-assignment-row-team-d"),
    ).getByLabelText("배정 예정 팀");
    expect(within(dSelect).getByRole("option", { name: "1팀" })).toBeDisabled();
    expect(within(dSelect).getByRole("option", { name: "2팀" })).not.toBeDisabled();
  });

  it("희망 팀이 하나도 없는 로스터는 후보를 상관없음으로 표시하고 경고를 표시하지 않는다", () => {
    render(
      <TeamAssignmentPanel
        roomId="room-1"
        organizerToken="organizer-token"
        teams={[teams[1]!]}
        players={[players[1]!]}
        totalTeamCount={8}
        onSaved={vi.fn()}
      />,
    );

    const row = screen.getByTestId("team-assignment-row-team-d");
    expect(row).toHaveTextContent("후보: 상관없음");
    expect(row).toHaveTextContent("상태: 제안 대기");
    expect(row).not.toHaveTextContent("예외 배정");
    expect(row).not.toHaveTextContent("경고");
    expect(row).not.toHaveTextContent("희망 팀 조건을 만족하는 배정 후보가 없습니다");
  });
});
