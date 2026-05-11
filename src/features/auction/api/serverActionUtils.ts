/**
 * Firebase 버전 서버 액션 유틸리티.
 * Supabase Broadcast 유틸리티 불필요 — Firestore onSnapshot이 실시간 동기화를 담당.
 * 타입/상수 정의.
 */

export type {
  CreateRoomCaptain,
  CreateRoomPlayer,
  CreateRoomPayload,
  CreateRoomResult,
  ArchiveTeam,
  AuctionArchivePayload,
} from './roomActions'
export type { CaptainMode } from '../utils/roster'

// 상수는 'use server' 파일에서 export 불가하므로 외부 상수 파일에서 가져와 재수출
import { 
  AUCTION_DURATION_MS as AD, 
  EXTEND_THRESHOLD_MS as ET, 
  EXTEND_DURATION_MS as ED,
  BID_INCREMENT as BI,
  MIN_START_BID as MSB
} from '../constants/auctionTimings'

export const AUCTION_DURATION_MS = AD
export const EXTEND_THRESHOLD_MS = ET
export const EXTEND_DURATION_MS = ED
export const BID_INCREMENT = BI
export const MIN_START_BID = MSB
