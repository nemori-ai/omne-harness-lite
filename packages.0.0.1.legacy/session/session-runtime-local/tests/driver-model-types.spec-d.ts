import { expectTypeOf } from 'vitest'
import type {
  ModelRuntimeHostInputs,
  ModelRuntimeOperations,
  ModelRuntimeHostLease,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionDriverModelBorrow, SessionDriverModelFactory } from '../src/index.ts'

expectTypeOf<keyof SessionDriverModelBorrow>().toEqualTypeOf<'operations' | 'release'>()
expectTypeOf<SessionDriverModelBorrow['operations']>().toEqualTypeOf<ModelRuntimeOperations>()
expectTypeOf<SessionDriverModelBorrow['release']>().toEqualTypeOf<() => Promise<void>>()
expectTypeOf<Parameters<SessionDriverModelFactory['acquire']>>().toEqualTypeOf<
  [ModelRuntimeHostInputs]
>()
expectTypeOf<Awaited<ReturnType<SessionDriverModelFactory['acquire']>>>().toEqualTypeOf<
  SessionDriverModelBorrow | { readonly unavailable: true }
>()
declare const operations: ModelRuntimeOperations
declare const lease: ModelRuntimeHostLease
// @ts-expect-error Returning operations alone does not return their binding resources.
const missingReturn: SessionDriverModelBorrow = { operations }
// @ts-expect-error An input capture lease cannot replace the assembly borrow.
const captureIsNotBorrow: SessionDriverModelBorrow = lease
// @ts-expect-error Assembly release must complete asynchronously, not pretend immediate closure.
const immediateReturn: SessionDriverModelBorrow = { operations, release: () => {} }
void [missingReturn, captureIsNotBorrow, immediateReturn]
