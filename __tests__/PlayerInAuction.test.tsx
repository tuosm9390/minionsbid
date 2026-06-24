// 입찰 대상 선수 카드의 티어와 희망 팀 표시를 검증한다.
import React, { type ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerInAuction } from "@/features/auction/components/board/PlayerInAuction";
import type { Player } from "@/features/auction/store/useAuctionStore";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", props),
}));

describe("PlayerInAuction", () => {
  it("티어 이미지와 희망 팀을 입찰 대상 정보에 표시한다", () => {
    const player: Player & { desired_team: string } = {
      id: "player-1",
      room_id: "room-1",
      name: "Alpha",
      tier: "골드",
      main_position: "MID",
      sub_position: "TOP",
      status: "IN_AUCTION",
      team_id: null,
      sold_price: null,
      description: "",
      desired_team: "Blue",
    };

    render(<PlayerInAuction player={player} />);

    expect(screen.getByAltText("골드")).toHaveAttribute(
      "src",
      "/Rank=Gold.png",
    );
    expect(screen.getByText("골드")).toBeInTheDocument();
    expect(screen.getByText("희망 팀")).toBeInTheDocument();
    expect(screen.getByText("Blue")).toBeInTheDocument();
  });
});
