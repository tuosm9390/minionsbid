import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './deeplolSync'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('Deeplol bounded concurrency', () => {
  it.each([1, 2, 4, 8, 16])('never exceeds concurrency %s and preserves ordered results', async (concurrency) => {
    let inFlight = 0
    let maxInFlight = 0

    const results = await mapWithConcurrency(
      Array.from({ length: 20 }, (_, index) => index),
      concurrency,
      async (value) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await sleep(1)
        inFlight -= 1
        return value * 2
      },
    )

    expect(maxInFlight).toBeLessThanOrEqual(concurrency)
    expect(results).toEqual(Array.from({ length: 20 }, (_, index) => index * 2))
  })

  it('propagates a worker rejection to the caller', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
        await sleep(1)
        if (value === 2) throw new Error('simulated failure')
        return value
      }),
    ).rejects.toThrow('simulated failure')
  })
})
