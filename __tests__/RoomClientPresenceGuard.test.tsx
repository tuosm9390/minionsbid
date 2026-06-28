// RoomClient의 presence guard 전달값을 검증하는 테스트
import { render } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomClient } from "@/app/room/[id]/RoomClient";
import { useAuctionStore } from "@/features/auction/store/useAuctionStore";
import type {
  SealedBidState,
  Team,
} from "@/features/auction/store/useAuctionStore";
import { useAuctionPresenceGuard } from "@/features/auction/hooks/useAuctionPresenceGuard";
import { useFirebasePresence } from "@/features/auction/hooks/usePresence";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/auction/hooks/useAuctionRealtime", () => ({
  useFirebaseRealtime: vi.fn(),
}));

vi.mock("@/features/auction/hooks/usePresence", () => ({
  useFirebasePresence: vi.fn(),
}));

vi.mock("@/features/auction/hooks/useLatencyReporter", () => ({
  useLatencyReporter: vi.fn(),
}));

vi.mock("@/features/auction/hooks/useAuctionPresenceGuard", () => ({
  useAuctionPresenceGuard: vi.fn(),
}));

vi.mock("@/features/auction/hooks/useRoomAuth", () => ({
  useRoomAuth: ({
    role,
  }: {
    role: "ORGANIZER" | "LEADER" | "VIEWER" | null;
  }) => ({
    effectiveRole: role,
  }),
}));

vi.mock("@/features/auction/hooks/useAuctionControl", () => ({
  useAuctionControl: () => ({
    handleCloseLottery: vi.fn(),
    triggerAward: vi.fn(),
  }),
}));

vi.mock("@/features/auction/api/auctionActions", () => ({
  startAuction: vi.fn(),
  deleteRoom: vi.fn(),
  drawNextPlayer: vi.fn(),
  saveAuctionArchive: vi.fn(),
  sendNotice: vi.fn(),
  lockSealedBidRound: vi.fn(),
  revealSealedBidRound: vi.fn(),
}));

vi.mock("@/features/auction/components/AuctionBoard", () => ({
  AuctionBoard: () => <div data-testid="auction-board" />,
}));

vi.mock("@/features/auction/components/TeamList", () => ({
  TeamList: () => <div data-testid="team-list" />,
  UnsoldPanel: () => <div data-testid="unsold-panel" />,
}));

vi.mock("@/features/auction/components/WaitingPanel", () => ({
  WaitingPanel: () => <div data-testid="waiting-panel" />,
}));

vi.mock("@/features/auction/components/ChatPanel", () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}));

vi.mock("@/features/auction/components/BiddingControl", () => ({
  BiddingControl: () => <div data-testid="bidding-control" />,
}));

vi.mock("@/features/auction/components/SealedBiddingControl", () => ({
  SealedBiddingControl: () => <div data-testid="sealed-bidding-control" />,
}));

vi.mock("@/features/auction/components/LatencyDebugPanel", () => ({
  LatencyDebugPanel: () => <div data-testid="latency-debug" />,
}));

vi.mock("@/features/auction/components/HowToUseModal", () => ({
  HowToUseModal: () => <button>도움말</button>,
}));

vi.mock("@/features/auction/components/EndRoomModal", () => ({
  EndRoomModal: () => null,
}));

vi.mock("@/features/auction/components/AuctionResultModal", () => ({
  AuctionResultModal: () => null,
}));

vi.mock("@/features/auction/components/LeaveRoomModal", () => ({
  LeaveRoomModal: () => null,
}));

vi.mock("@/app/room/[id]/components/RoomHeader", () => ({
  RoomHeader: () => <div data-testid="room-header" />,
}));

vi.mock("@/app/room/[id]/components/OrganizerControlPanel", () => ({
  OrganizerControlPanel: () => <div data-testid="organizer-control" />,
}));

vi.mock("@/components/ui/ThreeDIcon", () => ({
  ThreeDIcon: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

const mockedUseAuctionPresenceGuard = vi.mocked(useAuctionPresenceGuard);
const mockedUseFirebasePresence = vi.mocked(useFirebasePresence);

describe("RoomClient presence guard", () => {
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

  const makeTeam = (id: string): Team => ({
    id,
    room_id: "room-1",
    name: id,
    point_balance: 1000,
    leader_name: `${id}-leader`,
    leader_position: "MID",
    leader_description: "",
    captain_points: 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAuctionStore.setState({
      roomId: "room-1",
      roomName: "비공개입찰 방",
      role: "ORGANIZER",
      teamId: null,
      organizerToken: "organizer-token",
      roomAuthToken: "organizer-token",
      captainMode: "IN_ROSTER",
      auctionMode: "SEALED_BID",
      basePoint: 1000,
      totalTeams: 2,
      membersPerTeam: 5,
      timerEndsAt: new Date(Date.now() + 10_000).toISOString(),
      currentPlayerId: "player-1",
      createdAt: new Date().toISOString(),
      roomExists: true,
      isRoomLoaded: true,
      nextAuctionDurationMs: null,
      auctionEventRevision: 1,
      teams: [makeTeam("team-1"), makeTeam("team-2")],
      bids: [],
      liveBid: null,
      sealedBid,
      players: [],
      messagesById: {},
      orderedMessageIds: [],
      presences: [{ role: "LEADER", teamId: "team-1" }],
      isPresenceLoaded: true,
      isLocalConnected: true,
      serverTimeOffset: 0,
      lotteryPlayer: null,
    });
  });

  it("비공개입찰에서 players snapshot이 비어도 정본 currentPlayerId를 guard에 전달한다", () => {
    const { container } = render(
      <RoomClient
        roomId="room-1"
        roleParam="ORGANIZER"
        teamIdParam={null}
        roomAuthTokenParam="organizer-token"
      />,
    );

    expect(mockedUseAuctionPresenceGuard).toHaveBeenCalledWith(
      expect.objectContaining({
        allConnected: true,
        currentPlayerId: "player-1",
        effectiveRole: "ORGANIZER",
        timerEndsAt: expect.any(String) as string,
      }),
    );
    const scaleRoot = container.querySelector(".room-layout-scale");
    expect(scaleRoot).toBeInTheDocument();
    expect(container.querySelector("main")).not.toHaveClass("max-h-[95vh]");
    expect(scaleRoot).toContainElement(
      container.querySelector("[data-testid='room-header']"),
    );
    expect(scaleRoot).toContainElement(
      container.querySelector("[data-testid='auction-board']"),
    );
  });

  it("팀장 token이 없어도 비공개 입찰 패널 렌더링은 유지한다", () => {
    useAuctionStore.setState({
      role: "LEADER",
      teamId: "team-1",
      roomAuthToken: null,
      organizerToken: null,
      presences: [],
    });

    const { getByTestId } = render(
      <RoomClient
        roomId="room-1"
        roleParam="LEADER"
        teamIdParam="team-1"
        roomAuthTokenParam={null}
      />,
    );

    expect(getByTestId("sealed-bidding-control")).toBeInTheDocument();
  });

  it("비공개 입찰 방에서는 presence custom token 인증을 요청하지 않는다", () => {
    useAuctionStore.setState({
      role: "LEADER",
      teamId: "team-1",
      roomAuthToken: "leader-token",
    });

    render(
      <RoomClient
        roomId="room-1"
        roleParam="LEADER"
        teamIdParam="team-1"
        roomAuthTokenParam="leader-token"
      />,
    );

    expect(mockedUseFirebasePresence).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "LEADER",
        teamId: "team-1",
        disableRoomFirebaseAuth: true,
      }),
    );
  });

  it("공개 입찰 방에서는 기존 presence custom token 인증 경로를 유지한다", () => {
    useAuctionStore.setState({
      auctionMode: "OPEN_ASCENDING",
      role: "LEADER",
      teamId: "team-1",
      roomAuthToken: "leader-token",
    });

    render(
      <RoomClient
        roomId="room-1"
        roleParam="LEADER"
        teamIdParam="team-1"
        roomAuthTokenParam="leader-token"
      />,
    );

    expect(mockedUseFirebasePresence).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "LEADER",
        teamId: "team-1",
        disableRoomFirebaseAuth: false,
      }),
    );
  });
});
