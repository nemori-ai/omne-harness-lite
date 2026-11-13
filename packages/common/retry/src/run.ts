import { decideRetry } from './decide.ts'
import type { RetryPolicy } from './policy.ts'

export interface RetryRuntime {
  readonly now: () => number
  readonly wait: (delayMs: number, signal?: AbortSignal) => Promise<void>
  readonly random: () => number
}

export type Attempted<T> =
  | { readonly kind: 'done'; readonly value: T }
  | { readonly kind: 'retryable'; readonly cause: unknown }

export type RetryOutcome<T> =
  | { readonly kind: 'done'; readonly value: T; readonly attempts: number }
  | {
      readonly kind: 'exhausted'
      readonly by: 'attempts' | 'elapsed'
      readonly attempts: number
      readonly lastCause: unknown
    }
  | { readonly kind: 'aborted'; readonly attempts: number }

export interface RetryOptions {
  readonly signal?: AbortSignal
  readonly onRetry?: (retry: {
    readonly attempt: number
    readonly delayMs: number
    readonly cause: unknown
  }) => void
}

async function waitOrAbort(
  runtime: RetryRuntime,
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<'waited' | 'aborted'> {
  try {
    await runtime.wait(delayMs, signal)
  } catch (error) {
    if (signal?.aborted === true) return 'aborted'
    throw error
  }
  return signal?.aborted === true ? 'aborted' : 'waited'
}

export async function runWithRetry<T>(
  policy: RetryPolicy,
  attempt: (attemptNumber: number) => Promise<Attempted<T>>,
  runtime: RetryRuntime,
  options?: RetryOptions,
): Promise<RetryOutcome<T>> {
  const signal = options?.signal
  const started = runtime.now()
  for (let n = 1; ; n++) {
    if (signal?.aborted === true) return { kind: 'aborted', attempts: n - 1 }
    const result = await attempt(n)
    if (result.kind === 'done') return { kind: 'done', value: result.value, attempts: n }
    const decision = decideRetry(
      policy,
      { failures: n, elapsedMs: runtime.now() - started },
      runtime.random,
    )
    if (decision.kind === 'exhausted')
      return { kind: 'exhausted', by: decision.by, attempts: n, lastCause: result.cause }
    options?.onRetry?.({
      attempt: decision.attempt,
      delayMs: decision.delayMs,
      cause: result.cause,
    })
    if ((await waitOrAbort(runtime, decision.delayMs, signal)) === 'aborted')
      return { kind: 'aborted', attempts: n }
  }
}
