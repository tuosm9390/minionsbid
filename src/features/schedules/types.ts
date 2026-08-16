export type LeagueRosterSourceType = "room" | "archive";

export interface LeagueScheduleItem {
  id: string;
  name: string;
  linkedAuctionId: string | null;
  linkedLeagueName: string | null;
  rosterSourceType?: LeagueRosterSourceType | null;
  rosterSourceId?: string | null;
  startsAt: string;
  endsAt: string | null;
  notes: string;
  createdAt: string;
  status: "ACTIVE" | "COMPLETED";
  completedAt: string | null;
  championTeamName: string | null;
  deeplolTournamentName?: string | null;
  deeplolMemberPuuIds?: string[];
  deeplolPlatformId?: string | null;
  deeplolPageSize?: number;
  deeplolMaxAttempts?: number;
  deeplolLockLeaseSeconds?: number;
}

export interface LeagueScheduleCatalog {
  leagueOptions: Array<{
    id: string;
    name: string;
    closedAt: string | null;
  }>;
  schedules: LeagueScheduleItem[];
}

export interface CreateLeagueSchedulePayload {
  name: string;
  linkedAuctionId?: string | null;
  linkedLeagueName?: string | null;
  rosterSourceType?: LeagueRosterSourceType | null;
  rosterSourceId?: string | null;
  startsAt: string;
  endsAt?: string | null;
  notes?: string;
  deeplolTournamentName?: string | null;
  deeplolMemberPuuIds?: string[];
  deeplolPlatformId?: string | null;
  deeplolPageSize?: number;
  deeplolMaxAttempts?: number;
  deeplolLockLeaseSeconds?: number;
}

export type LeagueMatchWinner = 'HOME' | 'AWAY' | 'PENDING';
export type LeagueSetWinner = 'HOME' | 'AWAY';

export interface LeagueMatchFormat {
  winsToClinch: number;
  maxGames: number;
}

export interface LeagueScheduleSetLog {
  setNumber: number;
  winner: LeagueSetWinner;
  note: string;
}

export interface LeagueScheduleMatch {
  id: string;
  startsAt: string;
  homeTeamName: string;
  awayTeamName: string;
  stageLabel: string;
  format: LeagueMatchFormat;
  setLogs: LeagueScheduleSetLog[];
  homeScore: number;
  awayScore: number;
  winner: LeagueMatchWinner;
  isCompleted: boolean;
  note: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LeagueScheduleDay {
  id: string;
  dateKey: string;
  dateLabel: string;
  matches: LeagueScheduleMatch[];
}

export interface LeagueRosterPlayer {
  name: string;
  tier: string;
  mainPosition: string;
  subPosition: string;
  soldPrice: number | null;
}

export interface LeagueDeeplolParticipant {
  puuId: string;
  riotName: string | null;
  riotTag: string | null;
  teamId: string | null;
  teamName: string | null;
  position: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface LeagueRosterTeam {
  id: string;
  name: string;
  leaderName: string;
  captainMode: "IN_ROSTER" | "COACH_ONLY";
  pointBalance: number;
  players: LeagueRosterPlayer[];
  source: 'room' | 'archive';
  auctionKey: string;
  auctionName: string;
}

export interface LeagueScheduleTimeline {
  schedule: LeagueScheduleItem | null;
  days: LeagueScheduleDay[];
  rosterTeams: LeagueRosterTeam[];
  deeplolParticipants: LeagueDeeplolParticipant[];
  availableTeamNames: string[];
  nextMatches: LeagueScheduleMatch[];
}

export interface SaveLeagueScheduleDayPayload {
  dateKey: string;
  matches: Array<{
    id?: string;
    startsAt: string;
    homeTeamName: string;
    awayTeamName: string;
    stageLabel?: string;
    winsToClinch?: number;
    maxGames?: number;
  }>;
}
