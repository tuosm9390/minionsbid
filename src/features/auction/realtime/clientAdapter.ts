import { app, db as firestoreDb } from '@/lib/firebase'
import { connectDatabaseEmulator, getDatabase, type Database } from 'firebase/database'
import type { Firestore } from 'firebase/firestore'

export interface AuctionClientServices {
  firestore: Firestore
  rtdb: Database
}

declare global {
  var __auctionClientServicesOverride__: AuctionClientServices | undefined
  var __firebaseDatabaseEmulatorConnected__: boolean | undefined
}

function getRealtimeDatabase() {
  const rtdb = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
    ? getDatabase(app, process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL)
    : getDatabase(app)

  if (
    typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === '1' &&
    !globalThis.__firebaseDatabaseEmulatorConnected__
  ) {
    connectDatabaseEmulator(rtdb, '127.0.0.1', 9000)
    globalThis.__firebaseDatabaseEmulatorConnected__ = true
  }

  return rtdb
}

export function getAuctionClientServices(): AuctionClientServices {
  if (process.env.NEXT_PUBLIC_E2E_AUCTION_FIXTURE === '1') {
    const override = globalThis.__auctionClientServicesOverride__
    if (override) {
      return override
    }
  }

  return {
    firestore: firestoreDb,
    rtdb: getRealtimeDatabase(),
  }
}
