import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateRoomModal } from "@/components/CreateRoomModal";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";

// 1. xlsx 모킹 (hoisted 처리를 위해 최상위에서 mock으로 시작하는 변수명 사용)
const mockXLSXInternal = {
  read: vi.fn().mockReturnValue({
    SheetNames: ["DB"],
    Sheets: {
      DB: {},
    },
  }),
  utils: {
    sheet_to_json: vi.fn().mockReturnValue([
      ["#", "선수명", "닉네임", "티어", "라인", "코멘트", "", "", "", ""], // Header
      [1, "선수1", "Player1", "C", "●", "Description", "", "", "", "●"], // Row 1
    ]),
  },
};

// Vitest의 dynamic import 모킹 가로채기
vi.mock("xlsx", () => ({
  read: vi.fn((...args) => mockXLSXInternal.read(...args)),
  utils: {
    sheet_to_json: vi.fn((...args) =>
      mockXLSXInternal.utils.sheet_to_json(...args),
    ),
  },
}));

// Mock @/lib/firebase to prevent Firebase initialization in test environment
vi.mock("@/lib/firebase", () => ({
  db: {},
  app: {},
}));

vi.mock("@/features/schedules/api/scheduleActions", () => ({
  getLeagueScheduleCatalog: vi.fn().mockResolvedValue({
    leagueOptions: [],
    schedules: [],
  }),
}));

vi.mock("@/features/auction/realtime/clientAdapter", () => ({
  getAuctionClientServices: vi.fn().mockReturnValue({
    firestore: {},
    rtdb: {},
  }),
}));

vi.mock("@/features/auction/api/auctionActions", () => ({
  createRoom: vi.fn().mockResolvedValue({
    roomId: "room-1",
    organizerToken: "organizer-token",
    viewerToken: "viewer-token",
    teams: [],
  }),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => false,
    data: () => ({}),
  }),
  collection: vi.fn(() => ({})),
  getDocs: vi.fn().mockResolvedValue({
    docs: [],
  }),
}));

describe("CreateRoomModal - Phase 3 Optimization Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render create room button and open modal", async () => {
    const user = userEvent.setup();
    render(<CreateRoomModal />);
    const openButton = screen.getByRole("button", { name: /MAKE ROOM/i });
    await user.click(openButton);

    await waitFor(() => {
      expect(screen.getByTestId("room-title-input")).toBeInTheDocument();
    });
  });

  it("should load xlsx library dynamically and parse players on excel upload", async () => {
    const user = userEvent.setup();
    render(<CreateRoomModal />);

    // 모달 열기
    await user.click(screen.getByRole("button", { name: /MAKE ROOM/i }));

    // Step 0 -> Step 1
    const titleInput = screen.getByTestId("room-title-input");
    await user.type(titleInput, "Test Auction");
    await user.click(screen.getByTestId("next-button"));

    // Step 1 -> Step 2
    // 팀장 이름 입력 (기본 5팀)
    const captainInputs = screen.getAllByPlaceholderText("이름");
    for (const input of captainInputs) {
      await user.type(input, "Leader");
    }
    await user.click(screen.getByTestId("next-button"));

    // Step 2: 선수 등록 (엑셀 업로드 확인)
    const uploadButton = screen.getByTestId("excel-upload-button");
    expect(uploadButton).toBeInTheDocument();

    // Hidden file input 찾기 및 파일 업로드 시뮬레이션
    const file = new File(["dummy content"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    await user.upload(fileInput, file);

    // 로직 검증: dynamic import된 xlsx의 read 함수가 호출되었는지 확인
    await waitFor(
      () => {
        expect(mockXLSXInternal.read).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    // UI에 파싱된 데이터가 반영되었는지 확인
    await waitFor(() => {
      // Player1 닉네임이 입력값으로 들어갔는지 확인
      const playerInput = screen.getByDisplayValue("Player1");
      expect(playerInput).toBeInTheDocument();
    });
  });

  it("should show excel upload button on captain registration step", async () => {
    const user = userEvent.setup();
    render(<CreateRoomModal />);

    await user.click(screen.getByRole("button", { name: /MAKE ROOM/i }));

    const titleInput = screen.getByTestId("room-title-input");
    await user.type(titleInput, "Test Auction");
    await user.click(screen.getByTestId("next-button"));

    expect(screen.getByTestId("excel-upload-button")).toBeInTheDocument();
  });
});
