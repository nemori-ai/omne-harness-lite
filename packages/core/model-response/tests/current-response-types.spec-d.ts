import { expectTypeOf, it } from 'vitest'
import type {
  ModelResponse,
  PendingModelResponse,
  RawHeaders,
  ReplyDisposition,
  Timing,
} from '@omne-harness-lite/model-response'

declare const pending: PendingModelResponse

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

it('MR10 exposes nullable generic timing but keeps actual sent time in ordinary and pending replies', () => {
  expectTypeOf<Timing['sentAt']>().toEqualTypeOf<string | null>()
  expectTypeOf<
    Extract<ModelResponse, { readonly outcome: 'complete' }>['timing']['sentAt']
  >().toEqualTypeOf<string>()
  expectTypeOf<
    Extract<ModelResponse, { readonly outcome: 'truncated' }>['timing']['sentAt']
  >().toEqualTypeOf<string>()
  expectTypeOf<
    Extract<ModelResponse, { readonly outcome: 'failed' }>['timing']['sentAt']
  >().toEqualTypeOf<string>()
  expectTypeOf<
    Extract<ModelResponse, { readonly outcome: 'interrupted' }>['timing']['sentAt']
  >().toEqualTypeOf<string | null>()
  expectTypeOf<PendingModelResponse['timing']['sentAt']>().toEqualTypeOf<string>()
  const pendingNull: PendingModelResponse = {
    ...pending,
    // @ts-expect-error Pending requires an actual send time even for interrupted replies
    timing: { ...pending.timing, sentAt: null },
  }
  expectTypeOf(pendingNull).toExtend<PendingModelResponse>()
})

it('preserves raw ordered multi-value headers', () => {
  const headers: RawHeaders = { 'x-test': ['one', 'one', ''], 'x-empty': [] }
  expectTypeOf(headers).toExtend<RawHeaders>()
  // @ts-expect-error raw header values do not accept numbers
  const invalid: RawHeaders = { 'x-test': 42 }
  expectTypeOf(invalid).toExtend<RawHeaders>()
})
