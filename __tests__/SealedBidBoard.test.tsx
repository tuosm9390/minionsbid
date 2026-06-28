// 비공개 입찰 대상 카드의 티어와 희망 팀 표시를 검증한다.
import React, { type ImgHTMLAttributes } from "react";
import { act, render, screen } from "@testing-library/react";
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
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useReducedMotion: () => false,
  motion: {
    div: (
      props: React.HTMLAttributes<HTMLDivElement> & {
        animate?: unknown;
        exit?: unknown;
        initial?: unknown;
        transition?: unknown;
        variants?: unknown;
      },
    ) => {
      const divProps = { ...props };
      delete divProps.animate;
      delete divProps.exit;
      delete divProps.initial;
      delete divProps.transition;
      delete divProps.variants;
      return <div {...divProps}>{props.children}</div>;
    },
  },
}));

vi.mock("@/features/auction/api/auctionActions", () => ({
  completeSealedBidReveal: vi.fn(),
}));

describe("SealedBidBoard", () => {
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

  it("세부 티어 이미지와 희망 팀을 입찰 대상 정보에 표시한다", () => {
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
    expect(screen.getByText("입찰 대상").closest(".pixel-box")).not.toHaveClass(
      "mt-2",
    );
    expect(screen.getByText("입찰 대상").closest(".pixel-box")).toHaveClass(
      "top-1/2",
    );
    expect(screen.getByText("입찰 대상").closest(".pixel-box")).toHaveClass(
      "-translate-y-1/2",
    );
    expect(
      screen.queryByText("팀장들이 입찰을 제출 중입니다"),
    ).not.toBeInTheDocument();
  });

  it("비공개 라운드 시작 전에도 입찰 대상 박스를 중앙에 표시한다", () => {
    const sealedBid: SealedBidState = {
      phase: null,
      roundId: null,
      roundNumber: 0,
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

    expect(screen.getByText("입찰 대상").closest(".pixel-box")).toHaveClass(
      "top-1/2",
    );
    expect(screen.getByText("입찰 대상").closest(".pixel-box")).toHaveClass(
      "-translate-y-1/2",
    );
  });

  it("공개 전 점수 카드는 문구 없이 물음표 뒷면만 표시한다", () => {
    const currentPlayer: Player = {
      id: "player-1",
      room_id: "room-1",
      name: "Alpha",
      tier: "",
      main_position: "",
      sub_position: "",
      status: "IN_AUCTION",
      team_id: null,
      sold_price: null,
      description: "",
      desired_team: "",
    };
    const sealedBid: SealedBidState = {
      phase: "LOCKED",
      roundId: "round-1",
      roundNumber: 1,
      minAmount: 0,
      eligibleTeamIds: null,
      revealOrder: [],
      revealResult: [
        {
          team_id: "team-1",
          team_name: "Blue",
          amount: 100,
          is_pass: false,
          is_highest: false,
          is_tied: false,
          eligible: true,
        },
      ],
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

    expect(screen.queryByText("SEALED BID")).not.toBeInTheDocument();
    const hiddenCard = screen.getByText("?").closest(".sealed-bid-card-back");
    expect(hiddenCard).toBeInTheDocument();
    expect(hiddenCard).toHaveClass("sealed-bid-card-back");
    expect(hiddenCard).toHaveClass("border-minion-blue");
    expect(hiddenCard).toHaveClass("text-minion-blue");
    expect(screen.getByText("입찰가격공개")).toBeInTheDocument();
    expect(screen.getByText("입찰가격공개")).toHaveClass("text-fluid-sm");
    expect(screen.getByText("입찰가격공개")).toHaveClass("absolute");
    expect(screen.getByText("입찰가격공개")).toHaveClass("border-minion-blue");
    expect(screen.getByText("입찰가격공개").closest(".pixel-box")).toHaveClass(
      "bg-white",
    );
    expect(screen.getByText("입찰가격공개").closest(".pixel-box")).toHaveClass(
      "mt-8",
    );
    expect(screen.getByText("입찰가격공개").closest(".pixel-box")).toHaveClass(
      "pt-14",
    );
    expect(hiddenCard?.closest(".sealed-bid-card-bounce")).toBeInTheDocument();
    expect(screen.getByText("입찰 대상")).toHaveClass("absolute");
    expect(screen.getByText("입찰 대상")).toHaveClass("border-black");
    expect(screen.getByText("입찰 대상").closest(".pixel-box")).toHaveClass(
      "p-3",
    );
    expect(screen.getByText("입찰 대상").closest(".pixel-box")).toHaveClass(
      "pt-8",
    );
    expect(screen.getByText("입찰 대상").closest(".pixel-box")).toHaveClass(
      "mt-2",
    );
    expect(screen.getByText("입찰 대상").closest(".pixel-box")).not.toHaveClass(
      "top-1/2",
    );
    expect(screen.getByText("입찰 대상").closest(".pixel-box")).not.toHaveClass(
      "-translate-y-1/2",
    );
  });

  it("입찰가격 공개 단계에서는 입찰 대상 정보를 2열 compact 카드로 표시한다", () => {
    const sealedBid: SealedBidState = {
      phase: "LOCKED",
      roundId: "round-1",
      roundNumber: 1,
      minAmount: 0,
      eligibleTeamIds: null,
      revealOrder: [],
      revealResult: [
        {
          team_id: "team-1",
          team_name: "Blue",
          amount: 100,
          is_pass: false,
          is_highest: false,
          is_tied: false,
          eligible: true,
        },
      ],
      highestAmount: 0,
      tiedTeamIds: [],
    };

    render(
      <SealedBidBoard
        roomId="room-1"
        role="VIEWER"
        currentPlayer={{
          ...currentPlayer,
          desired_team: "Dream Team",
        }}
        teams={[]}
        timerEndsAt={null}
        sealedBid={sealedBid}
      />,
    );

    expect(screen.getByText("입찰가격공개")).toBeInTheDocument();
    expect(screen.getByText("희망 팀")).toBeInTheDocument();
    expect(screen.getByText("Dream Team")).toBeInTheDocument();
    expect(screen.getByText("한마디")).toBeInTheDocument();
    expect(screen.getByText(/라인전 자신 있습니다/)).toBeInTheDocument();
    expect(screen.getByTestId("sealed-bid-target-identity")).toHaveClass(
      "border-2",
    );
    expect(screen.getByText("골드 IV")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("MID / SUP")).toHaveClass("whitespace-nowrap");
  });

  it("같은 비공개 라운드의 가격 공개 전환에서는 컨테이너를 새로 렌더링하지 않는다", () => {
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
    const { container, rerender } = render(
      <SealedBidBoard
        roomId="room-1"
        role="VIEWER"
        currentPlayer={currentPlayer}
        teams={[]}
        timerEndsAt="2026-06-28T00:00:10.000Z"
        sealedBid={sealedBid}
      />,
    );
    const phaseContainer = container.firstElementChild;

    rerender(
      <SealedBidBoard
        roomId="room-1"
        role="VIEWER"
        currentPlayer={currentPlayer}
        teams={[]}
        timerEndsAt={null}
        sealedBid={{
          ...sealedBid,
          phase: "LOCKED",
          revealResult: [
            {
              team_id: "team-1",
              team_name: "Blue",
              amount: 100,
              is_pass: false,
              is_highest: false,
              is_tied: false,
              eligible: true,
            },
          ],
        }}
      />,
    );

    expect(container.firstElementChild).toBe(phaseContainer);
    expect(screen.getByText("입찰가격공개")).toBeInTheDocument();

    rerender(
      <SealedBidBoard
        roomId="room-1"
        role="VIEWER"
        currentPlayer={currentPlayer}
        teams={[]}
        timerEndsAt={null}
        sealedBid={{
          ...sealedBid,
          phase: "REVEALING",
          revealOrder: ["team-1"],
          revealResult: [
            {
              team_id: "team-1",
              team_name: "Blue",
              amount: 100,
              is_pass: false,
              is_highest: true,
              is_tied: false,
              eligible: true,
            },
          ],
          highestAmount: 100,
        }}
      />,
    );

    expect(container.firstElementChild).toBe(phaseContainer);
  });

  it("동점 재입찰 대상이 있으면 확정 버튼을 재입찰 준비로 표시한다", async () => {
    vi.useFakeTimers();
    const sealedBid: SealedBidState = {
      phase: "REVEALING",
      roundId: "round-1",
      roundNumber: 1,
      minAmount: 0,
      eligibleTeamIds: null,
      revealOrder: ["team-1", "team-2"],
      revealResult: [
        {
          team_id: "team-1",
          team_name: "Blue",
          amount: 100,
          is_pass: false,
          is_highest: true,
          is_tied: true,
          eligible: true,
        },
        {
          team_id: "team-2",
          team_name: "Red",
          amount: 100,
          is_pass: false,
          is_highest: true,
          is_tied: true,
          eligible: true,
        },
      ],
      highestAmount: 100,
      tiedTeamIds: ["team-1", "team-2"],
    };

    try {
      render(
        <SealedBidBoard
          roomId="room-1"
          role="ORGANIZER"
          currentPlayer={currentPlayer}
          teams={[]}
          timerEndsAt={null}
          sealedBid={sealedBid}
        />,
      );

      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      await act(async () => {
        vi.advanceTimersByTime(650);
      });

      expect(
        screen.getByRole("button", { name: "재입찰 준비" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "낙찰 결과 반영" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
