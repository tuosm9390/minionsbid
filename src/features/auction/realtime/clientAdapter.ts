import { app, db as firestoreDb } from '@/lib/firebase'
import { getDatabase, type Database } from 'firebase/database'
import type { Firestore } from 'firebase/firestore'

export interface AuctionClientServices {
  firestore: Firestore
  rtdb: Database
}

declare global {
  var __auctionClientServicesOverride__: AuctionClientServices | undefined
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
    rtdb: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
      ? getDatabase(app, process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL)
      : getDatabase(app),
  }
}
