// 방 초대 토큰의 암호화와 변조 방지를 검증한다.
import { describe, expect, it } from "vitest";
import {
  createRoomInviteToken,
  parseRoomInviteToken,
} from "@/features/auction/utils/roomInviteToken";

describe("roomInviteToken", () => {
  it("encrypts and restores leader invite payload", () => {
    const invite = createRoomInviteToken({
      roomId: "room-1",
      role: "LEADER",
      teamId: "team-1",
      token: "leader-token",
    });

    expect(invite).not.toContain("team-1");
    expect(invite).not.toContain("leader-token");
    expect(parseRoomInviteToken(invite)).toMatchObject({
      roomId: "room-1",
      role: "LEADER",
      teamId: "team-1",
      token: "leader-token",
    });
  });

  it("rejects a modified invite token", () => {
    const invite = createRoomInviteToken({
      roomId: "room-1",
      role: "LEADER",
      teamId: "team-1",
      token: "leader-token",
    });
    const parts = invite.split(".");
    const encrypted = parts[3] ?? "";
    const replacement = encrypted[0] === "A" ? "B" : "A";
    parts[3] = `${replacement}${encrypted.slice(1)}`;
    const modified = parts.join(".");

    expect(parseRoomInviteToken(modified)).toBeNull();
  });
});
