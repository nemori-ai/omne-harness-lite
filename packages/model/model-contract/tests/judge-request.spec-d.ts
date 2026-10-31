import { expectTypeOf, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import { type Access, type Admit, type FixedModelRequest } from '@omne-harness/model-contract'
import {
  judgeAdmit,
  judgeFixedModelRequest,
  MODEL_INPUT_LIMITS,
  type ModelAdmitCandidate,
  type ModelInputRejection,
} from '@omne-harness/model-contract/provider'
import { admission } from './scripted-support.ts'

it('keeps Access authority typed while accepting unknown payload', () => {
  type Principal = { readonly credential: () => void }
  expectTypeOf<ModelAdmitCandidate<Principal>>().toExtend<Access<Principal>>()
  expectTypeOf<ModelAdmitCandidate<Principal>['request']>().toBeUnknown()
  expectTypeOf(judgeAdmit<Principal>).returns.toEqualTypeOf<
    Outcome<Admit<Principal>, ModelInputRejection>
  >()
  expectTypeOf(judgeFixedModelRequest).parameter(0).toBeUnknown()
  expectTypeOf(judgeFixedModelRequest).returns.toEqualTypeOf<
    Outcome<FixedModelRequest, ModelInputRejection>
  >()
  expectTypeOf(MODEL_INPUT_LIMITS.maxNodes).toBeNumber()
  const unknownRoot: unknown = admission('unknown')
  // @ts-expect-error unknown cannot establish this Principal or minted tenant
  judgeAdmit<Principal>(unknownRoot)
  // @ts-expect-error a string credential does not establish the expected Access
  judgeAdmit<Principal>(admission('wrong-principal'))
})
