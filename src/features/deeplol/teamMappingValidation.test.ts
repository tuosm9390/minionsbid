import { describe, expect, it } from 'vitest'
import type { DeeplolMatchParticipant } from './types'
import {
  getTeamKey,
  validateMatchTeamComposition,
  validateTeamRosterMemberships,
} from './teamMappingValidation'

function member(index: number, teamName: string, teamId = teamName) {
  return { puuId: `puu-${teamName}-${index}`, teamId, teamName }
}

function participant(puuId: string, win: boolean): DeeplolMatchParticipant {
  return {
    puuId,
    riotName: null,
    riotTag: null,
    platformId: 'KR',
    teamId: null,
    teamName: null,
    championId: null,
    championName: null,
    position: null,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: null,
    win,
  }
}

describe('team roster and Deeplol PUUID mapping validation', () => {
  it('accepts two valid rosters with 5 and 6 members', () => {
    const result = validateTeamRosterMemberships([
      ...Array.from({ length: 5 }, (_, index) => member(index, 'Alpha', 'alpha')),
      ...Array.from({ length: 6 }, (_, index) => member(index, 'Beta', 'beta')),
    ])

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.teamCounts.get(getTeamKey('alpha', 'Alpha'))).toBe(5)
    expect(result.teamCounts.get(getTeamKey('beta', 'Beta'))).toBe(6)
    expect(result.memberships.get('puu-Alpha-0')?.teamName).toBe('Alpha')
  })

  it.each([
    ['4명', 4],
    ['7명', 7],
  ])('rejects a roster with %s', (_label, count) => {
    const result = validateTeamRosterMemberships(
      Array.from({ length: count }, (_, index) => member(index, 'Alpha', 'alpha')),
    )

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('5명 또는 6명')
  })

  it('rejects an empty team name and duplicate PUUID', () => {
    const result = validateTeamRosterMemberships([
      ...Array.from({ length: 5 }, (_, index) => member(index, 'Alpha', 'alpha')),
      { puuId: 'puu-Alpha-0', teamId: 'beta', teamName: 'Beta' },
      { puuId: 'puu-beta-1', teamId: 'beta', teamName: '' },
    ])

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('여러 팀 또는 여러 번'),
      expect.stringContaining('팀명이 없습니다'),
    ]))
  })

  it('maps all 10 match participants into exactly two teams of five', () => {
    const roster = validateTeamRosterMemberships([
      ...Array.from({ length: 5 }, (_, index) => member(index, 'Alpha', 'alpha')),
      ...Array.from({ length: 5 }, (_, index) => member(index, 'Beta', 'beta')),
    ])
    const participants = [
      ...Array.from({ length: 5 }, (_, index) => participant(`puu-Alpha-${index}`, true)),
      ...Array.from({ length: 5 }, (_, index) => participant(`puu-Beta-${index}`, false)),
    ]

    const result = validateMatchTeamComposition(participants, roster.memberships)

    expect(result.valid).toBe(true)
    expect(result.mappedParticipantCount).toBe(10)
    expect(result.teamKeys).toHaveLength(2)
    expect(result.participantsByTeam.get(getTeamKey('alpha', 'Alpha'))).toHaveLength(5)
    expect(result.participantsByTeam.get(getTeamKey('beta', 'Beta'))).toHaveLength(5)
  })

  it('rejects a match containing a PUUID from an unregistered player', () => {
    const roster = validateTeamRosterMemberships([
      ...Array.from({ length: 5 }, (_, index) => member(index, 'Alpha', 'alpha')),
      ...Array.from({ length: 5 }, (_, index) => member(index, 'Beta', 'beta')),
    ])
    const participants = [
      ...Array.from({ length: 5 }, (_, index) => participant(`puu-Alpha-${index}`, true)),
      ...Array.from({ length: 4 }, (_, index) => participant(`puu-Beta-${index}`, false)),
      participant('puu-not-registered', false),
    ]

    const result = validateMatchTeamComposition(participants, roster.memberships)

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('매핑되지 않은 참가자')
    expect(result.mappedParticipantCount).toBe(9)
  })

  it('rejects a match that does not contain two complete teams', () => {
    const roster = validateTeamRosterMemberships([
      ...Array.from({ length: 5 }, (_, index) => member(index, 'Alpha', 'alpha')),
      ...Array.from({ length: 5 }, (_, index) => member(index, 'Beta', 'beta')),
    ])
    const participants = [
      ...Array.from({ length: 6 }, (_, index) => participant(`puu-Alpha-${index % 5}`, true)),
      ...Array.from({ length: 4 }, (_, index) => participant(`puu-Beta-${index}`, false)),
    ]

    const result = validateMatchTeamComposition(participants, roster.memberships)

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('각 팀의 경기 참가자 수')
  })
})
