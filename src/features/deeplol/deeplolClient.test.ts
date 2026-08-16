import { describe, expect, it, vi } from 'vitest'
import { extractDeeplolMembers, extractMemberMatchIds, fetchMemberMatchIds, parseDeeplolMatch } from './deeplolClient'
import { matchesTournamentKeyword } from './deeplolSync'

describe('Deeplol client parser', () => {
  it('extracts unique members and PUUIDs from server info response', () => {
    const members = extractDeeplolMembers({
      data: {
        member_list: [
          { puu_id: 'puu-1', riot_id_name: 'player-one', riot_id_tag_line: 'KR1', position: 'Jungle' },
          { puu_id: 'puu-1', riot_id_name: 'player-one', riot_id_tag_line: 'KR1' },
          { puuid: 'puu-2', riot_name: 'player-two', riot_tag: 'KR2' },
        ],
      },
    })
    expect(members).toEqual([
      {
        puuId: 'puu-1',
        riotName: 'player-one',
        riotTag: 'KR1',
        teamId: null,
        teamName: null,
        position: 'Jungle',
      },
      {
        puuId: 'puu-2',
        riotName: 'player-two',
        riotTag: 'KR2',
        teamId: null,
        teamName: null,
        position: null,
      },
    ])
  })

  it('extracts unique match ids from member match list response', () => {
    const payload = {
      match_id_list: [
        { match_id: 'KR_1', match_creation_time: 1786602504 },
        { match_id: 'KR_2', match_creation_time: 1786262009 },
        { match_id: 'KR_1', match_creation_time: 1786259911 },
      ],
    }
    expect(extractMemberMatchIds(payload)).toEqual(['KR_1', 'KR_2'])
  })

  it('retries a transient network failure and returns the match list', async () => {
    const originalFetch = globalThis.fetch
    let attempts = 0
    const retryAttempts: number[] = []
    globalThis.fetch = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('temporary network failure')
      return {
        ok: true,
        json: async () => ({ match_id_list: [{ match_id: 'KR_RETRY' }] }),
      } as Response
    })
    try {
      await expect(fetchMemberMatchIds('puu-1', 'KR', 20, 2, (attempt) => retryAttempts.push(attempt)))
        .resolves.toEqual(['KR_RETRY'])
      expect(attempts).toBe(2)
      expect(retryAttempts).toEqual([1])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('matches tournament keyword after whitespace and case normalization', () => {
    expect(matchesTournamentKeyword('  2026-S2  리그전 ', '2026-s2 리그전')).toBe(true)
    expect(matchesTournamentKeyword('2026-S2 리그전 결승', '2026-S2 리그전')).toBe(false)
    expect(matchesTournamentKeyword('', '2026-S2 리그전')).toBe(false)
  })

  it('parses tournament name, timestamp and participants from match-cached shape', () => {
    const match = parseDeeplolMatch({
      match_basic_dict: {
        match_id: 'KR_123',
        tournament_name: '2026-S2 리그전',
        creation_timestamp: 1786000000,
        game_duration: 1800,
        queue_id: 8300,
      },
      participants_list: [
        {
          puu_id: 'puu-1',
          riot_id_name: 'player',
          riot_id_tag_line: 'KR1',
          team_id: '100',
          champion_id: '1',
          champion_name: 'Annie',
          position: 'Middle',
          kills: 8,
          deaths: 2,
          assists: 7,
          cs: 210,
          is_win: true,
        },
      ],
    }, 'fallback', 'KR')

    expect(match.matchId).toBe('KR_123')
    expect(match.tournamentName).toBe('2026-S2 리그전')
    expect(match.createdAt).toBeTruthy()
    expect(match.participants[0]).toMatchObject({
      puuId: 'puu-1',
      riotName: 'player',
      riotTag: 'KR1',
      kills: 8,
      deaths: 2,
      assists: 7,
      win: true,
    })
  })
})
