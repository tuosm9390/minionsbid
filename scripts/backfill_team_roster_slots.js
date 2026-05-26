// 기존 경매방 팀 문서에 direct bid rules용 로스터 슬롯 정본 필드를 채운다.
require("dotenv").config({ path: ".env.local" });

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

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

function normalizeCaptainMode(value) {
  return value === "COACH_ONLY" ? "COACH_ONLY" : "IN_ROSTER";
}

function getAuctionSlotsPerTeam(membersPerTeam, captainMode) {
  const normalizedMembers = Number.isFinite(membersPerTeam)
    ? Math.max(Math.trunc(membersPerTeam), 0)
    : 0;
  const captainSlots = captainMode === "IN_ROSTER" ? 1 : 0;
  return Math.max(normalizedMembers - captainSlots, 0);
}

async function main() {
  initializeAdmin();
  const db = getDb();
  const roomsSnapshot = await db.collection("rooms").get();

  const summary = {
    mode: WRITE_MODE ? "write" : "dry-run",
    scannedRooms: roomsSnapshot.size,
    scannedTeams: 0,
    teamsNeedingUpdate: 0,
    teamsUpdated: 0,
    touchedRooms: [],
  };

  for (const roomDoc of roomsSnapshot.docs) {
    const roomData = roomDoc.data() ?? {};
    const membersPerTeam =
      typeof roomData.members_per_team === "number" ? roomData.members_per_team : 5;
    const rosterSlotsTotal = getAuctionSlotsPerTeam(
      membersPerTeam,
      normalizeCaptainMode(roomData.captain_mode),
    );

    const [teamsSnapshot, soldPlayersSnapshot] = await Promise.all([
      roomDoc.ref.collection("teams").get(),
      roomDoc.ref.collection("players").where("status", "==", "SOLD").get(),
    ]);

    const soldCountByTeam = new Map();
    for (const playerDoc of soldPlayersSnapshot.docs) {
      const teamId = playerDoc.data()?.team_id;
      if (typeof teamId !== "string" || teamId.length === 0) continue;
      soldCountByTeam.set(teamId, (soldCountByTeam.get(teamId) ?? 0) + 1);
    }

    const roomSummary = {
      roomId: roomDoc.id,
      rosterSlotsTotal,
      teams: [],
    };

    for (const teamDoc of teamsSnapshot.docs) {
      summary.scannedTeams += 1;
      const teamData = teamDoc.data() ?? {};
      const rosterSlotsUsed = soldCountByTeam.get(teamDoc.id) ?? 0;
      const needsUpdate =
        teamData.roster_slots_used !== rosterSlotsUsed ||
        teamData.roster_slots_total !== rosterSlotsTotal;

      if (!needsUpdate) continue;

      summary.teamsNeedingUpdate += 1;
      roomSummary.teams.push({
        teamId: teamDoc.id,
        rosterSlotsUsed,
        rosterSlotsTotal,
      });

      if (WRITE_MODE) {
        await teamDoc.ref.set(
          {
            roster_slots_used: rosterSlotsUsed,
            roster_slots_total: rosterSlotsTotal,
          },
          { merge: true },
        );
        summary.teamsUpdated += 1;
      }
    }

    if (roomSummary.teams.length > 0) {
      summary.touchedRooms.push(roomSummary);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
