import { expectTypeOf, test } from 'vitest'
import type { JsonNumber, CallId } from '@omne-harness-lite/content-blocks'
import type { Usage, Cost } from '@omne-harness-lite/call-accounts'
import type { FailureCause } from '@omne-harness-lite/loop-extension'
import {
  reduceFills,
  type AccountEvent,
  type ArrivalTarget,
  type ArrivalError,
  type ReductionMode,
  type OpenEvent,
  type OpenBlock,
  type WholeFillBlock,
  type ArrivalEnvelope,
} from '../src/index.ts'

declare const callId: CallId

test('public number, account, identity and failure types reuse their owners', () => {
  expectTypeOf<
    Extract<ArrivalTarget, { kind: 'model_call' }>['dispatch']
  >().toEqualTypeOf<JsonNumber>()
  expectTypeOf<
    Extract<ArrivalTarget, { kind: 'tool_execution' }>['callId']
  >().toEqualTypeOf<CallId>()
  expectTypeOf<AccountEvent['usage']>().toEqualTypeOf<Usage>()
  expectTypeOf<AccountEvent['cost']>().toEqualTypeOf<Cost>()
  expectTypeOf<ArrivalError['cause']>().toEqualTypeOf<FailureCause>()
  expectTypeOf<OpenBlock>().toEqualTypeOf<(index: JsonNumber) => OpenEvent | undefined>()
  expectTypeOf<ReturnType<typeof reduceFills>>().toEqualTypeOf<
    string | WholeFillBlock | undefined
  >()
})
test('frame envelope excludes the frozen Schema forbidden event combinations', () => {
  // @ts-expect-error S-23 frame streams have no account event
  const account: ArrivalEnvelope = {
    target: { kind: 'tool_execution', callId },
    event: {
      t: 'account',
      usage: {
        input_tokens: 'unknown',
        output_tokens: 'unknown',
        cache_read_tokens: 'unknown',
        cache_write_tokens: 'unknown',
        source: 'none',
      },
      cost: { cost_usd: 'unknown', source: 'none' },
    },
  }
  // @ts-expect-error S-23 frame streams cannot max_tokens finish
  const ending: ArrivalEnvelope = {
    target: { kind: 'tool_execution', callId },
    event: { t: 'finish', reason: 'max_tokens' },
  }
  // @ts-expect-error S-23 frame streams cannot finish with error
  const error: ArrivalEnvelope = {
    target: { kind: 'tool_execution', callId },
    event: { t: 'finish', reason: 'lost', error: { cause: 'unrecognized' } },
  }
  expectTypeOf(account).toMatchTypeOf<ArrivalEnvelope>()
  expectTypeOf(ending).toMatchTypeOf<ArrivalEnvelope>()
  expectTypeOf(error).toMatchTypeOf<ArrivalEnvelope>()
})
test('whole block append, raw call identity and in-band missing code cannot typecheck', () => {
  // @ts-expect-error S-8 only replace can open whole blocks
  const mode: ReductionMode = { kind: 'image', fill: 'append' }
  // @ts-expect-error CallId has an owner brand
  const target: ArrivalTarget = { kind: 'tool_execution', callId: 'unvalidated' }
  // @ts-expect-error S-16 inBand requires a statusCode
  const error: ArrivalError = { cause: 'unrecognized', inBand: true }
  expectTypeOf(mode).toMatchTypeOf<ReductionMode>()
  expectTypeOf(target).toMatchTypeOf<ArrivalTarget>()
  expectTypeOf(error).toMatchTypeOf<ArrivalError>()
})
