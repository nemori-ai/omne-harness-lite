import { describe, expectTypeOf, it } from 'vitest'
import {
  KIND_TRAITS,
  type LlmModelRequest,
  type KindTraits,
  type LlmProfile,
  type ModelKind,
  type ModelProfileDefinition,
  type ProfileCommon,
  type ProfileIdentity,
  type DecisionsModelRequest,
  type DecisionsProfile,
  type DecisionsRequest,
  type FixedModelRequest,
  type LlmRequest,
  type ProfileKind,
  type RequestCommon,
} from '../src/index.ts'

describe('the kinds of model', () => {
  it('has the traits of every kind, and no kind is left out', () => {
    expectTypeOf(KIND_TRAITS).toExtend<Readonly<Record<ModelKind, KindTraits>>>()
    expectTypeOf<keyof typeof KIND_TRAITS>().toEqualTypeOf<ModelKind>()
  })

  it('the kind runs through the identity, the definition and the request', () => {
    expectTypeOf<ProfileIdentity['kind']>().toEqualTypeOf<ModelKind>()
    expectTypeOf<ModelProfileDefinition<'llm'>>().toEqualTypeOf<ProfileCommon & LlmProfile>()
    expectTypeOf<LlmProfile['kind']>().toEqualTypeOf<'llm'>()
    expectTypeOf<ModelProfileDefinition<'decisions'>>().toEqualTypeOf<
      ProfileCommon & DecisionsProfile
    >()
    expectTypeOf<FixedModelRequest>().toEqualTypeOf<LlmModelRequest | DecisionsModelRequest>()
    expectTypeOf<FixedModelRequest['kind']>().toExtend<ModelKind>()
    expectTypeOf<LlmModelRequest>().toEqualTypeOf<RequestCommon & LlmRequest>()
    expectTypeOf<DecisionsModelRequest>().toEqualTypeOf<RequestCommon & DecisionsRequest>()
    expectTypeOf<ProfileKind>().toEqualTypeOf<FixedModelRequest['kind']>()
  })

  it('a table that leaves a kind out does not compile', () => {
    const partial = { llm: KIND_TRAITS.llm, decisions: KIND_TRAITS.decisions }
    // @ts-expect-error -- `live` is missing
    const table: Readonly<Record<ModelKind, KindTraits>> = partial
    expectTypeOf(table).toExtend<object>()
  })
})
