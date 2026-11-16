import { decideRetry, type RetryPolicy } from '@omne-harness/retry'

export const readRetryPolicy: RetryPolicy = {
  maxAttempts: 8,
  maxElapsedMs: 30_000,
  delaysMs: [250, 500, 1_000, 2_000, 4_000],
  jitter: 0.2,
}

export function readRetryDelayMs(failures: number, elapsedMs: number): number | null {
  const decision = decideRetry(readRetryPolicy, { failures, elapsedMs }, Math.random)
  return decision.kind === 'retry' ? decision.delayMs : null
}
