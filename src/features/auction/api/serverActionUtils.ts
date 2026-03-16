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

// 상수는 'use server' 파일에서 export 불가하므로 여기서 직접 정의
export const AUCTION_DURATION_MS = 10_000
export const EXTEND_THRESHOLD_MS = 5_000
export const EXTEND_DURATION_MS = 5_000
