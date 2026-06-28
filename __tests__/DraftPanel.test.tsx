// 재경매 안내 패널의 버튼 위치와 강조 스타일을 검증한다.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftPanel } from "@/features/auction/components/board/DraftPanel";
import type { Player } from "@/features/auction/store/useAuctionStore";

const players: Player[] = [
  {
    id: "player-1",
    room_id: "room-1",
    name: "Alpha",
    tier: "에메랄드",
    main_position: "MID",
    sub_position: "TOP",
    status: "UNSOLD",
    team_id: null,
    sold_price: null,
    description: "",
  },
  {
    id: "player-2",
    room_id: "room-1",
    name: "Bravo",
    tier: "마스터 이상",
    main_position: "정글",
    sub_position: "서폿",
    status: "UNSOLD",
    team_id: null,
    sold_price: null,
    description: "",
  },
];

describe("DraftPanel", () => {
  it("재경매 시작 버튼을 선수 목록 하단에 크게 표시하고 shine 효과를 적용한다", () => {
    render(
      <DraftPanel
        phase="RE_AUCTION_READY"
        isAutoDraftMode={false}
        currentTurnTeam={null}
        playersList={players}
        role="ORGANIZER"
        onDraft={vi.fn()}
        onRestartAuction={vi.fn()}
      />,
    );

    const lastPlayerCard = screen.getByText("Bravo").closest(".pixel-box");
    const restartButton = screen.getByRole("button", {
      name: "재경매 시작",
    });

    expect(lastPlayerCard?.compareDocumentPosition(restartButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(restartButton).toHaveClass("min-h-14");
    expect(restartButton).toHaveClass("px-10");
    expect(restartButton.querySelector(".animate-shine")).toBeInTheDocument();
  });
});
