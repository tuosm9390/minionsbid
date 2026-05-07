// 추첨 애니메이션의 포커스 비의존 완료 동작을 검증한다.
import React, { type HTMLAttributes, type ImgHTMLAttributes, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LotteryAnimation } from '@/features/auction/components/LotteryAnimation'
import type { Player } from '@/features/auction/store/useAuctionStore'

type MotionProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode
}

const animationControls = {
  start: vi.fn(() => new Promise(() => {})),
  stop: vi.fn(),
}

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) =>
    React.createElement('img', props),
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  motion: new Proxy(
    {},
    {
      get: () =>
        ({ children, ...props }: MotionProps) =>
          React.createElement('div', props, children),
    },
  ),
  useAnimationControls: () => animationControls,
  useReducedMotion: () => false,
}))

const player: Player = {
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

describe('LotteryAnimation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('애니메이션 완료 Promise가 멈춰도 경과 시간 기준으로 완료 콜백을 호출한다', async () => {
    vi.useFakeTimers()
    const onFinished = vi.fn()

    render(
      <LotteryAnimation
        candidates={[player]}
        targetPlayer={player}
        onFinished={onFinished}
      />,
    )

    expect(screen.getByText('추첨 중...')).toBeInTheDocument()
    await act(async () => {})

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4600)
    })

    expect(screen.getByText('추첨 완료!')).toBeInTheDocument()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('같은 선수 추첨 중 부모가 재렌더되어도 완료 타이머를 다시 시작하지 않는다', async () => {
    vi.useFakeTimers()
    const onFinished = vi.fn()
    const nextOnFinished = vi.fn()

    const { rerender } = render(
      <LotteryAnimation
        candidates={[player]}
        targetPlayer={player}
        onFinished={onFinished}
      />,
    )

    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    rerender(
      <LotteryAnimation
        candidates={[{ ...player }]}
        targetPlayer={{ ...player }}
        onFinished={nextOnFinished}
      />,
    )

    expect(screen.getByText('추첨 중...')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600)
    })

    expect(screen.getByText('추첨 완료!')).toBeInTheDocument()
    expect(onFinished).not.toHaveBeenCalled()
    expect(nextOnFinished).toHaveBeenCalledTimes(1)
    expect(animationControls.start).toHaveBeenCalledTimes(1)
  })

  it('추첨 완료 후 부모가 재렌더되어도 완료 화면을 유지한다', async () => {
    vi.useFakeTimers()
    const onFinished = vi.fn()

    const { rerender } = render(
      <LotteryAnimation
        candidates={[player]}
        targetPlayer={player}
        onFinished={onFinished}
      />,
    )

    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4600)
    })

    expect(screen.getByText('추첨 완료!')).toBeInTheDocument()

    rerender(
      <LotteryAnimation
        candidates={[{ ...player }]}
        targetPlayer={{ ...player }}
        onFinished={() => undefined}
      />,
    )

    expect(screen.getByText('추첨 완료!')).toBeInTheDocument()
    expect(screen.queryByText('추첨 중...')).not.toBeInTheDocument()
    expect(animationControls.start).toHaveBeenCalledTimes(1)
  })
})
