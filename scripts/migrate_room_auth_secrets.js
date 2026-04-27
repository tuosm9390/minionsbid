require("dotenv").config({ path: ".env.local" });

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const ROOM_AUTH_COLLECTION = "room_auth_secrets";
const ROOM_AUTH_TEAM_TOKENS_COLLECTION = "team_tokens";
const WRITE_MODE = process.argv.includes("--write");

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
    mode: WRITE_MODE ? "write" : "dry-run",
    scannedRooms: roomSnapshot.size,
    roomsWithLegacyRoomTokens: 0,
    roomsWithLegacyTeamTokens: 0,
    roomAuthDocsCreatedOrUpdated: 0,
    teamAuthDocsCreatedOrUpdated: 0,
    roomDocsCleaned: 0,
    teamDocsCleaned: 0,
    touchedRooms: [],
  };

  for (const roomDoc of roomSnapshot.docs) {
    const roomData = roomDoc.data() ?? {};
    const roomId = roomDoc.id;
    const organizerToken = roomData.organizer_token;
    const viewerToken = roomData.viewer_token;
    const hasLegacyRoomTokens = isNonEmptyString(organizerToken) || isNonEmptyString(viewerToken);

    const teamsSnapshot = await roomDoc.ref.collection("teams").get();
    const teamDocsWithLegacyTokens = teamsSnapshot.docs.filter((teamDoc) =>
      isNonEmptyString(teamDoc.data()?.leader_token)
    );

    if (hasLegacyRoomTokens) {
      summary.roomsWithLegacyRoomTokens += 1;
    }
    if (teamDocsWithLegacyTokens.length > 0) {
      summary.roomsWithLegacyTeamTokens += 1;
    }

    if (!hasLegacyRoomTokens && teamDocsWithLegacyTokens.length === 0) {
      continue;
    }

    summary.touchedRooms.push({
      roomId,
      legacyRoomTokens: hasLegacyRoomTokens,
      legacyTeamTokenCount: teamDocsWithLegacyTokens.length,
    });

    if (!WRITE_MODE) {
      continue;
    }

    const roomAuthRef = db.collection(ROOM_AUTH_COLLECTION).doc(roomId);
    const roomAuthDoc = await roomAuthRef.get();
    const roomAuthData = roomAuthDoc.data() ?? {};

    if (hasLegacyRoomTokens) {
      const nextRoomAuth = {};
      if (isNonEmptyString(organizerToken) && !isNonEmptyString(roomAuthData.organizer_token)) {
        nextRoomAuth.organizer_token = organizerToken;
      }
      if (isNonEmptyString(viewerToken) && !isNonEmptyString(roomAuthData.viewer_token)) {
        nextRoomAuth.viewer_token = viewerToken;
      }

      if (Object.keys(nextRoomAuth).length > 0) {
        nextRoomAuth.migrated_at = admin.firestore.FieldValue.serverTimestamp();
        await roomAuthRef.set(nextRoomAuth, { merge: true });
        summary.roomAuthDocsCreatedOrUpdated += 1;
      }

      await roomDoc.ref.set(
        {
          organizer_token: admin.firestore.FieldValue.delete(),
          viewer_token: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
      summary.roomDocsCleaned += 1;
    }

    for (const teamDoc of teamDocsWithLegacyTokens) {
      const teamData = teamDoc.data() ?? {};
      const leaderToken = teamData.leader_token;
      const teamTokenRef = roomAuthRef
        .collection(ROOM_AUTH_TEAM_TOKENS_COLLECTION)
        .doc(teamDoc.id);
      const teamTokenDoc = await teamTokenRef.get();
      const teamTokenData = teamTokenDoc.data() ?? {};

      if (isNonEmptyString(leaderToken) && !isNonEmptyString(teamTokenData.leader_token)) {
        await teamTokenRef.set(
          {
            leader_token: leaderToken,
            team_name: typeof teamData.name === "string" ? teamData.name : "",
            migrated_at: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        summary.teamAuthDocsCreatedOrUpdated += 1;
      }

      await teamDoc.ref.set(
        {
          leader_token: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
      summary.teamDocsCleaned += 1;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
