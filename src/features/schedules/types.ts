export interface LeagueScheduleItem {
  id: string;
  name: string;
  linkedAuctionId: string | null;
  linkedLeagueName: string | null;
  startsAt: string;
  endsAt: string | null;
  notes: string;
  createdAt: string;
  status: "ACTIVE" | "COMPLETED";
  completedAt: string | null;
  championTeamName: string | null;
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
  startsAt: string;
  endsAt?: string | null;
  notes?: string;
}

export type LeagueMatchWinner = 'HOME' | 'AWAY' | 'DRAW' | 'PENDING';

export interface LeagueScheduleMatch {
  id: string;
  startsAt: string;
  homeTeamName: string;
  awayTeamName: string;
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

export interface LeagueRosterTeam {
  id: string;
  name: string;
  leaderName: string;
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
  }>;
}
