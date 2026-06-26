// 주최자 컨트롤 패널의 주요 버튼 상태를 검증한다.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizerControlPanel } from "@/app/room/[id]/components/OrganizerControlPanel";
import { useAuctionStore } from "@/features/auction/store/useAuctionStore";
import type {
  Player,
  SealedBidState,
} from "@/features/auction/store/useAuctionStore";

const currentPlayer: Player = {
  id: "player-1",
  room_id: "room-1",
  name: "테스트 선수",
  tier: "GOLD",
  main_position: "MID",
  sub_position: "TOP",
  status: "IN_AUCTION",
  team_id: null,
  sold_price: null,
  description: "",
};

const makeSealedBid = (phase: SealedBidState["phase"]): SealedBidState => ({
  phase,
  roundId: "round-1",
  roundNumber: 1,
  minAmount: 0,
  eligibleTeamIds: null,
  revealOrder: [],
  revealResult: [],
  highestAmount: 0,
  tiedTeamIds: [],
});

describe("OrganizerControlPanel", () => {
  beforeEach(() => {
    useAuctionStore.setState({
      isPresenceLoaded: true,
      presences: [],
    });
  });

  it("입찰 가격 공개 페이즈에서는 경매 시작 버튼을 비활성화한다", () => {
    const onStart = vi.fn();

    render(
      <OrganizerControlPanel
        noticeText=""
        setNoticeText={vi.fn()}
        onSendNotice={vi.fn()}
        waitingPlayersCount={1}
        soldPlayersCount={0}
        allDone={false}
        currentPlayer={currentPlayer}
        timerEndsAt={null}
        lotteryPlayer={null}
        isDrawing={false}
        allConnected={true}
        auctionMode="SEALED_BID"
        sealedBid={makeSealedBid("REVEALING")}
        onDraw={vi.fn()}
        onStart={onStart}
        onRevealSealedBid={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "입찰 가격 공개 진행중...",
    });

    expect(button).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "경매 시작" }),
    ).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(onStart).not.toHaveBeenCalled();
  });
});
