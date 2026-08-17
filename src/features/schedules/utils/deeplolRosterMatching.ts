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
  const lookup = new Map<string, LeagueDeeplolParticipant>();
  participants
    .filter((participant) => participant.status === "ACTIVE")
    .forEach((participant) => {
      const teamKey = normalizeRosterLookupKey(participant.teamName);
      const playerKey = normalizeRosterPlayerKey(participant.riotName);
      if (teamKey && playerKey) lookup.set(`${teamKey}::${playerKey}`, participant);
    });
  return lookup;
}

export function findRosterParticipant(
  team: LeagueRosterTeam,
  playerName: string,
  participants: LeagueDeeplolParticipant[],
  lookup = buildDeeplolParticipantLookup(participants),
) {
  const activeParticipants = participants.filter(
    (participant) =>
      participant.status === "ACTIVE" &&
      (participant.teamId === team.id ||
        normalizeRosterLookupKey(participant.teamName) === normalizeRosterLookupKey(team.name)),
  );

  return (
    lookup.get(`${normalizeRosterLookupKey(team.name)}::${normalizeRosterPlayerKey(playerName)}`) ??
    activeParticipants.find(
      (participant) => normalizeRosterPlayerKey(participant.riotName) === normalizeRosterPlayerKey(playerName),
    ) ??
    null
  );
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
