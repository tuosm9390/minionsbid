// 실시간 지연 디버그 패널의 표시 조건과 marker 렌더링을 검증한다.
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LatencyDebugPanel } from "./LatencyDebugPanel";

vi.mock("@/features/auction/store/useAuctionStore", () => ({
  useAuctionStore: (selector: (state: {
    timerEndsAt: string | null;
    currentPlayerId: string | null;
    auctionEventRevision: number;
    liveBid: { team_id: string; amount: number } | null;
  }) => unknown) =>
    selector({
      timerEndsAt: "2026-06-03T03:00:00.000Z",
      currentPlayerId: "player-1",
      auctionEventRevision: 7,
      liveBid: { team_id: "team-1", amount: 30 },
    }),
}));

describe("LatencyDebugPanel", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("debugRealtime 플래그가 없으면 패널을 숨긴다", () => {
    render(<LatencyDebugPanel />);

    expect(screen.queryByText("Realtime Debug")).not.toBeInTheDocument();
  });

  it("debugRealtime 플래그가 있으면 최근 marker를 표시한다", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("debugRealtime", "1");
    Object.assign(window, {
      __auctionLatencyMarkers__: [
        {
          eventId: "event-1",
          amount: 30,
          appliedAt: Date.now() - 100,
          source: "rtdb",
        },
      ],
    });

    render(<LatencyDebugPanel />);

    await vi.runOnlyPendingTimersAsync();

    expect(screen.getByText("Realtime Debug")).toBeInTheDocument();
    expect(screen.getByText("event-1")).toBeInTheDocument();
    expect(screen.getByText("rtdb")).toBeInTheDocument();
  });
});

