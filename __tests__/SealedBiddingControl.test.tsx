// 비공개 입찰 팀장 컨트롤의 재입찰 대상 제한을 검증한다.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SealedBiddingControl } from "@/features/auction/components/SealedBiddingControl";
import type {
  Player,
  SealedBidState,
  Team,
} from "@/features/auction/store/useAuctionStore";

vi.mock("@/features/auction/api/auctionActions", () => ({
  submitSealedBid: vi.fn(),
}));

const currentPlayer: Player = {
  id: "player-1",
  room_id: "room-1",
  name: "Alpha",
  tier: "골드",
  main_position: "MID",
  sub_position: "",
  status: "IN_AUCTION",
  team_id: null,
  sold_price: null,
  description: "",
};

const myTeam: Team = {
  id: "team-2",
  room_id: "room-1",
  name: "Red",
  point_balance: 1000,
  leader_name: "Red Leader",
  leader_position: "MID",
  leader_description: "",
  captain_points: 0,
};

const makeSealedBid = (teamIds: string[] | null): SealedBidState => ({
  phase: "ACTIVE",
  roundId: "round-2",
  roundNumber: 2,
  minAmount: 100,
  eligibleTeamIds: teamIds,
  revealOrder: [],
  revealResult: [],
  highestAmount: 0,
  tiedTeamIds: [],
});

describe("SealedBiddingControl", () => {
  it("재입찰 비대상 팀장은 추첨 대기 UI만 표시한다", () => {
    render(
      <SealedBiddingControl
        roomId="room-1"
        teamId="team-2"
        leaderToken="leader-token"
        currentPlayer={currentPlayer}
        myTeam={myTeam}
        isAuctionActive
        isTeamFull={false}
        allDone={false}
        sealedBid={makeSealedBid(["team-1"])}
      />,
    );

    expect(
      screen.getByText("다음 선수 추첨을 기다리는 중..."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/보유/)).not.toBeInTheDocument();
    expect(screen.queryByText("최소 금액")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "포기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "제출" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("재입찰 대상 팀장은 입찰 UI를 표시한다", () => {
    render(
      <SealedBiddingControl
        roomId="room-1"
        teamId="team-2"
        leaderToken="leader-token"
        currentPlayer={currentPlayer}
        myTeam={myTeam}
        isAuctionActive
        isTeamFull={false}
        allDone={false}
        sealedBid={makeSealedBid(["team-2"])}
      />,
    );

    expect(screen.getByText("최소 금액")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "포기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "제출" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });
});
