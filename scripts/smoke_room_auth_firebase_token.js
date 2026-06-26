// Firebase custom token 라우트의 운영 smoke 요청을 실행한다.
const process = require("node:process");

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function buildFirebaseTokenSmokeRequests({
  baseUrl,
  roomId,
  teamId,
  leaderToken,
  wrongToken = "invalid-leader-token",
}) {
  const url = `${normalizeBaseUrl(baseUrl)}/api/room-auth/firebase-token`;
  return [
    {
      label: "missing payload returns 400",
      expectedStatus: 400,
      url,
      body: {},
    },
    {
      label: "wrong leader token returns 403",
      expectedStatus: 403,
      url,
      body: {
        roomId,
        role: "LEADER",
        teamId,
        token: wrongToken,
      },
    },
    {
      label: "valid leader token returns 200",
      expectedStatus: 200,
      url,
      body: {
        roomId,
        role: "LEADER",
        teamId,
        token: leaderToken,
      },
    },
  ];
}

function getRequiredConfig(env = process.env) {
  const config = {
    baseUrl: env.ROOM_AUTH_SMOKE_BASE_URL,
    roomId: env.ROOM_AUTH_SMOKE_ROOM_ID,
    teamId: env.ROOM_AUTH_SMOKE_LEADER_TEAM_ID,
    leaderToken: env.ROOM_AUTH_SMOKE_LEADER_TOKEN,
    wrongToken: env.ROOM_AUTH_SMOKE_WRONG_TOKEN || "invalid-leader-token",
  };
  const missing = Object.entries(config)
    .filter(([key, value]) => key !== "wrongToken" && !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`필수 환경 변수가 누락되었습니다: ${missing.join(", ")}`);
  }
  return config;
}

function redactSensitiveResponseBody(text) {
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && typeof data.token === "string") {
      return JSON.stringify({ ...data, token: "[redacted]" });
    }
  } catch {
    return text;
  }
  return text;
}

async function runFirebaseTokenSmoke({
  baseUrl,
  roomId,
  teamId,
  leaderToken,
  wrongToken,
  fetchImpl = fetch,
}) {
  const requests = buildFirebaseTokenSmokeRequests({
    baseUrl,
    roomId,
    teamId,
    leaderToken,
    wrongToken,
  });

  const checks = [];
  for (const request of requests) {
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request.body),
    });
    const text = await response.text();
    const body = redactSensitiveResponseBody(text);
    checks.push({
      label: request.label,
      expectedStatus: request.expectedStatus,
      status: response.status,
      ok: response.status === request.expectedStatus,
      contentType: response.headers.get("content-type") || "",
      body,
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

async function main() {
  const result = await runFirebaseTokenSmoke(getRequiredConfig());
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildFirebaseTokenSmokeRequests,
  getRequiredConfig,
  redactSensitiveResponseBody,
  runFirebaseTokenSmoke,
};
