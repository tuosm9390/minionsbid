import type { LeagueDeeplolParticipant, LeagueRosterTeam } from "@/features/schedules/types";

export function normalizeRosterLookupKey(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function normalizeRosterPlayerKey(value: string | null | undefined) {
  const normalized = normalizeRosterLookupKey(value);
  const separatorIndex = normalized.lastIndexOf("#");
  return separatorIndex > 0 ? normalized.slice(0, separatorIndex).trim() : normalized;
}

export function buildDeeplolParticipantLookup(participants: LeagueDeeplolParticipant[]) {
  const lookup = new Map<string, LeagueDeeplolParticipant | null>();
  participants
    .filter((participant) => participant.status === "ACTIVE")
    .forEach((participant) => {
      const teamKey = normalizeRosterLookupKey(participant.teamName);
      const playerKey = normalizeRosterPlayerKey(participant.riotName);
      if (!teamKey || !playerKey) return;

      const key = `${teamKey}::${playerKey}`;
      if (lookup.has(key)) {
        lookup.set(key, null);
      } else {
        lookup.set(key, participant);
      }
    });
  return lookup;
}

export function findRosterParticipant(
  team: LeagueRosterTeam,
  playerName: string,
  participants: LeagueDeeplolParticipant[],
  lookup = buildDeeplolParticipantLookup(participants),
) {
  const playerKey = normalizeRosterPlayerKey(playerName);
  const exactTeamNameMatch = lookup.get(`${normalizeRosterLookupKey(team.name)}::${playerKey}`);
  if (exactTeamNameMatch) return exactTeamNameMatch;

  const activeParticipants = participants.filter(
    (participant) => participant.status === "ACTIVE" && normalizeRosterPlayerKey(participant.riotName) === playerKey,
  );
  const teamIdMatches = activeParticipants.filter((participant) => participant.teamId === team.id);
  if (teamIdMatches.length === 1) return teamIdMatches[0];
  if (teamIdMatches.length > 1) return null;

  const teamNameKey = normalizeRosterLookupKey(team.name);
  const teamNameMatches = activeParticipants.filter(
    (participant) => normalizeRosterLookupKey(participant.teamName) === teamNameKey,
  );
  return teamNameMatches.length === 1 ? teamNameMatches[0] : null;
}

export function mapRosterPlayersToParticipants(
  team: LeagueRosterTeam,
  participants: LeagueDeeplolParticipant[],
) {
  const lookup = buildDeeplolParticipantLookup(participants);
  return team.players.map((player) => findRosterParticipant(team, player.name, participants, lookup));
}

export function getMappedRosterPlayerCount(
  rosterTeams: LeagueRosterTeam[],
  participants: LeagueDeeplolParticipant[],
) {
  return rosterTeams.reduce(
    (total, team) => total + mapRosterPlayersToParticipants(team, participants).filter(Boolean).length,
    0,
  );
}

export function getRosterPuuidMappings(
  rosterTeams: LeagueRosterTeam[],
  participants: LeagueDeeplolParticipant[],
) {
  return rosterTeams.flatMap((team) =>
    team.players.flatMap((player) => {
      const participant = findRosterParticipant(team, player.name, participants);
      return participant
        ? [{
            teamId: team.id,
            teamName: team.name,
            playerName: player.name,
            puuId: participant.puuId,
          }]
        : [];
    }),
  );
}

export function isRosterReady(team: LeagueRosterTeam, participants: LeagueDeeplolParticipant[]) {
  const mappedCount = mapRosterPlayersToParticipants(team, participants).filter(Boolean).length;
  return team.players.length >= 5 && team.players.length <= 6 && mappedCount === team.players.length;
}
