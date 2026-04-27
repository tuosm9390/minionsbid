require("dotenv").config({ path: ".env.local" });

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const ROOM_AUTH_COLLECTION = "room_auth_secrets";
const ROOM_AUTH_TEAM_TOKENS_COLLECTION = "team_tokens";

function initializeAdmin() {
  if (admin.apps.length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin 환경 변수가 누락되었습니다.");
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

function getDb() {
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  return databaseId ? getFirestore(admin.app(), databaseId) : getFirestore(admin.app());
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function main() {
  initializeAdmin();
  const db = getDb();

  const roomSnapshot = await db.collection("rooms").get();

  const summary = {
    scannedRooms: roomSnapshot.size,
    roomsMissingAuthDoc: [],
    roomsMissingOrganizerToken: [],
    roomsMissingViewerToken: [],
    roomsWithLegacyPublicTokens: [],
    teamsMissingAuthToken: [],
    teamsWithLegacyPublicTokens: [],
  };

  for (const roomDoc of roomSnapshot.docs) {
    const roomId = roomDoc.id;
    const roomData = roomDoc.data() ?? {};
    const roomAuthDoc = await db.collection(ROOM_AUTH_COLLECTION).doc(roomId).get();

    if (!roomAuthDoc.exists) {
      summary.roomsMissingAuthDoc.push(roomId);
    }

    const roomAuthData = roomAuthDoc.data() ?? {};

    if (!isNonEmptyString(roomAuthData.organizer_token)) {
      summary.roomsMissingOrganizerToken.push(roomId);
    }
    if (!isNonEmptyString(roomAuthData.viewer_token)) {
      summary.roomsMissingViewerToken.push(roomId);
    }

    if (
      isNonEmptyString(roomData.organizer_token) ||
      isNonEmptyString(roomData.viewer_token)
    ) {
      summary.roomsWithLegacyPublicTokens.push(roomId);
    }

    const teamsSnapshot = await roomDoc.ref.collection("teams").get();
    for (const teamDoc of teamsSnapshot.docs) {
      const teamData = teamDoc.data() ?? {};
      const teamTokenDoc = await db
        .collection(ROOM_AUTH_COLLECTION)
        .doc(roomId)
        .collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION)
        .doc(teamDoc.id)
        .get();
      const teamTokenData = teamTokenDoc.data() ?? {};

      if (!isNonEmptyString(teamTokenData.leader_token)) {
        summary.teamsMissingAuthToken.push({
          roomId,
          teamId: teamDoc.id,
          teamName: typeof teamData.name === "string" ? teamData.name : "",
        });
      }

      if (isNonEmptyString(teamData.leader_token)) {
        summary.teamsWithLegacyPublicTokens.push({
          roomId,
          teamId: teamDoc.id,
          teamName: typeof teamData.name === "string" ? teamData.name : "",
        });
      }
    }
  }

  summary.ok =
    summary.roomsMissingAuthDoc.length === 0 &&
    summary.roomsMissingOrganizerToken.length === 0 &&
    summary.roomsMissingViewerToken.length === 0 &&
    summary.roomsWithLegacyPublicTokens.length === 0 &&
    summary.teamsMissingAuthToken.length === 0 &&
    summary.teamsWithLegacyPublicTokens.length === 0;

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
