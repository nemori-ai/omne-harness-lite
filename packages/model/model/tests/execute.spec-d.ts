import { expectTypeOf, it } from 'vitest'
import { executeModel } from '@omne-harness/model'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import type { IndependentModelFact, ModelTransport } from '@omne-harness/model-contract/provider'

it('exposes one independent execution through the root with contract-owned types', () => {
  expectTypeOf(executeModel).parameters.toEqualTypeOf<
    [FixedModelRequest, ModelTransport, AbortSignal]
  >()
  expectTypeOf(executeModel).returns.toEqualTypeOf<AsyncIterable<IndependentModelFact>>()
})
