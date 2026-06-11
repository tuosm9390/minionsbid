import { getDatabase, type Database } from 'firebase-admin/database'
import { adminDb } from '@/lib/firebaseAdmin'

export interface AuctionServerServices {
  firestore: typeof adminDb
  rtdb: Database
}

declare global {
  var __auctionServerServicesOverride__: AuctionServerServices | undefined
}

export function getAuctionServerServices(): AuctionServerServices {
  if (process.env.E2E_AUCTION_FIXTURE === '1') {
    const override = globalThis.__auctionServerServicesOverride__
    if (override) {
      return override
    }
  }

  return {
    firestore: adminDb,
    rtdb: getDatabase(),
  }
}
