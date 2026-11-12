import { expectTypeOf, test } from 'vitest'
import type {
  FixedOutcome,
  GovernanceResponse,
  HitlResponse,
  Outcome,
  SessionResponse,
} from '@omne-harness/public-contract'

test('the outcome type equals the outcomes the three existing families answer', () => {
  type Existing =
    | GovernanceResponse['outcome']
    | SessionResponse['outcome']
    | HitlResponse['outcome']
    | 'protocol-rejected'
    | 'stage-not-provided'
  expectTypeOf<Outcome>().toEqualTypeOf<Existing>()
})

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
