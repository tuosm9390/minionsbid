import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useAuctionBoard } from "@/features/auction/hooks/useAuctionBoard";
import {
  draftPlayer,
  restartAuctionWithUnsold,
} from "@/features/auction/api/auctionActions";
import { useAuctionStore } from "@/features/auction/store/useAuctionStore";
import type { Player, Role, Team } from "@/features/auction/store/useAuctionStore";

vi.mock("@/features/auction/api/auctionActions", () => ({
  draftPlayer: vi.fn(),
  restartAuctionWithUnsold: vi.fn(),
}));

describe("useAuctionBoard", () => {
  const makeTeam = (id: string, name: string, pointBalance = 1000): Team => ({
    id,
    room_id: "room-1",
    name,
    point_balance: pointBalance,
    leader_name: `${name}-leader`,
    leader_position: "TOP",
    leader_description: "",
    captain_points: 0,
  });

  const makePlayer = (
    id: string,
    name: string,
    status: Player["status"],
    teamId: string | null = null,
    soldPrice: number | null = null,
  ): Player => ({
    id,
    room_id: "room-1",
    name,
    tier: "골드",
    main_position: "MID",
    sub_position: "",
    status,
    team_id: teamId,
    sold_price: soldPrice,
    description: "",
  });

  const defaultProps = {
    isLotteryActive: false,
    lotteryPlayer: null,
    role: "ORGANIZER" as Role,
    allConnected: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuctionStore.setState({
      roomId: "room-1",
      teamId: "team-1",
      players: [],
      bids: [],
      teams: [],
      presences: [],
      messages: [],
      membersPerTeam: 5,
      captainMode: "IN_ROSTER",
    });
  });

  it("초기 상태 및 파생 상태 계산 (경매 대기)", () => {
    useAuctionStore.setState({
      teams: [
        makeTeam("team-1", "팀1"),
        makeTeam("team-2", "팀2"),
      ],
      players: [makePlayer("p1", "선수1", "WAITING")],
    });

    const { result } = renderHook(() => useAuctionBoard(defaultProps));

    expect(result.current.isAuctionComplete).toBe(false);
    expect(result.current.currentPlayer).toBeUndefined();
    expect(result.current.isAutoDraftMode).toBe(false); // 아직 조건 불충족
    expect(result.current.needyTeams).toHaveLength(2);
  });

  it("현재 경매 중인 선수 확인 (currentPlayer)", () => {
    useAuctionStore.setState({
      players: [makePlayer("p1", "선수1", "IN_AUCTION"), makePlayer("p2", "선수2", "WAITING")],
    });

    const { result } = renderHook(() => useAuctionBoard(defaultProps));

    expect(result.current.currentPlayer).toMatchObject({ id: "p1" });
  });

  it("handleDraft 실행 (0P 낙찰)", async () => {
    (draftPlayer as Mock).mockResolvedValue({ error: undefined });
    useAuctionStore.setState({
      teams: [makeTeam("team-1", "팀1")],
    });

    const { result } = renderHook(() => useAuctionBoard(defaultProps));

    // needyTeam이 존재하므로 currentTurnTeam이 결정됨
    await act(async () => {
      await result.current.handleDraft("p-unsold");
    });

    expect(draftPlayer).toHaveBeenCalledWith("room-1", "p-unsold", "team-1");
    expect(result.current.isProcessingAction).toBeNull();
  });

  it("handleRestartAuction (재경매)", async () => {
    (restartAuctionWithUnsold as Mock).mockResolvedValue({
      error: undefined,
      reAuctionStarted: true,
    });

    const { result } = renderHook(() => useAuctionBoard(defaultProps));

    await act(async () => {
      await result.current.handleRestartAuction();
    });

    expect(restartAuctionWithUnsold).toHaveBeenCalledWith("room-1");
    expect(useAuctionStore.getState().isReAuctionRound).toBe(true);
  });

  it("AutoDraftMode 활성화 조건", () => {
    useAuctionStore.setState({
      teams: [
        makeTeam("team-1", "팀1"),
        makeTeam("team-2", "팀2", 0),
      ],
      players: [makePlayer("p1", "선수1", "WAITING")],
      membersPerTeam: 5,
    });

    const { result } = renderHook(() => useAuctionBoard(defaultProps));

    // 조건: currentPlayer 없고, waiting > 0, unsold == 0, biddableTeams <= 1
    expect(result.current.isAutoDraftMode).toBe(true);
  });

  it("TC-1: IN_AUCTION→SOLD 전환 시 soldOverlayData가 설정된다", () => {
    useAuctionStore.setState({
      teams: [makeTeam("team-1", "팀1")],
      players: [makePlayer("p1", "선수1", "IN_AUCTION")],
    });

    const { result } = renderHook(() => useAuctionBoard(defaultProps));
    expect(result.current.currentPlayer).toMatchObject({ id: "p1" });

    act(() => {
      useAuctionStore.setState({
        players: [
          makePlayer("p1", "선수1", "SOLD", "team-1", 100),
        ],
      });
    });

    expect(result.current.soldOverlayData).toMatchObject({
      playerName: "선수1",
      teamName: "팀1",
      price: 100,
      tier: "골드",
      position: "MID",
    });
  });

  it("TC-2: IN_AUCTION→UNSOLD 전환 시 soldOverlayData가 null로 유지된다", () => {
    useAuctionStore.setState({
      teams: [makeTeam("team-1", "팀1")],
      players: [makePlayer("p1", "선수1", "IN_AUCTION")],
    });

    const { result } = renderHook(() => useAuctionBoard(defaultProps));

    act(() => {
      useAuctionStore.setState({
        players: [makePlayer("p1", "선수1", "UNSOLD")],
      });
    });

    expect(result.current.soldOverlayData).toBeNull();
  });

  it("TC-3: currentPlayer가 새로 생기면 soldOverlayData가 null로 유지된다", () => {
    useAuctionStore.setState({ players: [] });

    const { result } = renderHook(() => useAuctionBoard(defaultProps));
    expect(result.current.soldOverlayData).toBeNull();

    act(() => {
      useAuctionStore.setState({
        players: [makePlayer("p1", "선수1", "IN_AUCTION")],
      });
    });

    expect(result.current.soldOverlayData).toBeNull();
  });

  it("COACH_ONLY에서는 팀장 제외 슬롯 기준으로 팀 충원 상태를 계산한다", () => {
    useAuctionStore.setState({
      teams: [makeTeam("team-1", "팀1")],
      players: [
        makePlayer("p1", "선수1", "SOLD", "team-1", 100),
        makePlayer("p2", "선수2", "SOLD", "team-1", 100),
        makePlayer("p3", "선수3", "SOLD", "team-1", 100),
        makePlayer("p4", "선수4", "SOLD", "team-1", 100),
      ],
      membersPerTeam: 5,
      captainMode: "COACH_ONLY",
    });

    const { result } = renderHook(() => useAuctionBoard(defaultProps));

    expect(result.current.needyTeams).toHaveLength(1);
    expect(result.current.isRoomComplete).toBe(false);
  });

  it("모든 선수가 SOLD이고 추가 드래프트 대상이 없으면 팀 슬롯이 비어 있어도 종료 상태로 본다", () => {
    useAuctionStore.setState({
      teams: [makeTeam("team-1", "팀1"), makeTeam("team-2", "팀2")],
      players: [
        makePlayer("p1", "선수1", "SOLD", "team-1", 100),
        makePlayer("p2", "선수2", "SOLD", "team-2", 100),
      ],
      membersPerTeam: 3,
    });

    const { result } = renderHook(() => useAuctionBoard(defaultProps));

    expect(result.current.isRoomComplete).toBe(false);
    expect(result.current.hasDraftablePlayers).toBe(false);
    expect(result.current.isAuctionTerminal).toBe(true);
    expect(result.current.isAuctionComplete).toBe(true);
  });
});
