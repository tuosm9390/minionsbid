import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AuctionResultModal } from "@/features/auction/components/AuctionResultModal";
import { useAuctionStore } from "@/features/auction/store/useAuctionStore";

describe("AuctionResultModal", () => {
  beforeEach(() => {
    useAuctionStore.setState({
      teams: [
        {
          id: "team-a",
          room_id: "room-1",
          name: "Blue",
          point_balance: 120,
          leader_name: "Leader A",
          leader_position: "TOP",
          leader_description: "",
          captain_points: 0,
        },
      ],
      players: [
        {
          id: "player-1",
          room_id: "room-1",
          name: "Player A",
          tier: "골드",
          main_position: "MID",
          sub_position: "",
          status: "SOLD",
          team_id: "team-a",
          sold_price: 100,
          description: "",
        },
      ],
      membersPerTeam: 2,
      captainMode: "COACH_ONLY",
      teamAssignment: {
        status: "CONFIRMED",
        assignments: [{ auction_team_id: "team-a", assigned_team_id: 3 }],
      },
    });
  });

  it("팀 결과 확인 모달에 실제 배정 팀 번호를 표시한다", () => {
    render(<AuctionResultModal isOpen onClose={() => undefined} />);

    expect(screen.getByText("실제 3팀")).toBeInTheDocument();
  });
});
