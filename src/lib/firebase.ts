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

type RoomAuthDebugPayload = {
  roomId?: string
  role?: string | null
  teamId?: string | null
  tokenPresent?: boolean
  tokenLength?: number
  uid?: string | null
  claims?: Record<string, unknown>
  status?: number
  error?: string
}

function isRoomAuthDebugEnabled() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.has('debugAuth') || window.localStorage.getItem('debugAuth') === '1'
}

function logRoomAuthDebug(stage: string, payload: RoomAuthDebugPayload) {
  if (!isRoomAuthDebugEnabled()) return
  console.info('[room-auth]', stage, payload)
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
  const debugPayload = {
    roomId: args.roomId,
    role: args.role,
    teamId: args.teamId ?? null,
    tokenPresent: !!args.token,
    tokenLength: args.token?.length ?? 0,
  }

  const key = `${args.roomId}:${args.role}:${args.teamId ?? ''}:${args.token ?? ''}`
  logRoomAuthDebug('ensure-start', debugPayload)
  if (auth.currentUser?.uid && roomAuthKey === key) {
    await auth.currentUser.getIdToken()
    logRoomAuthDebug('cache-hit', {
      ...debugPayload,
      uid: auth.currentUser.uid,
    })
    return auth.currentUser.uid
  }

  // 페이지 새로고침 시 roomAuthKey는 null로 리셋되지만 Firebase auth는
  // IndexedDB에 살아있다. claims를 검증해 일치하면 API 호출을 생략한다.
  if (auth.currentUser?.uid && roomAuthKey === null) {
    try {
      const result = await auth.currentUser.getIdTokenResult()
      const c = result.claims
      if (
        c['roomId'] === args.roomId &&
        c['role'] === args.role &&
        (args.role !== 'LEADER' || c['teamId'] === args.teamId)
      ) {
        roomAuthKey = key
        logRoomAuthDebug('claims-reused', {
          ...debugPayload,
          uid: auth.currentUser.uid,
          claims: {
            roomId: c['roomId'],
            role: c['role'],
            teamId: c['teamId'] ?? null,
          },
        })
        return auth.currentUser.uid
      }
    } catch (error) {
      logRoomAuthDebug('claims-reuse-failed', {
        ...debugPayload,
        error: error instanceof Error ? error.message : String(error),
      })
      // 토큰 만료 등 → fetch 경로로 진행
    }
  }

  if (!roomAuthPromise || roomAuthKey !== key) {
    roomAuthKey = key
    logRoomAuthDebug('token-request-start', debugPayload)
    roomAuthPromise = fetch('/api/room-auth/firebase-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    })
      .then(async (response) => {
        logRoomAuthDebug('token-response', {
          ...debugPayload,
          status: response.status,
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: unknown } | null
          const detail = typeof body?.error === 'string' ? `: ${body.error}` : ''
          throw new Error(`Firebase auth token request failed: ${response.status}${detail}`)
        }
        return (await response.json()) as { token?: string }
      })
      .then(({ token }) => {
        if (!token) throw new Error('Firebase auth token response missing token')
        logRoomAuthDebug('custom-token-received', {
          ...debugPayload,
          tokenPresent: true,
          tokenLength: token.length,
        })
        return signInWithCustomToken(auth, token)
      })
      .then(async (credential) => {
        await credential.user.getIdToken(true)
        const shouldExposeDebug =
          process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === '1' || isRoomAuthDebugEnabled()
        if (shouldExposeDebug) {
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
          logRoomAuthDebug('signin-success', {
            ...debugPayload,
            uid: credential.user.uid,
            claims: {
              roomId: tokenResult.claims.roomId,
              role: tokenResult.claims.role,
              teamId: tokenResult.claims.teamId ?? null,
            },
          })
        } else {
          logRoomAuthDebug('signin-success', {
            ...debugPayload,
            uid: credential.user.uid,
          })
        }
        return credential.user.uid
      })
      .catch((error) => {
        logRoomAuthDebug('failed', {
          ...debugPayload,
          error: error instanceof Error ? error.message : String(error),
        })
        roomAuthPromise = null
        roomAuthKey = null
        throw error
      })
  }
  return roomAuthPromise
}

export { app, auth, db }
