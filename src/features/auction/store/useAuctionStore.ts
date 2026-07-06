import { create } from 'zustand'
import type { CaptainMode } from '@/features/auction/utils/roster'
import type { AuctionMode } from '@/features/auction/utils/auctionMode'
import type { AuctionTransport } from '@/features/auction/utils/auctionTransport'
import {
  appendOrderedMessage,
  buildOrderedMessageState,
  removeOrderedMessage,
} from '@/features/auction/store/auctionSelectors'

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
  roster_slots_used?: number
  roster_slots_total?: number
  leader_name: string
  leader_tier?: string
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
  aram_tier?: string
  tft_tier?: string
  desired_team?: string
  order?: number
}

export interface Bid {
  id: string
  room_id: string
  player_id: string
  team_id: string
  amount: number
  created_at: string
}

export interface LiveBidState {
  event_id?: string
  player_id: string
  team_id: string
  amount: number
  created_at: string
}

export type SealedBidPhase =
  | null
  | 'ACTIVE'
  | 'LOCKED'
  | 'REVEALING'
  | 'REVEALED'
  | 'AWARDED'
  | 'TIE_REBID'

export interface SealedBidRevealCard {
  team_id: string
  team_name: string
  amount: number
  is_pass: boolean
  is_highest: boolean
  is_tied: boolean
  eligible: boolean
}

export interface SealedBidState {
  phase: SealedBidPhase
  roundId: string | null
  roundNumber: number
  minAmount: number
  eligibleTeamIds: string[] | null
  revealOrder: string[]
  revealResult: SealedBidRevealCard[]
  highestAmount: number
  tiedTeamIds: string[]
}

export interface Message {
  id: string
  event_id?: string
  room_id: string
  sender_name: string
  sender_role: MessageRole
  content: string
  created_at: string
}

export interface TeamAssignmentState {
  status: 'CONFIRMED'
  confirmed_at?: unknown
  assignments?: unknown[]
}

interface AuctionState {
  roomId: string | null
  roomName: string | null
  role: Role
  teamId: string | null
  organizerToken: string | null
  roomAuthToken: string | null
  captainMode: CaptainMode
  auctionMode: AuctionMode
  auctionTransport: AuctionTransport

  // Realtime Data sync
  basePoint: number
  totalTeams: number
  membersPerTeam: number
  timerEndsAt: string | null
  currentPlayerId: string | null
  createdAt: string | null
  roomExists: boolean
  isRoomLoaded: boolean
  nextAuctionDurationMs: number | null
  auctionEventRevision: number
  teams: Team[]
  bids: Bid[]
  liveBid: LiveBidState | null
  sealedBid: SealedBidState
  players: Player[]
  teamAssignment: TeamAssignmentState | null
  messagesById: Record<string, Message>
  orderedMessageIds: string[]

  // Presence (실시간 접속 현황)
  presences: PresenceUser[]
  isPresenceLoaded: boolean
  isLocalConnected: boolean
  hasPresenceAuthError: boolean
  serverTimeOffset: number

  // 추첨 모달 상태 (Broadcast CLOSE_LOTTERY로 동기화)
  lotteryPlayer: Player | null

  // Actions
  setRoomContext: (roomId: string, role: Role, teamId?: string, roomAuthToken?: string) => void
  setRealtimeData: (data: Partial<AuctionState>) => void
  setRoomNotFound: () => void
  setLotteryPlayer: (player: Player | null) => void
  setAuctionEventRevision: (revision: number) => void
  setPresenceLoaded: (loaded: boolean) => void
  setLocalConnected: (connected: boolean) => void
  setPresenceAuthError: (hasError: boolean) => void
  setLiveBid: (bid: LiveBidState | null) => void
  setMessages: (messages: Message[]) => void
  appendMessage: (message: Message) => void
  removeMessage: (messageId: string) => void
}

export const useAuctionStore = create<AuctionState>((set) => ({
  roomId: null,
  roomName: null,
  role: null,
  teamId: null,
  organizerToken: null,
  roomAuthToken: null,
  captainMode: 'IN_ROSTER',
  auctionMode: 'OPEN_ASCENDING',
  auctionTransport: 'FIREBASE',

  basePoint: 1000,
  totalTeams: 5,
  membersPerTeam: 5,
  timerEndsAt: null,
  currentPlayerId: null,
  createdAt: null,
  roomExists: true,
  isRoomLoaded: false,
  nextAuctionDurationMs: null,
  auctionEventRevision: 0,
  teams: [],
  bids: [],
  liveBid: null,
  sealedBid: {
    phase: null,
    roundId: null,
    roundNumber: 0,
    minAmount: 0,
    eligibleTeamIds: null,
    revealOrder: [],
    revealResult: [],
    highestAmount: 0,
    tiedTeamIds: [],
  },
  players: [],
  teamAssignment: null,
  messagesById: {},
  orderedMessageIds: [],
  presences: [],
  isPresenceLoaded: false,
  isLocalConnected: true,
  hasPresenceAuthError: false,
  serverTimeOffset: 0,
  lotteryPlayer: null,

  setRoomContext: (roomId, role, teamId, roomAuthToken) => set({
    roomId,
    role,
    teamId: teamId || null,
    organizerToken: role === 'ORGANIZER' ? roomAuthToken || null : null,
    roomAuthToken: roomAuthToken || null,
    roomExists: true,
    nextAuctionDurationMs: null,
    auctionEventRevision: 0,
    teamAssignment: null,
    auctionTransport: 'FIREBASE',
  }),
  setRealtimeData: (data) => set((state) => ({
    ...state, ...data, isRoomLoaded: true
  })),
  setRoomNotFound: () => set({ roomExists: false, isRoomLoaded: true }),
  setLotteryPlayer: (player) => set({ lotteryPlayer: player }),
  setAuctionEventRevision: (revision) => set({ auctionEventRevision: revision }),
  setPresenceLoaded: (loaded) => set({ isPresenceLoaded: loaded }),
  setLocalConnected: (connected) => set({ isLocalConnected: connected }),
  setPresenceAuthError: (hasError) => set({ hasPresenceAuthError: hasError }),
  setLiveBid: (bid) => set({ liveBid: bid }),
  setMessages: (messages) => set(buildOrderedMessageState(messages)),
  appendMessage: (message) =>
    set((state) =>
      appendOrderedMessage({
        messagesById: state.messagesById,
        orderedMessageIds: state.orderedMessageIds,
        message,
      }),
    ),
  removeMessage: (messageId) =>
    set((state) =>
      removeOrderedMessage({
        messagesById: state.messagesById,
        orderedMessageIds: state.orderedMessageIds,
        messageId,
      }),
    ),
}))
