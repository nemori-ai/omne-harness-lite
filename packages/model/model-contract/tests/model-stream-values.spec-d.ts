import { expectTypeOf, test } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  Snapshot,
  DispatchId,
  Revision,
  OutputCursor,
  CallState,
  VisibleBlock,
} from '@omne-harness/model-contract'
import type { StreamRef } from '@omne-harness/stream-arrival'
import {
  applyModelStreamDelta,
  diffModelStream,
  type ModelStreamBase,
  type ModelStreamDelta,
  type ModelStreamSnapshot,
  type ModelStreamProjectionFailure,
} from '@omne-harness/model-contract'

test('projection inputs retain full reference, dispatch and both baseline coordinates', () => {
  expectTypeOf<ModelStreamSnapshot>().toEqualTypeOf<
    Readonly<{ ref: StreamRef; dispatch: DispatchId; value: Snapshot }>
  >()
  expectTypeOf<ModelStreamBase>().toEqualTypeOf<
    Readonly<{ outputCursor: OutputCursor; revision: Revision }>
  >()
  expectTypeOf<ModelStreamDelta>().toEqualTypeOf<
    Readonly<{
      ref: StreamRef
      dispatch: DispatchId
      from: ModelStreamBase
      outputCursor: OutputCursor
      state: CallState
      blocks: readonly VisibleBlock[]
    }>
  >()
  expectTypeOf<Omit<ModelStreamDelta, 'ref'>>().not.toExtend<ModelStreamDelta>()
  expectTypeOf<Omit<ModelStreamDelta, 'dispatch'>>().not.toExtend<ModelStreamDelta>()
  expectTypeOf<Omit<ModelStreamDelta, 'from'>>().not.toExtend<ModelStreamDelta>()
  expectTypeOf(diffModelStream)
    .parameter(0)
    .toEqualTypeOf<
      Readonly<{ tenant: TenantId; before: ModelStreamSnapshot; after: ModelStreamSnapshot }>
    >()
  expectTypeOf(diffModelStream).returns.toEqualTypeOf<
    Outcome<ModelStreamDelta, ModelStreamProjectionFailure>
  >()
  expectTypeOf(applyModelStreamDelta)
    .parameter(0)
    .toEqualTypeOf<
      Readonly<{ tenant: TenantId; before: ModelStreamSnapshot; delta: ModelStreamDelta }>
    >()
  expectTypeOf(applyModelStreamDelta).returns.toEqualTypeOf<
    Outcome<ModelStreamSnapshot, ModelStreamProjectionFailure>
  >()
})
