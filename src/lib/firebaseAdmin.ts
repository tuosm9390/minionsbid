import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

function initializeFirebaseAdmin() {
  if (admin.apps.length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[firebaseAdmin] 누락된 환경변수:', {
      FIREBASE_PROJECT_ID: projectId ? 'SET' : 'MISSING',
      FIREBASE_CLIENT_EMAIL: clientEmail ? 'SET' : 'MISSING',
      FIREBASE_PRIVATE_KEY: privateKey ? `SET (length: ${privateKey.length})` : 'MISSING',
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

initializeFirebaseAdmin();

/** Firestore Admin 인스턴스. FIRESTORE_DATABASE_ID 환경 변수로 named database 지정 가능 */
export function getAdminDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    throw new Error('Firebase Admin이 초기화되지 않았습니다. 환경 변수를 확인하세요.');
  }
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  return databaseId ? getFirestore(admin.app(), databaseId) : getFirestore(admin.app());
}

// 기존 호환성을 위한 lazy proxy
export const adminDb = new Proxy({} as admin.firestore.Firestore, {
  get(_target, prop) {
    const db = getAdminDb();
    const value = db[prop as keyof admin.firestore.Firestore];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(db);
    }
    return value;
  },
});
