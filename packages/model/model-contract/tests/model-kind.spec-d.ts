import { describe, expectTypeOf, it } from 'vitest'
import {
  KIND_TRAITS,
  type FixedModelRequest,
  type KindTraits,
  type LlmProfile,
  type ModelKind,
  type ModelProfileDefinition,
  type ProfileCommon,
  type ProfileIdentity,
  type RequestKind,
} from '../src/index.ts'

describe('the kinds of model', () => {
  it('has the traits of every kind, and no kind is left out', () => {
    expectTypeOf(KIND_TRAITS).toExtend<Readonly<Record<ModelKind, KindTraits>>>()
    expectTypeOf<keyof typeof KIND_TRAITS>().toEqualTypeOf<ModelKind>()
  })

  it('the kind runs through the identity, the definition and the request', () => {
    expectTypeOf<ProfileIdentity['kind']>().toEqualTypeOf<ModelKind>()
    expectTypeOf<ModelProfileDefinition>().toEqualTypeOf<ProfileCommon & LlmProfile>()
    expectTypeOf<LlmProfile['kind']>().toEqualTypeOf<'llm'>()
    expectTypeOf<FixedModelRequest['kind']>().toEqualTypeOf<RequestKind>()
    expectTypeOf<RequestKind>().toExtend<ModelKind>()
  })

  it('a table that leaves a kind out does not compile', () => {
    const partial = { llm: KIND_TRAITS.llm, decisions: KIND_TRAITS.decisions }
    // @ts-expect-error -- `live` is missing
    const table: Readonly<Record<ModelKind, KindTraits>> = partial
    expectTypeOf(table).toExtend<object>()
  })
})
