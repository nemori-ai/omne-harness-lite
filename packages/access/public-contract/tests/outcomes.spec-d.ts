import { expectTypeOf, test } from 'vitest'
import type { FixedOutcome, Outcome } from '@omne-harness/public-contract'

test('six outcomes are fixed to an empty body', () => {
  expectTypeOf<FixedOutcome>().toEqualTypeOf<
    | 'denied'
    | 'protocol-rejected'
    | 'basis-unavailable'
    | 'unknown'
    | 'uniform-auth-failure'
    | 'stage-not-provided'
  >()
  expectTypeOf<FixedOutcome>().toExtend<Outcome>()
})
