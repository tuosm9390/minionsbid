import type { DeeplolMatchParticipant } from './types'

export interface TeamMembershipInput {
  puuId: string
  teamId?: string | null
  teamName: string
}

export interface NormalizedTeamMembership {
  puuId: string
  teamId: string | null
  teamName: string
  teamKey: string
}

export interface TeamRosterValidationResult {
  valid: boolean
  errors: string[]
  memberships: Map<string, NormalizedTeamMembership>
  teamCounts: Map<string, number>
}

export interface MatchTeamValidationResult {
  valid: boolean
  reason: string | null
  teamKeys: string[]
  mappedParticipantCount: number
  participantsByTeam: Map<string, DeeplolMatchParticipant[]>
}

function normalize(value: string | null | undefined) {
  return (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
}

export function getTeamKey(teamId: string | null | undefined, teamName: string) {
  const normalizedId = normalize(teamId)
  return normalizedId ? `id:${normalizedId}` : `name:${normalize(teamName)}`
}

export function validateTeamRosterMemberships(
  inputs: TeamMembershipInput[],
): TeamRosterValidationResult {
  const errors: string[] = []
  const memberships = new Map<string, NormalizedTeamMembership>()
  const teamCounts = new Map<string, number>()

  for (const input of inputs) {
    const puuId = input.puuId.trim()
    const teamName = input.teamName.trim()
    if (!puuId) {
      errors.push('PUUID가 비어 있는 참가자가 있습니다.')
      continue
    }
    if (!teamName) {
      errors.push(`${puuId}: 팀명이 없습니다.`)
      continue
    }
    if (memberships.has(puuId)) {
      errors.push(`${puuId}: PUUID가 여러 팀 또는 여러 번 등록되었습니다.`)
      continue
    }
    const teamId = input.teamId?.trim() || null
    const teamKey = getTeamKey(teamId, teamName)
    memberships.set(puuId, { puuId, teamId, teamName, teamKey })
    teamCounts.set(teamKey, (teamCounts.get(teamKey) ?? 0) + 1)
  }

  for (const [teamKey, count] of teamCounts) {
    if (count < 5 || count > 6) {
      errors.push(`${teamKey}: 로스터 인원은 5명 또는 6명이어야 합니다. 현재 ${count}명입니다.`)
    }
  }

  return { valid: errors.length === 0, errors, memberships, teamCounts }
}

export function validateMatchTeamComposition(
  participants: DeeplolMatchParticipant[],
  memberships: Map<string, NormalizedTeamMembership>,
): MatchTeamValidationResult {
  const participantsByTeam = new Map<string, DeeplolMatchParticipant[]>()
  let mappedParticipantCount = 0
  for (const participant of participants) {
    if (!participant.puuId) continue
    const membership = memberships.get(participant.puuId)
    if (!membership) continue
    mappedParticipantCount += 1
    const current = participantsByTeam.get(membership.teamKey) ?? []
    current.push(participant)
    participantsByTeam.set(membership.teamKey, current)
  }

  const teamKeys = Array.from(participantsByTeam.keys())
  const valid = participants.length === 10 &&
    mappedParticipantCount === 10 &&
    teamKeys.length === 2 &&
    teamKeys.every((teamKey) => participantsByTeam.get(teamKey)?.length === 5)

  let reason: string | null = null
  if (!valid) {
    if (participants.length !== 10) reason = `경기 참가자 수가 10명이 아닙니다: ${participants.length}명`
    else if (mappedParticipantCount !== 10) reason = `리그 팀에 매핑되지 않은 참가자가 있습니다: ${10 - mappedParticipantCount}명`
    else if (teamKeys.length !== 2) reason = `매핑된 팀 수가 2개가 아닙니다: ${teamKeys.length}개`
    else reason = '각 팀의 경기 참가자 수가 5명이 아닙니다.'
  }

  return { valid, reason, teamKeys, mappedParticipantCount, participantsByTeam }
}
