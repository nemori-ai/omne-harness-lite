import { expectTypeOf, test } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeModelOutputV1,
  encodeModelOutputV1,
  type CallState,
  type ModelOutputV1,
  type ModelOutputV1Delta,
  type ModelOutputV1Failure,
  type ModelOutputV1Snapshot,
  type ModelStreamDelta,
  type ModelStreamSnapshot,
  type OutputCursor,
  type Revision,
  type VisibleBlock,
} from '@omne-harness/model-contract'

declare const snapshot: ModelOutputV1Snapshot
declare const internalSnapshot: ModelStreamSnapshot
declare const delta: ModelStreamDelta
declare const basePhase: CallState['phase']

test('JSON projections retain Model cursor brands and only the adopted display fields', () => {
  expectTypeOf<ModelOutputV1>().toEqualTypeOf<ModelOutputV1Snapshot | ModelOutputV1Delta>()
  expectTypeOf<keyof ModelOutputV1Snapshot>().toEqualTypeOf<
    'projection' | 'phase' | 'cursor' | 'revision' | 'blocks'
  >()
  expectTypeOf<keyof ModelOutputV1Delta>().toEqualTypeOf<
    'projection' | 'base' | 'cursor' | 'revision' | 'phase' | 'blocks'
  >()
  expectTypeOf<ModelOutputV1Snapshot['projection']>().toEqualTypeOf<'model-output-v1'>()
  expectTypeOf<ModelOutputV1Snapshot['cursor']>().toEqualTypeOf<OutputCursor>()
  expectTypeOf<ModelOutputV1Snapshot['revision']>().toEqualTypeOf<Revision>()
  expectTypeOf<ModelOutputV1Snapshot['blocks']>().toEqualTypeOf<readonly VisibleBlock[]>()
  expectTypeOf<ModelOutputV1Delta['base']>().toEqualTypeOf<
    Readonly<{ cursor: OutputCursor; revision: Revision }>
  >()
  expectTypeOf<ModelOutputV1Delta['phase']>().toEqualTypeOf<CallState['phase'] | undefined>()
  expectTypeOf<ModelOutputV1Delta>().not.toExtend<ModelStreamDelta>()
})

test('codecs return projection outcomes and require a phase for internal deltas', () => {
  expectTypeOf(decodeModelOutputV1).parameter(0).toEqualTypeOf<unknown>()
  expectTypeOf(decodeModelOutputV1).returns.toEqualTypeOf<
    Outcome<ModelOutputV1, ModelOutputV1Failure>
  >()
  expectTypeOf(encodeModelOutputV1(snapshot)).toEqualTypeOf<Outcome<string, ModelOutputV1Failure>>()
  expectTypeOf(encodeModelOutputV1(internalSnapshot)).toEqualTypeOf<
    Outcome<string, ModelOutputV1Failure>
  >()
  expectTypeOf(encodeModelOutputV1(delta, basePhase)).toEqualTypeOf<
    Outcome<string, ModelOutputV1Failure>
  >()
  // @ts-expect-error An internal delta cannot infer its baseline phase.
  encodeModelOutputV1(delta)
  // @ts-expect-error The baseline phase must be a Model phase.
  encodeModelOutputV1(delta, 'unknown')
})
