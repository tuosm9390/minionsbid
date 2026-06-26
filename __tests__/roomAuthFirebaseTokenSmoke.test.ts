// Firebase custom token 운영 smoke 스크립트 계약을 검증한다.
import { describe, expect, it, vi } from "vitest";

const {
  buildFirebaseTokenSmokeRequests,
  runFirebaseTokenSmoke,
} = await import("../scripts/smoke_room_auth_firebase_token.js");

describe("smoke_room_auth_firebase_token", () => {
  it("누락 입력, 잘못된 팀장 토큰, 정상 팀장 토큰 요청을 고정 순서로 만든다", () => {
    const requests = buildFirebaseTokenSmokeRequests({
      baseUrl: "https://example.com",
      roomId: "room-1",
      teamId: "team-1",
      leaderToken: "leader-token",
      wrongToken: "wrong-token",
    });

    expect(requests).toEqual([
      {
        label: "missing payload returns 400",
        expectedStatus: 400,
        url: "https://example.com/api/room-auth/firebase-token",
        body: {},
      },
      {
        label: "wrong leader token returns 403",
        expectedStatus: 403,
        url: "https://example.com/api/room-auth/firebase-token",
        body: {
          roomId: "room-1",
          role: "LEADER",
          teamId: "team-1",
          token: "wrong-token",
        },
      },
      {
        label: "valid leader token returns 200",
        expectedStatus: 200,
        url: "https://example.com/api/room-auth/firebase-token",
        body: {
          roomId: "room-1",
          role: "LEADER",
          teamId: "team-1",
          token: "leader-token",
        },
      },
    ]);
  });

  it("예상 status와 다른 응답을 smoke 실패로 반환한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        status: 400,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => '{"error":"invalid request"}',
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => '{"token":"unexpected"}',
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => '{"token":"ok"}',
      });

    const result = await runFirebaseTokenSmoke({
      baseUrl: "https://example.com",
      roomId: "room-1",
      teamId: "team-1",
      leaderToken: "leader-token",
      wrongToken: "wrong-token",
      fetchImpl: fetchMock,
    });

    expect(result.ok).toBe(false);
    expect(result.checks[2]?.body).toBe('{"token":"[redacted]"}');
    expect(result.checks.map((check) => ({
      label: check.label,
      ok: check.ok,
      status: check.status,
    }))).toEqual([
      { label: "missing payload returns 400", ok: true, status: 400 },
      { label: "wrong leader token returns 403", ok: false, status: 200 },
      { label: "valid leader token returns 200", ok: true, status: 200 },
    ]);
  });
});
