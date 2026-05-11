import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { useAuctionControl } from './useAuctionControl'
import { awardPlayer, closeLotteryAction } from '@/features/auction/api/auctionActions'
import { useAuctionStore, type Player } from '@/features/auction/store/useAuctionStore'

vi.mock('@/features/auction/api/auctionActions', () => ({
  awardPlayer: vi.fn(),
  closeLotteryAction: vi.fn(),
}))

const inAuctionPlayer: Player = {
  id: 'player-1',
  room_id: 'room-1',
  name: 'Alpha',
  tier: '골드',
  main_position: 'MID',
  sub_position: 'TOP',
  status: 'IN_AUCTION',
  team_id: null,
  sold_price: null,
  description: '',
}

const waitingPlayer: Player = {
  ...inAuctionPlayer,
  id: 'player-2',
  name: 'Beta',
  status: 'WAITING',
}

describe('useAuctionControl', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy.mockClear()
    useAuctionStore.setState({
      lotteryPlayer: inAuctionPlayer,
      players: [],
      currentPlayerId: null,
      timerEndsAt: null,
    })
    ;(closeLotteryAction as Mock).mockResolvedValue({})
    ;(awardPlayer as Mock).mockResolvedValue({})
  })

  it('IN_AUCTION 전환을 감지하면 lotteryPlayer를 설정한다', async () => {
    const { rerender } = renderHook(
      ({ players }) =>
        useAuctionControl({
          roomId: 'room-1',
          effectiveRole: 'ORGANIZER',
          players,
          currentPlayerId: 'player-1',
          timerEndsAt: null,
        }),
      {
        initialProps: {
          players: [waitingPlayer],
        },
      },
    )

    act(() => {
      useAuctionStore.setState({ lotteryPlayer: null })
    })

    rerender({
      players: [inAuctionPlayer],
    })

    await waitFor(() => {
      expect(useAuctionStore.getState().lotteryPlayer?.id).toBe('player-1')
    })
  })

  it('organizer가 추첨 종료에 성공하면 lotteryPlayer를 즉시 null로 내린다', async () => {
    const { result } = renderHook(() =>
      useAuctionControl({
        roomId: 'room-1',
        effectiveRole: 'ORGANIZER',
        players: [inAuctionPlayer],
        currentPlayerId: 'player-1',
        timerEndsAt: null,
      }),
    )

    await act(async () => {
      await result.current.handleCloseLottery()
    })

    expect(closeLotteryAction).toHaveBeenCalledWith('room-1', 'Alpha')
    expect(useAuctionStore.getState().lotteryPlayer).toBeNull()
  })

  it('추첨 종료가 실패하면 lotteryPlayer를 유지한다', async () => {
    ;(closeLotteryAction as Mock).mockResolvedValue({ error: 'failed' })

    const { result } = renderHook(() =>
      useAuctionControl({
        roomId: 'room-1',
        effectiveRole: 'ORGANIZER',
        players: [inAuctionPlayer],
        currentPlayerId: 'player-1',
        timerEndsAt: null,
      }),
    )

    await act(async () => {
      await result.current.handleCloseLottery()
    })

    expect(closeLotteryAction).toHaveBeenCalledWith('room-1', 'Alpha')
    expect(useAuctionStore.getState().lotteryPlayer?.id).toBe('player-1')
    expect(window.alert).toHaveBeenCalledWith('추첨 종료 오류: failed')
  })

  it('organizer가 아니면 추첨 종료 액션을 호출하지 않는다', async () => {
    const { result } = renderHook(() =>
      useAuctionControl({
        roomId: 'room-1',
        effectiveRole: 'LEADER',
        players: [inAuctionPlayer],
        currentPlayerId: 'player-1',
        timerEndsAt: null,
      }),
    )

    await act(async () => {
      await result.current.handleCloseLottery()
    })

    expect(closeLotteryAction).not.toHaveBeenCalled()
    expect(useAuctionStore.getState().lotteryPlayer?.id).toBe('player-1')
  })

  it('organizer는 타이머 만료 후 자동 낙찰을 시도한다', async () => {
    vi.useFakeTimers()
    try {
      const timerEndsAt = new Date(Date.now() + 100).toISOString()
      renderHook(() =>
        useAuctionControl({
          roomId: 'room-1',
          effectiveRole: 'ORGANIZER',
          players: [inAuctionPlayer],
          currentPlayerId: 'player-1',
          timerEndsAt,
        }),
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_700)
      })

      expect(awardPlayer).toHaveBeenCalledWith('room-1', 'player-1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('leader는 타이머 만료 후 직접 자동 낙찰을 시도하지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const timerEndsAt = new Date(Date.now() + 100).toISOString()
      renderHook(() =>
        useAuctionControl({
          roomId: 'room-1',
          effectiveRole: 'LEADER',
          players: [inAuctionPlayer],
          currentPlayerId: 'player-1',
          timerEndsAt,
        }),
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })

      expect(awardPlayer).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
