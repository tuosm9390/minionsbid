export type DeeplolSyncStatus =
  | 'IMPORTED'
  | 'SKIPPED_OUT_OF_RANGE'
  | 'SKIPPED_TOURNAMENT'
  | 'SKIPPED_DUPLICATE'
  | 'PENDING_REVIEW'
  | 'ERROR'

export interface DeeplolMatchParticipant {
  puuId: string | null
  riotName: string | null
  riotTag: string | null
  platformId: string | null
  teamId: string | null
  teamName: string | null
  championId: string | null
  championName: string | null
  position: string | null
  kills: number
  deaths: number
  assists: number
  cs: number | null
  win: boolean | null
}

export interface DeeplolMatch {
  matchId: string
  tournamentName: string | null
  platformId: string
  createdAt: string | null
  durationSeconds: number | null
  queueId: string | null
  rawBasic: Record<string, unknown>
  participants: DeeplolMatchParticipant[]
}

export interface DeeplolSyncConfig {
  tournamentName: string
  memberPuuIds: string[];
  platformId: string;
  pageSize: number;
  timezone: string
  maxAttempts: number
  lockLeaseSeconds: number
}

export interface DeeplolPlayerAggregate {
  playerKey: string
  puuId: string | null
  riotName: string | null
  riotTag: string | null
  platformId: string | null
  matches: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  kda: number
  champions: Record<string, { games: number; wins: number }>
  positions: Record<string, { games: number; wins: number }>
  updatedAt: string
}

export interface DeeplolTeamAggregate {
  teamKey: string
  teamId: string | null
  teamName: string
  rosterSize: number
  matches: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  kda: number
  win_rate?: number
  updatedAt: string
}

export interface DeeplolSyncResult {
  scheduleId: string
  tournamentName: string
  discoveredMatchIds: number
  importedMatches: number
  duplicateMatches: number
  skippedMatches: number
  importedTeams: number
  teamStats: DeeplolTeamAggregate[]
  retriedRequests: number
  failedMatchIds: string[]
  errors: string[]
}
