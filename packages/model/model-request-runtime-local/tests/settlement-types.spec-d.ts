import { expectTypeOf, test } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { createSettlementCoordinator } from '@omne-harness-lite/session-runtime-local'
import { readSettlementPrefix } from '@omne-harness-lite/model-request-runtime'
import {
  type SettlementResult,
  type SettlementTask,
  type SettlementLogBinding,
  type SettlementRegistration,
  type SettlementContention,
  type SettlementCoordinator as PublicSettlementCoordinator,
  type SettlementRequest as PublicSettlementRequest,
  type SettlementHandle as PublicSettlementHandle,
  type SettlementCoordinatorBinding,
} from '@omne-harness-lite/model-request-runtime'
import {
  type SettlementCoordinatorInput,
  type SettlementRequest,
  type SettlementHandle,
} from '@omne-harness-lite/model-request-runtime'

test('public settlement is an owned independent closure with precise policy numbers and no authority switches', () => {
  expectTypeOf(createSettlementCoordinator).parameter(0).toEqualTypeOf<SettlementCoordinatorInput>()
  expectTypeOf<
    ReturnType<typeof createSettlementCoordinator>
  >().toEqualTypeOf<PublicSettlementCoordinator>()
  expectTypeOf<SettlementRequest>().toEqualTypeOf<PublicSettlementRequest>()
  expectTypeOf<SettlementHandle>().toEqualTypeOf<PublicSettlementHandle>()
  expectTypeOf<
    Pick<SettlementCoordinatorInput, 'binding' | 'owner' | 'run'>
  >().toEqualTypeOf<SettlementCoordinatorBinding>()
  expectTypeOf<SettlementHandle['completion']>().toEqualTypeOf<Promise<SettlementResult>>()
  expectTypeOf<SettlementHandle['stopped']>().toEqualTypeOf<Promise<void>>()
  expectTypeOf<SettlementContention['limits']['elapsedMs']>().toMatchTypeOf<
    number | LosslessNumber
  >()
  expectTypeOf<SettlementTask<string>['completion']>().toEqualTypeOf<Promise<string>>()
  const request: SettlementRequest = {
    target: { call: 'call', dispatch: 1, response: 'response' },
    current: { messageId: null, disposition: null },
    response: null,
  }
  expectTypeOf(request).toEqualTypeOf<SettlementRequest>()
  // @ts-expect-error Permission cannot be supplied as an auth boolean.
  const auth: keyof SettlementLogBinding = 'authorized'
  // @ts-expect-error Provenance cannot be supplied as a trust boolean.
  const trusted: keyof SettlementCoordinatorInput = 'trusted'
  // @ts-expect-error The owner must register an asynchronous full read.
  const read: Parameters<typeof readSettlementPrefix>[0] = { binding: {} }
  expectTypeOf<SettlementRegistration['release']>().toEqualTypeOf<() => void>()
})
