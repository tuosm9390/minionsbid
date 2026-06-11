import { getApps, getApp, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

function initializeFirebaseAdmin() {
  if (getApps().length) return;
  if (process.env.E2E_SCHEDULE_FIXTURE === '1') return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (process.env.USE_FIREBASE_EMULATOR === '1') {
    if (!projectId) {
      console.warn('[firebaseAdmin] emulator project id missing');
      return;
    }

    if (clientEmail && privateKey) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
        databaseURL,
      });
      return;
    }

    initializeApp({
      projectId,
      databaseURL,
    });
    return;
  }

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[firebaseAdmin] 누락된 환경변수:', {
      FIREBASE_PROJECT_ID: projectId ? 'SET' : 'MISSING',
      FIREBASE_CLIENT_EMAIL: clientEmail ? 'SET' : 'MISSING',
      FIREBASE_PRIVATE_KEY: privateKey ? `SET (length: ${privateKey.length})` : 'MISSING',
    });
    return;
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
    databaseURL,
  });
}

initializeFirebaseAdmin();

/** Firestore Admin 인스턴스. FIRESTORE_DATABASE_ID 환경 변수로 named database 지정 가능 */
export function getAdminDb(): Firestore {
  if (!getApps().length) {
    throw new Error('Firebase Admin이 초기화되지 않았습니다. 환경 변수를 확인하세요.');
  }
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  return databaseId ? getFirestore(getApp(), databaseId) : getFirestore(getApp());
}

// 기존 호환성을 위한 lazy proxy
export const adminDb = new Proxy({} as Firestore, {
  get(_target, prop) {
    const db = getAdminDb();
    const value = db[prop as keyof Firestore];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(db);
    }
    return value;
  },
});
