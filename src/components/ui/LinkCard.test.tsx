// 링크 카드의 토큰 제거와 원본 링크 복사 동작을 검증한다.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkCard } from "./LinkCard";

describe("LinkCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("authToken을 숨기고 원본 링크를 복사한다", async () => {
    const onCopy = vi.fn();

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

    await userEvent.click(screen.getByTitle("복사하기"));

    expect(onCopy).toHaveBeenCalledWith(
      "https://example.test/room/1?role=LEADER",
      "leader",
    );
  });
});
