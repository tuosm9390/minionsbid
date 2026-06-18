// AuctionBoard 접속 이탈 알림 조건을 검증하는 테스트
import { render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuctionBoard } from "@/features/auction/components/AuctionBoard";
import { useAuctionStore } from "@/features/auction/store/useAuctionStore";
import type { Player } from "@/features/auction/store/useAuctionStore";
import { useAuctionBoard } from "@/features/auction/hooks/useAuctionBoard";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
  },
  useReducedMotion: () => true,
}));

vi.mock("@/features/auction/hooks/useAuctionBoard", () => ({
  useAuctionBoard: vi.fn(),
}));

vi.mock("@/features/auction/components/LotteryAnimation", () => ({
  LotteryAnimation: () => <div>추첨 화면</div>,
}));

vi.mock("@/features/auction/components/SoldOverlay", () => ({
  SoldOverlay: () => null,
}));

vi.mock("@/features/auction/components/UnsoldNotice", () => ({
  UnsoldNotice: () => null,
}));

vi.mock("@/features/auction/components/board/NoticeBanner", () => ({
  NoticeBanner: () => null,
}));

vi.mock("@/features/auction/components/board/CenterTimer", () => ({
  CenterTimer: () => null,
}));

vi.mock("@/features/auction/components/board/PlayerInAuction", () => ({
  PlayerInAuction: () => null,
}));

vi.mock("@/features/auction/components/board/BidStatus", () => ({
  BidStatus: () => null,
}));

vi.mock("@/features/auction/components/board/DraftPanel", () => ({
  DraftPanel: () => null,
}));

vi.mock("@/features/auction/components/board/AuctionWaitingState", () => ({
  AuctionWaitingState: () => <div>대기 화면</div>,
}));

vi.mock("@/features/auction/components/board/SealedBidBoard", () => ({
  SealedBidBoard: () => null,
}));

const mockedUseAuctionBoard = vi.mocked(useAuctionBoard);

describe("AuctionBoard", () => {
  const lotteryPlayer: Player = {
    id: "player-1",
    room_id: "room-1",
    name: "선수1",
    tier: "골드",
    main_position: "MID",
    sub_position: "",
    status: "IN_AUCTION",
    team_id: null,
    sold_price: null,
    description: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuctionStore.setState({
      isPresenceLoaded: true,
      isLocalConnected: true,
      nextAuctionDurationMs: null,
      auctionMode: "OPEN_ASCENDING",
      sealedBid: {
        phase: null,
        roundId: null,
        roundNumber: 0,
        minAmount: 0,
        eligibleTeamIds: null,
        revealOrder: [],
        revealResult: [],
        highestAmount: 0,
        tiedTeamIds: [],
      },
    });

    mockedUseAuctionBoard.mockReturnValue({
      teams: [],
      players: [],
      teamId: null,
      timerEndsAt: null,
      connectedLeaderIds: new Set(),
      currentPlayer: undefined,
      latestNotice: null,
      highestBid: 0,
      topBid: null,
      leadingTeam: null,
      unsoldPlayers: [],
      soldPlayers: [],
      waitingPlayersList: [],
      teamPlayerCounts: [],
      needyTeams: [],
      isRoomComplete: false,
      isAuctionFinished: false,
      isAuctionStarted: false,
      isAuctionComplete: false,
      isAuctionTerminal: false,
      isAutoDraftMode: false,
      hasDraftablePlayers: false,
      phase: "DRAFT",
      currentTurnTeam: null,
      lotteryDone: true,
      setLotteryDone: vi.fn(),
      handleDraft: vi.fn(),
      handleRestartAuction: vi.fn(),
      soldOverlayData: null,
      setSoldOverlayData: vi.fn(),
      unsoldPlayerName: null,
      setUnsoldPlayerName: vi.fn(),
      isProcessingAction: null,
      isRestarting: false,
    });
  });

  it("추첨 후 경매 시작 전 팀장이 끊기면 접속 종료 알림을 표시한다", () => {
    render(
      <AuctionBoard
        isLotteryActive
        lotteryPlayer={lotteryPlayer}
        waitingPlayers={[lotteryPlayer]}
        role="ORGANIZER"
        allConnected={false}
        onCloseLottery={vi.fn()}
        onShowResult={vi.fn()}
        roomId="room-1"
      />,
    );

    expect(screen.getByRole("heading", { name: "연결 끊김" })).toBeInTheDocument();
    expect(
      screen.getByText(/경매 시작을 대기 중입니다/),
    ).toBeInTheDocument();
  });
});
