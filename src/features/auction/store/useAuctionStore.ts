import { create } from 'zustand'
import type { CaptainMode } from '@/features/auction/utils/roster'

export type Role = 'ORGANIZER' | 'LEADER' | 'VIEWER' | null
export type PlayerStatus = 'WAITING' | 'IN_AUCTION' | 'SOLD' | 'UNSOLD'
export type MessageRole = 'ORGANIZER' | 'LEADER' | 'VIEWER' | 'SYSTEM' | 'NOTICE'

export interface PresenceUser {
  role: Role
  teamId: string | null
}

export interface Team {
  id: string
  room_id: string
  name: string
  point_balance: number
  leader_name: string
  leader_position: string
  leader_description: string
  captain_points: number
}

export interface Player {
  id: string
  room_id: string
  name: string
  tier: string
  main_position: string
  sub_position: string
  status: PlayerStatus
  team_id: string | null
  sold_price: number | null
  description: string
}

export interface Bid {
  id: string
  room_id: string
  player_id: string
  team_id: string
  amount: number
  created_at: string
}

export interface Message {
  id: string
  room_id: string
  sender_name: string
  sender_role: MessageRole
  content: string
  created_at: string
}

interface AuctionState {
  roomId: string | null
  roomName: string | null
  role: Role
  teamId: string | null
  captainMode: CaptainMode

  // Realtime Data sync
  basePoint: number
  totalTeams: number
  membersPerTeam: number
  timerEndsAt: string | null
  createdAt: string | null
  roomExists: boolean
  isRoomLoaded: boolean
  isReAuctionRound: boolean
  teams: Team[]
  bids: Bid[]
  players: Player[]
  messages: Message[]

  // Presence (실시간 접속 현황)
  presences: PresenceUser[]
  isPresenceLoaded: boolean
  isLocalConnected: boolean

  // 추첨 모달 상태 (Broadcast CLOSE_LOTTERY로 동기화)
  lotteryPlayer: Player | null

  // Actions
  setRoomContext: (roomId: string, role: Role, teamId?: string) => void
  setRealtimeData: (data: Partial<AuctionState>) => void
  setRoomNotFound: () => void
  setReAuctionRound: (isRe: boolean) => void
  setLotteryPlayer: (player: Player | null) => void
  setPresenceLoaded: (loaded: boolean) => void
  setLocalConnected: (connected: boolean) => void
  appendBid: (bid: Bid) => void
  removeBid: (bidId: string) => void
  appendMessage: (message: Message) => void
  removeMessage: (messageId: string) => void
}

export const useAuctionStore = create<AuctionState>((set) => ({
  roomId: null,
  roomName: null,
  role: null,
  teamId: null,
  captainMode: 'IN_ROSTER',

  basePoint: 1000,
  totalTeams: 5,
  membersPerTeam: 5,
  timerEndsAt: null,
  createdAt: null,
  roomExists: true,
  isRoomLoaded: false,
  isReAuctionRound: false,
  teams: [],
  bids: [],
  players: [],
  messages: [],
  presences: [],
  isPresenceLoaded: false,
  isLocalConnected: true,
  lotteryPlayer: null,

  setRoomContext: (roomId, role, teamId) => set({
    roomId, role, teamId: teamId || null, roomExists: true, isReAuctionRound: false
  }),
  setRealtimeData: (data) => set((state) => ({
    ...state, ...data, isRoomLoaded: true
  })),
  setRoomNotFound: () => set({ roomExists: false, isRoomLoaded: true }),
  setReAuctionRound: (isRe) => set({ isReAuctionRound: isRe }),
  setLotteryPlayer: (player) => set({ lotteryPlayer: player }),
  setPresenceLoaded: (loaded) => set({ isPresenceLoaded: loaded }),
  setLocalConnected: (connected) => set({ isLocalConnected: connected }),
  appendBid: (bid) => set((state) => ({ bids: [...state.bids, bid] })),
  removeBid: (bidId) => set((state) => ({
    bids: state.bids.filter((bid) => bid.id !== bidId),
  })),
  appendMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  removeMessage: (messageId) => set((state) => ({
    messages: state.messages.filter((message) => message.id !== messageId),
  })),
}))
