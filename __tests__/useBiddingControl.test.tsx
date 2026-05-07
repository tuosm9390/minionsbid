import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useBiddingControl } from "@/features/auction/hooks/useBiddingControl";
import { placeBid } from "@/features/auction/api/auctionActions";
import { placeBidDirect } from "@/features/auction/api/placeBidClient";
import { useAuctionStore } from "@/features/auction/store/useAuctionStore";
import type { Player, Team } from "@/features/auction/store/useAuctionStore";

vi.mock("@/features/auction/api/auctionActions", () => ({
  placeBid: vi.fn(),
  broadcastBidEvent: vi.fn().mockResolvedValue(undefined),
}));

// placeBidDirect는 기본적으로 성공 반환 (클라이언트 직접 입찰 경로 테스트)
vi.mock("@/features/auction/api/placeBidClient", () => ({
  placeBidDirect: vi.fn().mockResolvedValue({ timerEndsAt: null, revision: 1 }),
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
      auctionEventRevision: 0,
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
    (placeBidDirect as Mock).mockResolvedValue({ timerEndsAt: newTimerEndsAt });

    const { result } = renderHook(() => useBiddingControl(defaultProps));

    await act(async () => {
      await result.current.handleBid();
    });

    expect(placeBidDirect).toHaveBeenCalledWith({
      roomId: "room-1",
      playerId: "p1",
      teamId: "team-1",
      amount: 10,
    });
    // Server Action은 호출되지 않음 (클라이언트 직접 입찰 성공)
    expect(placeBid).not.toHaveBeenCalled();
    // 입찰 성공 후 금액 자동 10 추가
    expect(result.current.bidAmount).toBe(20);
    expect(result.current.bidError).toBeNull();

    // Store state updated optimistically for timer
    expect(useAuctionStore.getState().timerEndsAt).toBe(newTimerEndsAt);
    expect(useAuctionStore.getState().bids).toEqual([]);
  });

  it("직접 입찰 성공 시 반환된 revision을 로컬 적용 revision으로 기록한다", async () => {
    const newTimerEndsAt = new Date(Date.now() + 5000).toISOString();
    (placeBidDirect as Mock).mockResolvedValue({
      timerEndsAt: newTimerEndsAt,
      revision: 12,
    });

    const { result } = renderHook(() => useBiddingControl(defaultProps));

    await act(async () => {
      await result.current.handleBid();
    });

    expect(useAuctionStore.getState().timerEndsAt).toBe(newTimerEndsAt);
    expect(useAuctionStore.getState().auctionEventRevision).toBe(12);
  });

  it("남은 시간이 5초보다 길면 서버 응답 전 timerEndsAt을 낙관 리셋하지 않는다", async () => {
    let resolveBid!: (value: { timerEndsAt?: string | null; error?: string }) => void;
    (placeBidDirect as Mock).mockImplementation(
      () =>
        new Promise<{ timerEndsAt?: string | null; error?: string }>((resolve) => {
          resolveBid = resolve;
        }),
    );

    const existingTimerEndsAt = new Date(Date.now() + 10000).toISOString();
    const { result } = renderHook(() =>
      useBiddingControl({
        ...defaultProps,
        timerEndsAt: existingTimerEndsAt,
      }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleBid();
    });

    expect(useAuctionStore.getState().timerEndsAt).toBeNull();

    resolveBid({ timerEndsAt: null });
    await act(async () => {
      await pending;
    });
  });

  it("남은 시간이 5초 미만이면 서버 응답 전 timerEndsAt을 5초로 낙관 리셋한다", async () => {
    let resolveBid!: (value: { timerEndsAt?: string | null; error?: string }) => void;
    (placeBidDirect as Mock).mockImplementation(
      () =>
        new Promise<{ timerEndsAt?: string | null; error?: string }>((resolve) => {
          resolveBid = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useBiddingControl({
        ...defaultProps,
        timerEndsAt: new Date(Date.now() + 3000).toISOString(),
      }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleBid();
    });

    expect(useAuctionStore.getState().timerEndsAt).toBeTruthy();
    expect(
      new Date(useAuctionStore.getState().timerEndsAt as string).getTime() -
        Date.now(),
    ).toBeLessThanOrEqual(5000);
    expect(
      new Date(useAuctionStore.getState().timerEndsAt as string).getTime() -
        Date.now(),
    ).toBeGreaterThan(3500);

    resolveBid({ timerEndsAt: null });
    await act(async () => {
      await pending;
    });
  });

  it("handleBid 에러 발생 시 bidError 설정", async () => {
    // 클라이언트 직접 입찰 실패 → Server Action 폴백 → 폴백도 에러
    (placeBidDirect as Mock).mockResolvedValue({ error: "direct-failed" });
    (placeBid as Mock).mockResolvedValue({ error: "포인트가 부족합니다." });

    const { result } = renderHook(() => useBiddingControl(defaultProps));

    await act(async () => {
      await result.current.handleBid();
    });

    expect(result.current.bidError).toBe("포인트가 부족합니다.");
    expect(result.current.bidAmount).toBe(10); // 실패 시 금액 변동 없음
  });

  it("handleBid는 성공 전에도 local liveBid를 optimistic하게 세팅한다", async () => {
    let resolveBid!: (value: { timerEndsAt?: string | null; error?: string }) => void;
    (placeBidDirect as Mock).mockImplementation(
      () =>
        new Promise<{ timerEndsAt?: string | null; error?: string }>((resolve) => {
          resolveBid = resolve;
        }),
    );

    const { result } = renderHook(() => useBiddingControl(defaultProps));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleBid();
    });

    expect(useAuctionStore.getState().liveBid).toMatchObject({
      player_id: "p1",
      team_id: "team-1",
      amount: 10,
    });
    expect(useAuctionStore.getState().bids).toEqual([]);

    resolveBid({ timerEndsAt: null });
    await act(async () => {
      await pending;
    });
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
    // 클라이언트 직접 입찰 실패 → Server Action 폴백 → 폴백도 에러
    (placeBidDirect as Mock).mockResolvedValue({ error: "direct-failed" });
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
