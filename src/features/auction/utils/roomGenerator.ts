import {
  LAST_NAMES,
  FIRST_NAMES_LIST,
  CAPTAIN_INTROS,
  PLAYER_INTROS,
  POSITIONS,
  TIERS,
} from "../constants/room";
import { type CaptainMode, getAuctionSlotsPerTeam } from "./roster";

export interface CaptainInfo {
  teamName: string;
  name: string;
  position: string;
  description: string;
  captainPoints: number;
}

export interface PlayerInfo {
  name: string;
  tier: string;
  mainPosition: string;
  subPosition: string;
  description: string;
}

export function generateKoreanName(usedNames: Set<string>): string {
  for (let i = 0; i < 100; i++) {
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const first =
      FIRST_NAMES_LIST[Math.floor(Math.random() * FIRST_NAMES_LIST.length)];
    const name = `${last}${first}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  const fallback = `선수${usedNames.size + 1}`;
  usedNames.add(fallback);
  return fallback;
}

export function buildTemplateData(
  teamCount: number,
  membersPerTeam: number,
  captainMode: CaptainMode = "IN_ROSTER",
): { captains: CaptainInfo[]; players: PlayerInfo[] } {
  const usedNames = new Set<string>();

  const captains: CaptainInfo[] = Array.from({ length: teamCount }, (_, i) => {
    const name = generateKoreanName(usedNames);
    return {
      teamName: `${name}팀`,
      name,
      position: POSITIONS[Math.floor(Math.random() * POSITIONS.length)],
      description: CAPTAIN_INTROS[i % CAPTAIN_INTROS.length],
      captainPoints: 0,
    };
  });

  const playerCount =
    teamCount * getAuctionSlotsPerTeam(membersPerTeam, captainMode);
  const players: PlayerInfo[] = Array.from({ length: playerCount }, (_, i) => {
    const name = generateKoreanName(usedNames);
    return {
      name,
      tier: TIERS[Math.floor(Math.random() * TIERS.length)],
      mainPosition: POSITIONS[Math.floor(Math.random() * POSITIONS.length)],
      subPosition: POSITIONS[Math.floor(Math.random() * POSITIONS.length)],
      description: PLAYER_INTROS[i % PLAYER_INTROS.length],
    };
  });

  return { captains, players };
}
