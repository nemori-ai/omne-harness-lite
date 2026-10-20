import { expectTypeOf, it } from 'vitest'
import { executeModel } from '@omne-harness/model'
import type {
  FixedModelRequest,
  IndependentModelFact,
  ModelTransport,
} from '@omne-harness/model-contract'

it('exposes one independent execution through the root with contract-owned types', () => {
  expectTypeOf(executeModel).parameters.toEqualTypeOf<
    [FixedModelRequest, ModelTransport, AbortSignal]
  >()
  expectTypeOf(executeModel).returns.toEqualTypeOf<AsyncIterable<IndependentModelFact>>()
})
