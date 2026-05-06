import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useBiddingControl } from "@/features/auction/hooks/useBiddingControl";
import { placeBid } from "@/features/auction/api/auctionActions";
import { useAuctionStore } from "@/features/auction/store/useAuctionStore";
import type { Player, Team } from "@/features/auction/store/useAuctionStore";

vi.mock("@/features/auction/api/auctionActions", () => ({
  placeBid: vi.fn(),
}));

describe("useBiddingControl", () => {
  const currentPlayer: Player = {
    id: "p1",
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

  const myTeam: Team = {
    id: "team-1",
    room_id: "room-1",
    name: "팀1",
    point_balance: 1000,
    leader_name: "팀장1",
    leader_position: "TOP",
    leader_description: "",
    captain_points: 0,
  };

  const defaultProps = {
    roomId: "room-1",
    teamId: "team-1",
    currentPlayer,
    myTeam,
    isAuctionActive: true,
    timerEndsAt: new Date(Date.now() + 10000).toISOString(),
    minBid: 10,
    isTeamFull: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuctionStore.setState({
      bids: [],
      liveBid: null,
      timerEndsAt: null,
      players: [],
    });
  });

  it("초기 상태 및 최소 입찰가 설정 확인", () => {
    const { result } = renderHook(() => useBiddingControl(defaultProps));

    expect(result.current.bidAmount).toBe(10);
    expect(result.current.isBidding).toBe(false);
    expect(result.current.bidError).toBeNull();
    expect(result.current.canBid).toBe(true);
  });

  it("다른 팀이 입찰했을 때 최소 입찰가 변경 시 bidAmount가 업데이트됨", () => {
    const { result, rerender } = renderHook(
      (props) => useBiddingControl(props),
      { initialProps: defaultProps },
    );

    // 최소 입찰가가 50으로 변경됨
    rerender({ ...defaultProps, minBid: 50 });

    expect(result.current.bidAmount).toBe(50);
  });

  it("incrementBid() 및 decrementBid() 동작 확인", () => {
    const { result } = renderHook(() => useBiddingControl(defaultProps));

    act(() => {
      result.current.incrementBid();
    });
    expect(result.current.bidAmount).toBe(20);

    act(() => {
      result.current.decrementBid();
    });
    expect(result.current.bidAmount).toBe(10);

    // minBid 이하로 내려가면 안됨
    act(() => {
      result.current.decrementBid();
    });
    expect(result.current.bidAmount).toBe(10);
  });

  it("자신이 최고 입찰자일 때 canBid는 false", () => {
    useAuctionStore.setState({
      liveBid: {
        player_id: "p1",
        team_id: "team-1",
        amount: 50,
        created_at: "",
      },
    });

    const { result } = renderHook(() => useBiddingControl(defaultProps));

    expect(result.current.isLeading).toBe(true);
    expect(result.current.canBid).toBe(false);
  });

  it("handleBid 성공 시 Optimistic Update", async () => {
    const newTimerEndsAt = new Date(Date.now() + 5000).toISOString();
    (placeBid as Mock).mockResolvedValue({ error: undefined, timerEndsAt: newTimerEndsAt });

    const { result } = renderHook(() => useBiddingControl(defaultProps));

    await act(async () => {
      await result.current.handleBid();
    });

    expect(placeBid).toHaveBeenCalledWith("room-1", "p1", "team-1", 10);
    // 입찰 성공 후 금액 자동 10 추가
    expect(result.current.bidAmount).toBe(20);
    expect(result.current.bidError).toBeNull();

    // Store state updated optimistically for timer
    expect(useAuctionStore.getState().timerEndsAt).toBe(newTimerEndsAt);
    expect(useAuctionStore.getState().bids).toEqual([]);
  });

  it("남은 시간 < 5초(4800ms)이면 서버 응답 전에도 timerEndsAt을 낙관 연장한다", async () => {
    let resolveBid!: (value: { error?: string }) => void;
    (placeBid as Mock).mockImplementation(
      () =>
        new Promise<{ error?: string }>((resolve) => {
          resolveBid = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useBiddingControl({
        ...defaultProps,
        timerEndsAt: new Date(Date.now() + 4800).toISOString(),
      }),
    );

    const pending = act(async () => {
      await result.current.handleBid();
    });

    expect(useAuctionStore.getState().timerEndsAt).toBeTruthy();
    expect(
      new Date(useAuctionStore.getState().timerEndsAt as string).getTime() -
        Date.now(),
    ).toBeGreaterThan(4000);

    resolveBid({ error: undefined });
    await pending;
  });

  it("handleBid 에러 발생 시 bidError 설정", async () => {
    (placeBid as Mock).mockResolvedValue({ error: "포인트가 부족합니다." });

    const { result } = renderHook(() => useBiddingControl(defaultProps));

    await act(async () => {
      await result.current.handleBid();
    });

    expect(result.current.bidError).toBe("포인트가 부족합니다.");
    expect(result.current.bidAmount).toBe(10); // 실패 시 금액 변동 없음
  });

  it("handleBid는 성공 전에도 local liveBid를 optimistic하게 세팅한다", async () => {
    let resolveBid!: (value: { error?: string }) => void;
    (placeBid as Mock).mockImplementation(
      () =>
        new Promise<{ error?: string }>((resolve) => {
          resolveBid = resolve;
        }),
    );

    const { result } = renderHook(() => useBiddingControl(defaultProps));

    const pending = act(async () => {
      await result.current.handleBid();
    });

    expect(useAuctionStore.getState().liveBid).toMatchObject({
      player_id: "p1",
      team_id: "team-1",
      amount: 10,
    });
    expect(useAuctionStore.getState().bids).toEqual([]);

    resolveBid({ error: undefined });
    await pending;
  });

  it("handleBid 실패 시 optimistic liveBid를 롤백한다", async () => {
    useAuctionStore.setState({
      liveBid: {
        player_id: "p1",
        team_id: "team-2",
        amount: 20,
        created_at: new Date().toISOString(),
      },
    });
    (placeBid as Mock).mockResolvedValue({ error: "포인트가 부족합니다." });

    const { result } = renderHook(() => useBiddingControl(defaultProps));

    await act(async () => {
      await result.current.handleBid();
    });

    expect(useAuctionStore.getState().liveBid).toMatchObject({
      player_id: "p1",
      team_id: "team-2",
      amount: 20,
    });
    expect(useAuctionStore.getState().bids).toEqual([]);
  });
});
