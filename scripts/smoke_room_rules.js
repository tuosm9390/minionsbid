require("dotenv").config({ path: ".env.local" });

const admin = require("firebase-admin");
const { getFirestore: getAdminFirestore } = require("firebase-admin/firestore");
const { initializeApp: initializeClientApp, getApps: getClientApps } = require("firebase/app");
const {
  getFirestore: getClientFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  limit,
} = require("firebase/firestore");

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

function getAdminDb() {
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  return databaseId ? getAdminFirestore(admin.app(), databaseId) : getAdminFirestore(admin.app());
}

function getClientDb() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  };

  const app =
    getClientApps().length > 0 ? getClientApps()[0] : initializeClientApp(firebaseConfig);
  const databaseId = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || "(default)";
  return getClientFirestore(app, databaseId);
}

function isPermissionDenied(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    ("code" in error || "message" in error) &&
    (String(error.code || "").includes("permission-denied") ||
      String(error.message || "").includes("permission-denied") ||
      String(error.message || "").includes("Missing or insufficient permissions"))
  );
}

async function expectAllowed(label, fn) {
  try {
    const result = await fn();
    return { label, ok: true, detail: result };
  } catch (error) {
    return {
      label,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function expectDenied(label, fn) {
  try {
    await fn();
    return {
      label,
      ok: false,
      error: "expected permission-denied, but request succeeded",
    };
  } catch (error) {
    if (isPermissionDenied(error)) {
      return { label, ok: true };
    }
    return {
      label,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  initializeAdmin();
  const adminDb = getAdminDb();
  const clientDb = getClientDb();

  const roomId = process.argv[2] || null;
  let targetRoomId = roomId;

  if (!targetRoomId) {
    const rooms = await adminDb.collection("rooms").limit(1).get();
    if (rooms.empty) {
      throw new Error("검증할 room이 없습니다.");
    }
    targetRoomId = rooms.docs[0].id;
  }

  const checks = [];

  checks.push(
    await expectAllowed("room get", async () => {
      const snap = await getDoc(doc(clientDb, "rooms", targetRoomId));
      if (!snap.exists()) throw new Error("room document not found");
      return { roomId: snap.id };
    })
  );

  for (const subCollectionName of ["teams", "players", "messages", "bids"]) {
    checks.push(
      await expectAllowed(`${subCollectionName} list`, async () => {
        const snap = await getDocs(
          query(collection(clientDb, "rooms", targetRoomId, subCollectionName), limit(5))
        );
        return { count: snap.size };
      })
    );
  }

  checks.push(
    await expectDenied("sealed_bid_rounds list denied", async () => {
      await getDocs(
        query(collection(clientDb, "rooms", targetRoomId, "sealed_bid_rounds"), limit(5))
      );
    })
  );

  checks.push(
    await expectDenied("sealed_bid_round submissions list denied", async () => {
      await getDocs(
        query(
          collection(
            clientDb,
            "rooms",
            targetRoomId,
            "sealed_bid_rounds",
            "smoke-round",
            "submissions",
          ),
          limit(5),
        )
      );
    })
  );

  checks.push(
    await expectDenied("rooms top-level list denied", async () => {
      await getDocs(query(collection(clientDb, "rooms"), limit(5)));
    })
  );

  checks.push(
    await expectDenied("room_auth_secrets get denied", async () => {
      await getDoc(doc(clientDb, "room_auth_secrets", targetRoomId));
    })
  );

  checks.push(
    await expectDenied("room_auth_secrets team_tokens list denied", async () => {
      await getDocs(
        query(
          collection(clientDb, "room_auth_secrets", targetRoomId, "team_tokens"),
          limit(5)
        )
      );
    })
  );

  const summary = {
    roomId: targetRoomId,
    ok: checks.every((check) => check.ok),
    checks,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
