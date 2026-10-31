import { expectTypeOf, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import {
  encodeModelInvocationRef,
  decodeModelInvocationRef,
  resolveModelInvocationRef,
  type ModelInvocationRef,
  type ModelInvocationParts,
  type ModelReferenceRejection,
  type ModelReferenceFailure,
  type CallAccess,
  type LiveRoute,
  type Reply,
} from '@omne-harness/model-contract'
import {
  encodeModelOperationRef,
  decodeModelOperationRef,
  resolveModelOperationRef,
  type ModelOperationRef,
  type ModelOperationParts,
  type ModelInstanceDirectory,
} from '@omne-harness/model-contract/provider'
it('keeps the two reference brands and their bounded parsing results distinct', () => {
  expectTypeOf(encodeModelInvocationRef).parameter(0).toEqualTypeOf<ModelInvocationParts>()
  expectTypeOf(encodeModelOperationRef).parameter(0).toEqualTypeOf<ModelOperationParts>()
  expectTypeOf(decodeModelInvocationRef).returns.toEqualTypeOf<
    Outcome<ModelInvocationRef, ModelReferenceRejection>
  >()
  expectTypeOf(decodeModelOperationRef).returns.toEqualTypeOf<
    Outcome<ModelOperationRef, ModelReferenceRejection>
  >()
  expectTypeOf(resolveModelInvocationRef).returns.toEqualTypeOf<
    Outcome<ModelInvocationParts, ModelReferenceFailure>
  >()
  expectTypeOf(resolveModelOperationRef).returns.toEqualTypeOf<
    Outcome<ModelOperationParts, ModelReferenceFailure>
  >()
  expectTypeOf<ModelInvocationRef>().not.toEqualTypeOf<ModelOperationRef>()
  expectTypeOf<ModelInstanceDirectory<string>['connect']>()
    .parameter(0)
    .toEqualTypeOf<CallAccess<string>>()
  expectTypeOf<ModelInstanceDirectory<string>['connect']>().returns.toEqualTypeOf<
    Reply<LiveRoute<string>>
  >()
})
