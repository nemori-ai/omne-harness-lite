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
