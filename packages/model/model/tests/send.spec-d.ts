import { expectTypeOf, it } from 'vitest'
import { createModelSendBoundary, type ModelSendBoundaryOptions } from '@omne-harness/model'
import type { CredentialPort, ModelSendBoundary } from '@omne-harness/model-contract/provider'
it('constructs the contract send boundary with package-owned construction dependencies', () => {
  expectTypeOf(createModelSendBoundary<string>).parameters.toEqualTypeOf<
    [ModelSendBoundaryOptions<string>]
  >()
  expectTypeOf(createModelSendBoundary<string>).returns.toEqualTypeOf<ModelSendBoundary<string>>()
  expectTypeOf<ModelSendBoundaryOptions<string>['credentials']>().toEqualTypeOf<
    CredentialPort<string>
  >()
})
