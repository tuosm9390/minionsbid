import { mapWithConcurrency } from './deeplolSync'

type BenchmarkResult = {
  concurrency: number
  durationMs: number
  maxInFlight: number
  completed: number
  failed: number
  retries: number
}

const concurrencyValues = [1, 2, 4, 8, 16]
const itemCount = 40
const baseLatencyMs = 25
const jitterMs = 10
const transientFailureEvery = 13

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runBenchmark(concurrency: number): Promise<BenchmarkResult> {
  let inFlight = 0
  let maxInFlight = 0
  let retries = 0
  let completed = 0
  let failed = 0

  const startedAt = performance.now()
  await mapWithConcurrency(
    Array.from({ length: itemCount }, (_, index) => index),
    concurrency,
    async (index) => {
      let attempt = 0
      while (attempt < 2) {
        attempt += 1
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await sleep(baseLatencyMs + ((index * 7) % jitterMs))
        inFlight -= 1

        if (index % transientFailureEvery === 0 && attempt === 1) {
          retries += 1
          continue
        }
        if (index % 17 === 0 && attempt === 2) {
          failed += 1
          return
        }
        completed += 1
        return
      }
    },
  )

  return {
    concurrency,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    maxInFlight,
    completed,
    failed,
    retries,
  }
}

async function main() {
  const results = []
  for (const concurrency of concurrencyValues) {
    results.push(await runBenchmark(concurrency))
  }

  console.table(results)
  console.log(JSON.stringify({ itemCount, baseLatencyMs, transientFailureEvery, results }, null, 2))
}

void main()
