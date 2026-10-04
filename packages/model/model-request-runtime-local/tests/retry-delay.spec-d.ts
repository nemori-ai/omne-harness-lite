import { expectTypeOf, it } from 'vitest'
import { retryDelay } from '../src/retry-delay.ts'
import { type RetryDelayInput, type RetryDelayResult } from '../src/retry-delay-types.ts'
import type { Duration } from '@omne-harness-lite/tool-definition'

it('public signature retains explicit facts and synchronous Duration output', () => {
  expectTypeOf(retryDelay).parameter(0).toEqualTypeOf<RetryDelayInput>()
  expectTypeOf(retryDelay).returns.toEqualTypeOf<RetryDelayResult>()
  expectTypeOf<Extract<RetryDelayResult, { ok: Duration }>['ok']>().toEqualTypeOf<Duration>()
  const policy = {
    kind: 'linear',
    base: 'PT1S',
    factor: 1.5,
    max: 'PT10S',
    jitter: 'decorrelated',
  } as const
  // @ts-expect-error decorrelated has an explicit required previous value
  retryDelay({ policy, n: 1, uniformSample: 0.5 })
  // @ts-expect-error the sample is required even for none
  retryDelay({ policy: { ...policy, jitter: 'none' }, n: 1 })
  // @ts-expect-error seeds have no public input position
  retryDelay({ policy: { ...policy, jitter: 'none' }, n: 1, uniformSample: 0.5, seed: 123 })
  // @ts-expect-error milliseconds as a number are not a TD3 Duration
  retryDelay({ policy: { ...policy, base: 1000 }, n: 1, uniformSample: 0.5, previousDelay: 'PT1S' })
})
