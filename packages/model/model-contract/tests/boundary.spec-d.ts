import { expectTypeOf, it } from 'vitest'

// The implementation names belong to `@omne-harness/model`. The contract must not export them.
// @ts-expect-error executeModel is an implementation function of model
import type { executeModel } from '@omne-harness/model-contract'
// @ts-expect-error createModelRuntime is an implementation factory of model
import type { createModelRuntime } from '@omne-harness/model-contract'
// @ts-expect-error ModelConfiguration is a model implementation type
import type { ModelConfiguration } from '@omne-harness/model-contract'

type RootValues = keyof typeof import('@omne-harness/model-contract')

it('the pure contract does not publish the implementation names as values or types', () => {
  expectTypeOf<'executeModel'>().not.toExtend<RootValues>()
  expectTypeOf<'createModelRuntime'>().not.toExtend<RootValues>()
  expectTypeOf<executeModel>().toBeAny()
  expectTypeOf<createModelRuntime>().toBeAny()
  expectTypeOf<ModelConfiguration>().toBeAny()
})
