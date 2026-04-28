import * as admin from 'firebase-admin'
import { adminDb } from '@/lib/firebaseAdmin'

export interface AuctionServerServices {
  firestore: typeof adminDb
  rtdb: admin.database.Database
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
    rtdb: admin.database(),
  }
}
