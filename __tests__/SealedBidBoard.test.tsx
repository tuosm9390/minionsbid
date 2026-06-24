// 비공개 입찰 대상 카드의 티어와 희망 팀 표시를 검증한다.
import React, { type ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SealedBidBoard } from "@/features/auction/components/board/SealedBidBoard";
import type {
  Player,
  SealedBidState,
} from "@/features/auction/store/useAuctionStore";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", props),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: (props: React.HTMLAttributes<HTMLDivElement> & {
      animate?: unknown;
      transition?: unknown;
    }) => {
      const divProps = { ...props };
      delete divProps.animate;
      delete divProps.transition;
      return <div {...divProps}>{props.children}</div>;
    },
  },
}));

vi.mock("@/features/auction/api/auctionActions", () => ({
  completeSealedBidReveal: vi.fn(),
}));

describe("SealedBidBoard", () => {
  it("세부 티어 이미지와 희망 팀을 입찰 대상 정보에 표시한다", () => {
    const currentPlayer: Player = {
      id: "player-1",
      room_id: "room-1",
      name: "Alpha",
      tier: "골드 IV",
      main_position: "MID",
      sub_position: "SUP",
      status: "IN_AUCTION",
      team_id: null,
      sold_price: null,
      description: "라인전 자신 있습니다",
      desired_team: "Blue",
    };
    const sealedBid: SealedBidState = {
      phase: "ACTIVE",
      roundId: "round-1",
      roundNumber: 1,
      minAmount: 0,
      eligibleTeamIds: null,
      revealOrder: [],
      revealResult: [],
      highestAmount: 0,
      tiedTeamIds: [],
    };

    render(
      <SealedBidBoard
        roomId="room-1"
        role="VIEWER"
        currentPlayer={currentPlayer}
        teams={[]}
        timerEndsAt={null}
        sealedBid={sealedBid}
      />,
    );

    expect(screen.getByAltText("골드 IV")).toHaveAttribute(
      "src",
      "/Rank=Gold.png",
    );
    expect(screen.getByText("골드 IV")).toBeInTheDocument();
    expect(screen.getByText("MID / SUP")).toBeInTheDocument();
    expect(screen.getByText("희망 팀")).toBeInTheDocument();
    expect(screen.getByText("Blue")).toBeInTheDocument();
  });
});
