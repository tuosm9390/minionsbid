import { create } from 'zustand'

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
  leader_token: string
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
  role: Role
  teamId: string | null

  // Room tokens (for link regeneration)
  organizerToken: string | null
  viewerToken: string | null

  // Realtime Data sync
  basePoint: number
  totalTeams: number
  membersPerTeam: number
  orderPublic: boolean
  timerEndsAt: string | null
  createdAt: string | null
  teams: Team[]
  bids: Bid[]
  players: Player[]
  messages: Message[]

  // Presence (실시간 접속 현황)
  presences: PresenceUser[]

  // Actions
  setRoomContext: (roomId: string, role: Role, teamId?: string) => void
  setRealtimeData: (data: Partial<AuctionState>) => void
  addBid: (bid: Bid) => void
  addMessage: (message: Message) => void
}

export const useAuctionStore = create<AuctionState>((set) => ({
  roomId: null,
  role: null,
  teamId: null,

  organizerToken: null,
  viewerToken: null,

  basePoint: 1000,
  totalTeams: 5,
  membersPerTeam: 5,
  orderPublic: true,
  timerEndsAt: null,
  createdAt: null,
  teams: [],
  bids: [],
  players: [],
  messages: [],
  presences: [],

  setRoomContext: (roomId, role, teamId) => set({ roomId, role, teamId: teamId || null }),
  setRealtimeData: (data) => set((state) => ({ ...state, ...data })),
  addBid: (bid) => set((state) => {
    if (state.bids.some(b => b.id === bid.id)) return state;
    return { bids: [...state.bids, bid] };
  }),
  addMessage: (message) => set((state) => {
    if (state.messages.some(m => m.id === message.id)) return state;
    return { messages: [...state.messages, message] };
  }),
}))
