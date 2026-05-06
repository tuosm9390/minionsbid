import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
const databaseId = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || '(default)'
const db = getFirestore(app, databaseId)
const auth = getAuth(app)

let roomAuthPromise: Promise<string | null> | null = null
let roomAuthKey: string | null = null

export async function ensureRoomFirebaseAuth(args: {
  roomId: string
  role: string | null
  teamId?: string | null
}): Promise<string | null> {
  if (typeof window === 'undefined') return null
  if (!args.role) return null

  const key = `${args.roomId}:${args.role}:${args.teamId ?? ''}`
  if (auth.currentUser?.uid && roomAuthKey === key) return auth.currentUser.uid

  if (!roomAuthPromise || roomAuthKey !== key) {
    roomAuthKey = key
    roomAuthPromise = fetch('/api/room-auth/firebase-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Firebase auth token request failed: ${response.status}`)
        }
        return (await response.json()) as { token?: string }
      })
      .then(({ token }) => {
        if (!token) throw new Error('Firebase auth token response missing token')
        return signInWithCustomToken(auth, token)
      })
      .then((credential) => credential.user.uid)
      .catch((error) => {
        roomAuthPromise = null
        roomAuthKey = null
        throw error
      })
  }
  return roomAuthPromise
}

export { app, auth, db }
