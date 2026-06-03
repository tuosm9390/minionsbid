// 링크 카드의 토큰 제거와 단축 링크 복사 동작을 검증한다.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkCard } from "./LinkCard";

describe("LinkCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("authToken을 숨기고 단축 링크가 준비되면 단축 링크를 복사한다", async () => {
    const onCopy = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          links: [
            {
              key: "leader",
              orgUrl: "https://example.test/room/1?role=LEADER",
              shortUrl: "https://short.test/a",
              error: null,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <LinkCard
        label="팀장"
        desc="팀장 링크"
        link="https://example.test/room/1?role=LEADER&authToken=secret"
        linkKey="leader"
        copied={null}
        onCopy={onCopy}
      />,
    );

    expect(screen.getByText("https://example.test/room/1?role=LEADER")).toBeInTheDocument();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("https://short.test/a")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByTitle("복사하기"));

    expect(onCopy).toHaveBeenCalledWith("https://short.test/a", "leader");
  });
});

