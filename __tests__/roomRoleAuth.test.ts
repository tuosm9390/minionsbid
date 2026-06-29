// 경매방 팀장/관전자 서버 인증 헬퍼를 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEADER_AUTH_ERROR,
  requireRoomLeader,
  requireRoomLeaderInvite,
  requireRoomViewer,
  VIEWER_AUTH_ERROR,
} from '@/features/auction/api/roomRoleAuth'
import { createRoomInviteToken } from '@/features/auction/utils/roomInviteToken'

const { mockRoomAuthDocGet, mockTeamTokenGet, mockRoomDocGet, mockTeamDocGet } = vi.hoisted(() => ({
  mockRoomAuthDocGet: vi.fn(),
  mockTeamTokenGet: vi.fn(),
  mockRoomDocGet: vi.fn(),
  mockTeamDocGet: vi.fn(),
}))

vi.mock('@/features/auction/realtime/serverAdapter', () => ({
  getAuctionServerServices: vi.fn(() => ({
    firestore: {
      collection: vi.fn((collectionName: string) => ({
        doc: vi.fn(() => {
          if (collectionName === 'room_auth_secrets') {
            return {
              get: mockRoomAuthDocGet,
              collection: vi.fn(() => ({
                doc: vi.fn(() => ({ get: mockTeamTokenGet })),
              })),
            }
          }
          return {
            get: mockRoomDocGet,
            collection: vi.fn(() => ({
              doc: vi.fn(() => ({ get: mockTeamDocGet })),
            })),
          }
        }),
      })),
    },
  })),
}))

describe('roomRoleAuth', () => {
  beforeEach(() => {
    mockRoomAuthDocGet.mockReset()
    mockTeamTokenGet.mockReset()
    mockRoomDocGet.mockReset()
    mockTeamDocGet.mockReset()
  })

  it('저장된 팀장 토큰과 일치하면 통과한다', async () => {
    mockTeamTokenGet.mockResolvedValue({ data: () => ({ leader_token: 'leader-token' }) })
    mockTeamDocGet.mockResolvedValue({ data: () => ({}) })

    await expect(requireRoomLeader('room-1', 'team-1', 'leader-token')).resolves.toBeNull()
  })

  it('다른 팀장 토큰이면 권한 오류를 반환한다', async () => {
    mockTeamTokenGet.mockResolvedValue({ data: () => ({ leader_token: 'leader-token' }) })
    mockTeamDocGet.mockResolvedValue({ data: () => ({}) })

    await expect(requireRoomLeader('room-1', 'team-1', 'wrong-token')).resolves.toBe(LEADER_AUTH_ERROR)
  })

  it('암호화된 팀장 invite를 저장된 팀장 토큰과 비교한다', async () => {
    const invite = createRoomInviteToken({
      roomId: 'room-1',
      role: 'LEADER',
      teamId: 'team-1',
      token: 'leader-token',
    })
    mockTeamTokenGet.mockResolvedValue({ data: () => ({ leader_token: 'leader-token' }) })

    await expect(requireRoomLeader('room-1', 'team-1', invite)).resolves.toBeNull()
    await expect(requireRoomLeaderInvite('room-1', invite)).resolves.toMatchObject({
      teamId: 'team-1',
      leaderToken: 'leader-token',
    })
  })

  it('관전자 토큰을 검증한다', async () => {
    mockRoomAuthDocGet.mockResolvedValue({ data: () => ({ viewer_token: 'viewer-token' }) })
    mockRoomDocGet.mockResolvedValue({ data: () => ({}) })

    await expect(requireRoomViewer('room-1', 'viewer-token')).resolves.toBeNull()
    await expect(requireRoomViewer('room-1', 'wrong-token')).resolves.toBe(VIEWER_AUTH_ERROR)
  })
})
