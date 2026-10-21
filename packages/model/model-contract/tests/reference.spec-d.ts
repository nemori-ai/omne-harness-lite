import { expectTypeOf, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import {
  encodeModelInvocationRef,
  encodeModelOperationRef,
  decodeModelInvocationRef,
  decodeModelOperationRef,
  resolveModelInvocationRef,
  resolveModelOperationRef,
  type ModelInvocationRef,
  type ModelOperationRef,
  type ModelInvocationParts,
  type ModelOperationParts,
  type ModelReferenceRejection,
  type ModelReferenceFailure,
  type ModelInstanceDirectory,
  type CallAccess,
  type LiveRoute,
  type Reply,
} from '@omne-harness/model-contract'
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
