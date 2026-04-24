require("dotenv").config({ path: ".env.local" });

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

function initializeAdmin() {
  if (admin.apps.length) return;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL.replace(/"/g, ""),
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/"/g, "").replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

function parseArgs(argv) {
  const args = { entryId: null, dryRun: false };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (!args.entryId) {
      args.entryId = arg;
    }
  }

  if (!args.entryId) {
    throw new Error("사용법: node scripts/delete_hall_of_fame_entry.js <entry-id> [--dry-run]");
  }

  return args;
}

async function main() {
  const { entryId, dryRun } = parseArgs(process.argv.slice(2));

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          entryId,
        },
        null,
        2
      )
    );
    return;
  }

  initializeAdmin();

  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  const db = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore(admin.app());

  await db.collection("hall_of_fame").doc(entryId).delete();

  console.log(
    JSON.stringify(
      {
        ok: true,
        entryId,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
