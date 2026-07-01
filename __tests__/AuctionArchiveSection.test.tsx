import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuctionArchiveSection } from "@/components/AuctionArchiveSection";

const mockGetVisibleAuctionArchives = vi.fn();

vi.mock("@/features/hall-of-fame/api/hallOfFameActions", () => ({
  getVisibleAuctionArchives: () => mockGetVisibleAuctionArchives(),
}));

describe("AuctionArchiveSection", () => {
  it("archive 상세 모달에 실제 배정 팀 번호를 표시한다", async () => {
    mockGetVisibleAuctionArchives.mockResolvedValue([
      {
        id: "archive-1",
        room_id: "room-1",
        room_name: "테스트 경매",
        closed_at: "2026-07-01T00:00:00.000Z",
        team_assignment: {
          status: "CONFIRMED",
          assignments: [{ auction_team_id: "team-a", assigned_team_id: 2 }],
        },
        result_snapshot: [
          {
            id: "team-a",
            name: "Blue",
            leader_name: "Leader A",
            point_balance: 100,
            players: [],
          },
        ],
      },
    ]);

    render(<AuctionArchiveSection isOpen onClose={() => undefined} />);

    await userEvent.click(await screen.findByText("테스트 경매"));

    await waitFor(() => {
      expect(screen.getByText("실제 2팀")).toBeInTheDocument();
    });
  });
});
