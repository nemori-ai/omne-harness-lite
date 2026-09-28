import { expectTypeOf, it } from 'vitest'
import type {
  ModelResponse,
  PendingModelResponse,
  RawHeaders,
  ReplyDisposition,
} from '@omne-harness-lite/model-response'

it('keeps pending facts distinct from an already persisted reply', () => {
  expectTypeOf<PendingModelResponse['outcome']>().toEqualTypeOf<
    'complete' | 'truncated' | 'interrupted'
  >()
  expectTypeOf<PendingModelResponse['replyDisposition']>().toEqualTypeOf<undefined>()
  expectTypeOf<PendingModelResponse['late']>().toEqualTypeOf<undefined>()
  expectTypeOf<PendingModelResponse['failure']>().toEqualTypeOf<undefined>()
  expectTypeOf<PendingModelResponse['delivered']>().toEqualTypeOf<undefined>()
  expectTypeOf<ModelResponse['replyDisposition']>().toEqualTypeOf<ReplyDisposition | undefined>()
})

it('preserves raw ordered multi-value headers', () => {
  const headers: RawHeaders = { 'x-test': ['one', 'one', ''], 'x-empty': [] }
  expectTypeOf(headers).toExtend<RawHeaders>()
  // @ts-expect-error raw header values do not accept numbers
  const invalid: RawHeaders = { 'x-test': 42 }
  expectTypeOf(invalid).toExtend<RawHeaders>()
})
