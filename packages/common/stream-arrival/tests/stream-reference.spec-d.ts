import { expectTypeOf, test } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeStreamId,
  decodeStreamPosition,
  type StreamCursor,
  type StreamCursorParts,
  type StreamEnvelope,
  type StreamId,
  type StreamPosition,
  type StreamRef,
  type StreamValueRejection,
} from '@omne-harness/stream-arrival'

test('stream brands cannot be interchanged or replaced by bare text', () => {
  expectTypeOf<string>().not.toExtend<StreamId>()
  expectTypeOf<string>().not.toExtend<StreamPosition>()
  expectTypeOf<string>().not.toExtend<StreamRef>()
  expectTypeOf<string>().not.toExtend<StreamCursor>()
  expectTypeOf<StreamId>().not.toExtend<StreamPosition | StreamRef | StreamCursor>()
  expectTypeOf<StreamPosition>().not.toExtend<StreamId | StreamRef | StreamCursor>()
  expectTypeOf<StreamRef>().not.toExtend<StreamId | StreamPosition | StreamCursor>()
  expectTypeOf<StreamCursor>().not.toExtend<StreamId | StreamPosition | StreamRef>()
  expectTypeOf(decodeStreamId).returns.toEqualTypeOf<Outcome<StreamId, StreamValueRejection>>()
  expectTypeOf(decodeStreamPosition).returns.toEqualTypeOf<
    Outcome<StreamPosition, StreamValueRejection>
  >()
})

test('read records keep readonly values and their distinct brands', () => {
  expectTypeOf<StreamEnvelope>().toEqualTypeOf<
    Readonly<{
      producer: 'model' | 'tool'
      call: string
      stream: StreamId
    }>
  >()
  expectTypeOf<StreamCursorParts>().toEqualTypeOf<
    Readonly<{
      ref: StreamRef
      position: StreamPosition
    }>
  >()
})
