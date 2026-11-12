// The two synchronous steps of RFC-0015 §15「两条硬要求」are pinned in the types: neither `enter`
// nor `subscribe` returns a promise, so no implementation can yield between their two halves.
import { expectTypeOf, test } from 'vitest'
import type { ProtocolKey } from '@omne-harness/access-cordis-contract'
import type {
  AvailabilitySubscription,
  Entered,
  RegistryForPipeline,
} from '../src/registry/registry.ts'

test('enter is synchronous', () => {
  type Result = ReturnType<RegistryForPipeline['enter']>
  expectTypeOf<Result>().toEqualTypeOf<Entered | undefined>()
  expectTypeOf<Result>().not.toExtend<PromiseLike<unknown>>()
  expectTypeOf<RegistryForPipeline['enter']>().parameters.toEqualTypeOf<[ProtocolKey, string]>()
})

test('subscribe is synchronous', () => {
  type Result = ReturnType<RegistryForPipeline['subscribe']>
  expectTypeOf<Result>().toEqualTypeOf<AvailabilitySubscription>()
  expectTypeOf<Result>().not.toExtend<PromiseLike<unknown>>()
})
