// 방 초대 링크의 권한 정보를 암호화하고 복호화한다.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type RoomInviteRole = "ORGANIZER" | "LEADER" | "VIEWER";

export type RoomInvitePayload = {
  roomId: string;
  role: RoomInviteRole;
  teamId?: string | null;
  token: string;
  issuedAt: number;
};

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

function getInviteSecretMaterial() {
  const secret =
    process.env.ROOM_INVITE_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
    process.env.GOOGLE_PRIVATE_KEY;

  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ROOM_INVITE_SECRET is required in production.");
  }
  return "league-auction-local-room-invite-secret";
}

function getInviteKey() {
  return createHash("sha256").update(getInviteSecretMaterial()).digest();
}

export function createRoomInviteToken(payload: Omit<RoomInvitePayload, "issuedAt">) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getInviteKey(), iv);
  const plaintext = JSON.stringify({
    ...payload,
    issuedAt: Date.now(),
  } satisfies RoomInvitePayload);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [VERSION, base64UrlEncode(iv), base64UrlEncode(tag), base64UrlEncode(encrypted)].join(".");
}

export function parseRoomInviteToken(inviteToken: string): RoomInvitePayload | null {
  const [version, ivValue, tagValue, encryptedValue] = inviteToken.split(".");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    return null;
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, getInviteKey(), base64UrlDecode(ivValue));
    decipher.setAuthTag(base64UrlDecode(tagValue));
    const plaintext = Buffer.concat([
      decipher.update(base64UrlDecode(encryptedValue)),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as Partial<RoomInvitePayload>;

    if (
      typeof payload.roomId !== "string" ||
      typeof payload.token !== "string" ||
      typeof payload.issuedAt !== "number" ||
      (payload.role !== "ORGANIZER" && payload.role !== "LEADER" && payload.role !== "VIEWER")
    ) {
      return null;
    }
    if (payload.role === "LEADER" && typeof payload.teamId !== "string") {
      return null;
    }

    return {
      roomId: payload.roomId,
      role: payload.role,
      teamId: payload.role === "LEADER" ? payload.teamId : null,
      token: payload.token,
      issuedAt: payload.issuedAt,
    };
  } catch {
    return null;
  }
}
