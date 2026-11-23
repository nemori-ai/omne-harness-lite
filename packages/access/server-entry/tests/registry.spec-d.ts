import { expectTypeOf, test } from 'vitest'
import type { ProtocolKey } from '@omne-harness/access-cordis-contract'
import type { Scope } from '@omne-harness/dynamis'
import type {
  AvailabilitySubscription,
  Entered,
  Refusal,
  RegistryForPipeline,
} from '../src/registry/registry.ts'

test('enter is synchronous', () => {
  type Result = ReturnType<RegistryForPipeline['enter']>
  expectTypeOf<Result>().toEqualTypeOf<Entered | Refusal>()
  expectTypeOf<Result>().not.toExtend<PromiseLike<unknown>>()
  expectTypeOf<RegistryForPipeline['enter']>().parameters.toEqualTypeOf<
    [key: ProtocolKey, name: string, scope?: Scope | undefined]
  >()
})

test('subscribe is synchronous', () => {
  type Result = ReturnType<RegistryForPipeline['subscribe']>
  expectTypeOf<Result>().toEqualTypeOf<AvailabilitySubscription>()
  expectTypeOf<Result>().not.toExtend<PromiseLike<unknown>>()
})
