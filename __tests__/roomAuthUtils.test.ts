import { describe, expect, it, vi } from 'vitest'
import {
  buildRoomAuthCookieName,
  isRoomAuthCookieMatch,
  isValidRoomRole,
  parseRoomAuthCookie,
  validateRoomAuthToken,
} from '@/features/auction/utils/roomAuth'

describe('roomAuth utils', () => {
  it('validates supported roles only', () => {
    expect(isValidRoomRole('ORGANIZER')).toBe(true)
    expect(isValidRoomRole('LEADER')).toBe(true)
    expect(isValidRoomRole('VIEWER')).toBe(true)
    expect(isValidRoomRole('ADMIN')).toBe(false)
    expect(isValidRoomRole(null)).toBe(false)
  })

  it('builds unique cookie names for organizer and leader', () => {
    expect(buildRoomAuthCookieName('room-1', 'ORGANIZER')).toBe('room_auth_room-1_ORGANIZER')
    expect(buildRoomAuthCookieName('room-1', 'VIEWER')).toBe('room_auth_room-1_VIEWER')
    expect(buildRoomAuthCookieName('room-1', 'LEADER', 'team-a')).toBe(
      'room_auth_room-1_LEADER_team-a',
    )
  })

  it('parses valid auth cookies and rejects invalid payloads', () => {
    expect(
      parseRoomAuthCookie(JSON.stringify({ role: 'LEADER', teamId: 'team-a', token: 'x' })),
    ).toEqual({
      role: 'LEADER',
      teamId: 'team-a',
      token: 'x',
    })
    expect(parseRoomAuthCookie(undefined)).toBeNull()
    expect(parseRoomAuthCookie('{broken json')).toBeNull()
  })

  it('rejects leader auth cookies without a matching team id', () => {
    expect(
      isRoomAuthCookieMatch({
        parsed: parseRoomAuthCookie(JSON.stringify({ role: 'LEADER', teamId: 'team-a' })),
        role: 'LEADER',
        teamId: 'team-a',
      }),
    ).toBe(true)
    expect(
      isRoomAuthCookieMatch({
        parsed: parseRoomAuthCookie(JSON.stringify({ role: 'LEADER', teamId: null })),
        role: 'LEADER',
        teamId: null,
      }),
    ).toBe(false)
    expect(
      isRoomAuthCookieMatch({
        parsed: parseRoomAuthCookie(JSON.stringify({ role: 'LEADER', teamId: 'team-a' })),
        role: 'LEADER',
        teamId: 'team-b',
      }),
    ).toBe(false)
  })

  it('validates fixture auth through the injected verifier', async () => {
    const verifyFixtureAccess = vi.fn().mockReturnValue(true)
    const loadTokenDocuments = vi.fn()

    const result = await validateRoomAuthToken({
      roomId: 'room-1',
      role: 'ORGANIZER',
      token: 'fixture-token',
      isFixtureEnabled: true,
      verifyFixtureAccess,
      loadTokenDocuments,
    })

    expect(result).toBe(true)
    expect(verifyFixtureAccess).toHaveBeenCalledWith({
      roomId: 'room-1',
      role: 'ORGANIZER',
      token: 'fixture-token',
      teamId: undefined,
    })
    expect(loadTokenDocuments).not.toHaveBeenCalled()
  })

  it('validates organizer and viewer tokens from room auth documents', async () => {
    const verifyFixtureAccess = vi.fn()
    const loadTokenDocuments = vi
      .fn()
      .mockResolvedValueOnce({
        roomData: {},
        roomAuthData: { organizer_token: 'org-token' },
      })
      .mockResolvedValueOnce({
        roomData: { viewer_token: 'viewer-token' },
        roomAuthData: {},
      })

    await expect(
      validateRoomAuthToken({
        roomId: 'room-1',
        role: 'ORGANIZER',
        token: 'org-token',
        isFixtureEnabled: false,
        verifyFixtureAccess,
        loadTokenDocuments,
      }),
    ).resolves.toBe(true)

    await expect(
      validateRoomAuthToken({
        roomId: 'room-1',
        role: 'VIEWER',
        token: 'viewer-token',
        isFixtureEnabled: false,
        verifyFixtureAccess,
        loadTokenDocuments,
      }),
    ).resolves.toBe(true)
  })

  it('validates leader token from team auth documents and rejects mismatches', async () => {
    const verifyFixtureAccess = vi.fn()
    const loadTokenDocuments = vi
      .fn()
      .mockResolvedValueOnce({
        roomData: {},
        roomAuthData: {},
        teamData: {},
        teamTokenData: { leader_token: 'leader-token' },
      })
      .mockResolvedValueOnce({
        roomData: {},
        roomAuthData: {},
        teamData: { leader_token: 'team-fallback-token' },
        teamTokenData: {},
      })
      .mockResolvedValueOnce(null)

    await expect(
      validateRoomAuthToken({
        roomId: 'room-1',
        role: 'LEADER',
        teamId: 'team-a',
        token: 'leader-token',
        isFixtureEnabled: false,
        verifyFixtureAccess,
        loadTokenDocuments,
      }),
    ).resolves.toBe(true)

    await expect(
      validateRoomAuthToken({
        roomId: 'room-1',
        role: 'LEADER',
        teamId: 'team-a',
        token: 'team-fallback-token',
        isFixtureEnabled: false,
        verifyFixtureAccess,
        loadTokenDocuments,
      }),
    ).resolves.toBe(true)

    await expect(
      validateRoomAuthToken({
        roomId: 'room-1',
        role: 'LEADER',
        teamId: 'team-a',
        token: 'wrong-token',
        isFixtureEnabled: false,
        verifyFixtureAccess,
        loadTokenDocuments,
      }),
    ).resolves.toBe(false)
  })
})
