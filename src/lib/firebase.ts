import { initializeApp, getApps, getApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, getIdTokenResult, signInWithCustomToken } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

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

declare global {
  var __firebaseClientEmulatorsConnected__: boolean | undefined
}

function connectClientEmulators() {
  if (typeof window === 'undefined') return
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== '1') return
  if (globalThis.__firebaseClientEmulatorsConnected__) return

  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
    disableWarnings: true,
  })
  globalThis.__firebaseClientEmulatorsConnected__ = true
}

connectClientEmulators()

let roomAuthPromise: Promise<string | null> | null = null
let roomAuthKey: string | null = null

export async function ensureRoomFirebaseAuth(args: {
  roomId: string
  role: string | null
  teamId?: string | null
  token?: string | null
}): Promise<string | null> {
  if (typeof window === 'undefined') return null
  if (!args.role) return null

  const key = `${args.roomId}:${args.role}:${args.teamId ?? ''}:${args.token ?? ''}`
  if (auth.currentUser?.uid && roomAuthKey === key) {
    await auth.currentUser.getIdToken()
    return auth.currentUser.uid
  }

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
      .then(async (credential) => {
        await credential.user.getIdToken(true)
        if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === '1') {
          const tokenResult = await getIdTokenResult(credential.user, true)
          ;(
            window as Window & {
              __roomAuthDebug__?: {
                uid: string
                claims: Record<string, unknown>
              }
            }
          ).__roomAuthDebug__ = {
            uid: credential.user.uid,
            claims: tokenResult.claims,
          }
        }
        return credential.user.uid
      })
      .catch((error) => {
        roomAuthPromise = null
        roomAuthKey = null
        throw error
      })
  }
  return roomAuthPromise
}

export { app, auth, db }
