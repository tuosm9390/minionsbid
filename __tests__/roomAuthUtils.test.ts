import { describe, expect, it, vi } from 'vitest'
import {
  isValidRoomRole,
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
        roomAuthData: { organizer_token: 'org-token' },
      })
      .mockResolvedValueOnce({
        roomAuthData: { viewer_token: 'viewer-token' },
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
        teamTokenData: { leader_token: 'leader-token' },
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
        token: 'wrong-token',
        isFixtureEnabled: false,
        verifyFixtureAccess,
        loadTokenDocuments,
      }),
    ).resolves.toBe(false)
  })
})
