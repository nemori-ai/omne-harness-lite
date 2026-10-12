import { expectTypeOf, test } from 'vitest'
import { decideRetry } from '../src/index.ts'
import type { DecideRetryInput, DecideRetryResult } from '../src/index.ts'

const subject = { unknown: true } as const
const policy = { kind: 'constant', base: 'PT1S', factor: 1, max: 'PT2S', jitter: 'none' } as const

test('the public pure decision requires the LC4 subject and explicit delay inputs', () => {
  expectTypeOf(decideRetry).parameter(0).toEqualTypeOf<DecideRetryInput>()
  expectTypeOf(decideRetry).returns.toEqualTypeOf<DecideRetryResult>()
  decideRetry({ subject, policy, uniformSample: 0.25 })
  decideRetry({
    subject,
    policy: { ...policy, jitter: 'decorrelated' },
    uniformSample: 0.25,
    previousDelay: 'PT1S',
  })
  // @ts-expect-error no implicit random sample
  decideRetry({ subject, policy })
  // @ts-expect-error decorrelated needs the explicit previous delay
  decideRetry({ subject, policy: { ...policy, jitter: 'decorrelated' }, uniformSample: 0.25 })
  // @ts-expect-error non-decorrelated input cannot supply previous delay
  decideRetry({ subject, policy, uniformSample: 0.25, previousDelay: 'PT1S' })
})
