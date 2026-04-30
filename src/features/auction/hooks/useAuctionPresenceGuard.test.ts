import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuctionPresenceGuard } from './useAuctionPresenceGuard'

const pauseAuction = vi.fn()
const resumeAuction = vi.fn()

vi.mock('@/features/auction/api/auctionActions', () => ({
  pauseAuction: (...args: unknown[]) => pauseAuction(...args),
  resumeAuction: (...args: unknown[]) => resumeAuction(...args),
}))

describe('useAuctionPresenceGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pauseAuction.mockResolvedValue({})
    resumeAuction.mockResolvedValue({ timerEndsAt: new Date().toISOString() })
  })

  it('organizer가 진행 중 경매에서 연결 이탈을 감지하면 pauseAuction을 호출한다', async () => {
    renderHook(() =>
      useAuctionPresenceGuard({
        roomId: 'room-1',
        effectiveRole: 'ORGANIZER',
        isPresenceLoaded: true,
        allConnected: false,
        currentPlayerId: 'player-1',
        timerEndsAt: new Date(Date.now() + 5000).toISOString(),
        lotteryPlayerId: null,
      }),
    )

    await waitFor(() => {
      expect(pauseAuction).toHaveBeenCalledWith('room-1')
    })
    expect(resumeAuction).not.toHaveBeenCalled()
  })

  it('pause 이후 재연결되면 resumeAuction을 한 번 호출한다', async () => {
    const { rerender } = renderHook(
      (props: {
        allConnected: boolean
        timerEndsAt: string | null
      }) =>
        useAuctionPresenceGuard({
          roomId: 'room-1',
          effectiveRole: 'ORGANIZER',
          isPresenceLoaded: true,
          allConnected: props.allConnected,
          currentPlayerId: 'player-1',
          timerEndsAt: props.timerEndsAt,
          lotteryPlayerId: null,
        }),
      {
        initialProps: {
          allConnected: false,
          timerEndsAt: new Date(Date.now() + 5000).toISOString(),
        },
      },
    )

    await waitFor(() => {
      expect(pauseAuction).toHaveBeenCalledWith('room-1')
    })

    rerender({
      allConnected: true,
      timerEndsAt: null,
    })

    await waitFor(() => {
      expect(resumeAuction).toHaveBeenCalledWith('room-1')
    })
  })

  it('lottery 단계나 organizer가 아닌 경우에는 자동 pause/resume을 호출하지 않는다', async () => {
    renderHook(() =>
      useAuctionPresenceGuard({
        roomId: 'room-1',
        effectiveRole: 'LEADER',
        isPresenceLoaded: true,
        allConnected: false,
        currentPlayerId: 'player-1',
        timerEndsAt: new Date(Date.now() + 5000).toISOString(),
        lotteryPlayerId: 'player-1',
      }),
    )

    await Promise.resolve()
    expect(pauseAuction).not.toHaveBeenCalled()
    expect(resumeAuction).not.toHaveBeenCalled()
  })
})
