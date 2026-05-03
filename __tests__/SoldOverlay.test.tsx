import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SoldOverlay } from '@/features/auction/components/SoldOverlay'
import type { HTMLAttributes, ReactNode } from 'react'

type MotionDivProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode
}

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () =>
        ({ children, ...props }: MotionDivProps) =>
          React.createElement('div', props, children),
    },
  ),
  useReducedMotion: () => false,
}))

describe('SoldOverlay', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('TC-4: playerName, teamName, price를 DOM에 렌더링한다', () => {
    const onDismiss = vi.fn()
    render(
      <SoldOverlay playerName="홍길동" teamName="팀1" price={150} onDismiss={onDismiss} />,
    )
    expect(screen.getByText('홍길동')).toBeInTheDocument()
    expect(screen.getByText('팀1')).toBeInTheDocument()
    expect(screen.getByText('150 P')).toBeInTheDocument()
  })

  it('TC-5: 3초 후 onDismiss가 1번 호출된다', async () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(
      <SoldOverlay playerName="선수" teamName="팀" price={100} onDismiss={onDismiss} />,
    )
    expect(onDismiss).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(3000)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
