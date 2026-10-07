// 중앙 경매 타이머의 만료 콜백과 진행률 표시를 검증한다.
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CenterTimer } from "./CenterTimer";

describe("CenterTimer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("남은 시간을 표시하고 만료 콜백을 한 번 호출한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T03:00:00.000Z"));
    const onExpire = vi.fn();

    render(
      <CenterTimer
        timerEndsAt="2026-06-03T03:00:01.000Z"
        auctionDurationMs={1000}
        onExpire={onExpire}
      />,
    );

    expect(screen.getByRole("timer")).toHaveAccessibleName("남은 시간: 0.9초");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("PC 시각이 10초 달라도 서버 시간 보정값으로 동일한 남은 시간을 표시한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T03:00:10.000Z"));

    render(
      <CenterTimer
        timerEndsAt="2026-06-03T03:00:05.000Z"
        serverTimeOffset={-10_000}
        auctionDurationMs={5_000}
      />,
    );

    expect(screen.getByRole("timer")).toHaveAccessibleName("남은 시간: 4.9초");
  });
});
