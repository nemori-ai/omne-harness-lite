import type { RetryPolicy } from './policy.ts'

export type RetryDecision =
  | { readonly kind: 'retry'; readonly attempt: number; readonly delayMs: number }
  | { readonly kind: 'exhausted'; readonly by: 'attempts' | 'elapsed' }

export interface RetryProgress {
  readonly failures: number
  readonly elapsedMs: number
}

function checkProgress(progress: RetryProgress): void {
  if (!Number.isInteger(progress.failures) || progress.failures < 1)
    throw new RangeError('retry progress failures must be an integer of at least 1')
  if (!Number.isFinite(progress.elapsedMs) || progress.elapsedMs < 0)
    throw new RangeError('retry progress elapsedMs must be a finite number of at least 0')
}

function draw(random: () => number): number {
  const u = random()
  if (!(u >= 0 && u < 1)) throw new RangeError('retry random number must be in [0, 1)')
  return u
}

export function decideRetry(
  policy: RetryPolicy,
  progress: RetryProgress,
  random: () => number,
): RetryDecision {
  checkProgress(progress)
  if (progress.failures >= policy.maxAttempts) return { kind: 'exhausted', by: 'attempts' }
  const base = policy.delaysMs[Math.min(progress.failures, policy.delaysMs.length) - 1]
  if (base === undefined) throw new RangeError('retry policy delaysMs is empty')
  const delayMs = Math.round(base * (1 - policy.jitter * draw(random)))
  if (progress.elapsedMs + delayMs > policy.maxElapsedMs)
    return { kind: 'exhausted', by: 'elapsed' }
  return { kind: 'retry', attempt: progress.failures + 1, delayMs }
}
