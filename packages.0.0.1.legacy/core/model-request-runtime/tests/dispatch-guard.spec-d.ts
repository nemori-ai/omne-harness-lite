import { expectTypeOf } from 'vitest'
import {
  dispatchGuard,
  type DispatchGuardFact,
  type DispatchGuardInput,
  type DispatchGuardResult,
} from '../src/index.ts'
import type { RetryPlan } from '@omne-harness-lite/loop-extension'
import { guardInput } from './dispatch-guard-fixture.ts'

expectTypeOf(dispatchGuard(guardInput())).toEqualTypeOf<DispatchGuardResult>()
expectTypeOf<DispatchGuardInput['plan']>().toEqualTypeOf<RetryPlan>()
expectTypeOf<DispatchGuardFact<boolean>>().toEqualTypeOf<
  { readonly known: boolean } | { readonly unknown: true }
>()

const input = guardInput()
// @ts-expect-error The public fact surface is readonly.
input.call = { known: null }
// @ts-expect-error Plans keep the shared Duration string domain.
const numericAfter: DispatchGuardInput['plan'] = { provider: 'first', after: 1 }
// @ts-expect-error No model switch is part of a retry plan.
const switchModel: DispatchGuardInput['plan'] = { provider: 'first', model: 'another' }
// @ts-expect-error A refusal is not an allowed:false result.
const silentFalse: DispatchGuardResult = { allowed: false }
// @ts-expect-error A stopping runtime is not part of this pure guard's closed result set.
const stopped: DispatchGuardResult = { rejected: 'runtimeStopped' }
// @ts-expect-error Unknown is explicit and cannot be false.
const falseUnknown: DispatchGuardFact<boolean> = { unknown: false }
expectTypeOf(numericAfter).toEqualTypeOf<RetryPlan>()
expectTypeOf(switchModel).toEqualTypeOf<RetryPlan>()
expectTypeOf(silentFalse).toEqualTypeOf<DispatchGuardResult>()
expectTypeOf(stopped).toEqualTypeOf<DispatchGuardResult>()
expectTypeOf(falseUnknown).toEqualTypeOf<DispatchGuardFact<boolean>>()
