export interface HallOfFameEntry {
  id: string
  archive_id: string
  room_id: string
  season_name: string
  season_label?: string | null
  winning_team_name: string
  winning_team_leader: string
  winning_team_players: { name: string; sold_price: number | null }[]
  won_at: string
  registered_at: string
}

export interface HallOfFameRegistrationPayload {
  archive_id: string
  room_id: string
  season_name: string
  season_label?: string | null
  winning_team_name: string
  winning_team_leader: string
  winning_team_players: { name: string; sold_price: number | null }[]
  won_at: string
}

export interface AuctionArchiveForHof {
  id: string
  room_id: string
  room_name: string
  closed_at: string
  result_snapshot: {
    id: string
    name: string
    leader_name: string
    captain_mode?: 'IN_ROSTER' | 'COACH_ONLY'
    point_balance: number
    players: { name: string; sold_price: number | null }[]
  }[]
}
