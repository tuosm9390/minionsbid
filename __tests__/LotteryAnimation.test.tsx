// 추첨 애니메이션의 포커스 비의존 완료 동작을 검증한다.
import React, {
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LotteryAnimation } from "@/features/auction/components/LotteryAnimation";
import type { Player } from "@/features/auction/store/useAuctionStore";

type MotionProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

const mockAnimate = {
  start: vi.fn(
    (durationSeconds = 0) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, durationSeconds * 1000);
      }),
  ),
  stop: vi.fn(),
};

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const imageProps = { ...props };
    delete imageProps.fill;
    return React.createElement("img", imageProps);
  },
}));

vi.mock("motion/react", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...props }: MotionProps) =>
          React.createElement("div", props, children),
    },
  ),
  useReducedMotion: () => true,
}));

vi.mock("motion", () => ({
  animate: vi.fn(
    (
      _element,
      _keyframes,
      options?: { duration?: number; repeat?: number },
    ) => {
      const promise =
        options?.repeat === Infinity
          ? new Promise<void>(() => undefined)
          : mockAnimate.start(options?.duration ?? 0);
      return Object.assign(promise, { stop: mockAnimate.stop });
    },
  ),
}));

const player: Player = {
  id: "player-1",
  room_id: "room-1",
  name: "Alpha",
  tier: "골드",
  main_position: "MID",
  sub_position: "TOP",
  status: "IN_AUCTION",
  team_id: null,
  sold_price: null,
  description: "",
};

const eventPlayer: Player = {
  ...player,
  aram_tier: "증바람 악귀",
  tft_tier: "다이아",
};

describe("LotteryAnimation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("애니메이션 완료 후 완료 콜백을 호출한다", async () => {
    vi.useFakeTimers();
    const onFinished = vi.fn();

    render(
      <LotteryAnimation
        candidates={[player]}
        targetPlayer={player}
        onFinished={onFinished}
      />,
    );

    expect(screen.getByText("선수 추첨 진행 중...")).toBeInTheDocument();
    await act(async () => {});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    await act(async () => {});

    expect(screen.getByText("추첨 완료!")).toBeInTheDocument();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("같은 선수 추첨 중 부모가 재렌더되어도 완료 타이머를 다시 시작하지 않는다", async () => {
    vi.useFakeTimers();
    const onFinished = vi.fn();
    const nextOnFinished = vi.fn();

    const { rerender } = render(
      <LotteryAnimation
        candidates={[player]}
        targetPlayer={player}
        onFinished={onFinished}
      />,
    );

    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    rerender(
      <LotteryAnimation
        candidates={[{ ...player }]}
        targetPlayer={{ ...player }}
        onFinished={nextOnFinished}
      />,
    );

    expect(screen.getByText("선수 추첨 진행 중...")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    await act(async () => {});

    expect(screen.getByText("추첨 완료!")).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();
    expect(nextOnFinished).toHaveBeenCalledTimes(1);
  });

  it("비공개 입찰 추첨 정보 표시 옵션이 켜지면 이벤트 게임 정보를 표시한다", () => {
    render(
      <LotteryAnimation
        candidates={[eventPlayer]}
        targetPlayer={eventPlayer}
        showEventGameInfo
      />,
    );

    expect(screen.getByText(/무작위 총력전/)).toBeInTheDocument();
    expect(screen.getByText("증바람 악귀")).toBeInTheDocument();
    expect(screen.getByText("전략적 팀 전투")).toBeInTheDocument();
    expect(screen.getByText("다이아")).toBeInTheDocument();
  });

  it("플레티넘 티어는 플래티넘 이미지로 표시한다", () => {
    render(
      <LotteryAnimation
        candidates={[{ ...player, tier: "플레티넘" }]}
        targetPlayer={{ ...player, tier: "플레티넘" }}
      />,
    );

    expect(screen.getAllByAltText("플레티넘")).not.toHaveLength(0);
    screen
      .getAllByAltText("플레티넘")
      .forEach((image) =>
        expect(image).toHaveAttribute("src", "/Rank=Platinum.png"),
      );
  });
});
