import { expectTypeOf, test } from 'vitest'
import type {
  NonConnectorAssetContent,
  NonConnectorBodyContracts,
  EvaluationResult,
} from '@omne-harness-lite/asset-evaluation'
import type {
  ToolCallBlock,
  IncompleteToolCallBlock,
  BlockId,
  CallId,
  JsonNumber,
} from '@omne-harness-lite/content-blocks'
import type { ArrivalEnvelope, FinishEvent } from '@omne-harness-lite/arrival-events'
import type { AssistantMessage, ToolInternalMessage } from '@omne-harness-lite/messages'
import type { Failure, ModelResponse } from '@omne-harness-lite/model-response'

test('w6.types.nonconnector-and-readonly-evaluation-boundaries', () => {
  expectTypeOf<Extract<NonConnectorAssetContent, { category: 'connector' }>>().toBeNever()
  const consume = (bodies: NonConnectorBodyContracts, result: EvaluationResult) => {
    expectTypeOf(bodies.connector).toEqualTypeOf<undefined>()
    // @ts-expect-error sixth actual Connector provider is explicitly outside the current type surface
    const invalid: NonConnectorBodyContracts = { ...bodies, connector: bodies.tool }
    expectTypeOf(invalid).toBeObject()
    if ('ok' in result) {
      // @ts-expect-error computation output is a readonly snapshot, not writable shared state
      result.ok.assets.push({})
    }
  }
  expectTypeOf(consume).toBeFunction()
})

test('w6.types.complete-incomplete-and-frame-separation', () => {
  expectTypeOf<IncompleteToolCallBlock>().not.toExtend<ToolCallBlock>()
  expectTypeOf<BlockId>().not.toExtend<CallId>()
  expectTypeOf<CallId>().not.toExtend<BlockId>()
  expectTypeOf<Extract<AssistantMessage, { ending: 'complete' }>['blocks'][number]>()
    .extract<{ kind: 'tool_call'; complete: false }>()
    .toBeNever()
  expectTypeOf<
    ToolInternalMessage['blocks'][number]['visibility']['toModel']
  >().toEqualTypeOf<false>()
  expectTypeOf<Extract<ArrivalEnvelope, { target: { kind: 'tool_execution' } }>['event']>()
    .extract<{ t: 'account' }>()
    .toBeNever()
  expectTypeOf<
    Extract<FinishEvent, { reason: 'end' | 'max_tokens' | 'interrupted' }>['error']
  >().toEqualTypeOf<undefined>()
})

test('w6.types.response-inband-and-failure-shape', () => {
  expectTypeOf<
    Extract<ModelResponse, { outcome: 'complete' }>['failure']
  >().toEqualTypeOf<undefined>()
  expectTypeOf<Extract<Failure, { inBand: true }>['statusCode']>().toEqualTypeOf<JsonNumber>()
  expectTypeOf<
    Extract<ModelResponse, { outcome: 'complete' }>['reply']['ending']
  >().toEqualTypeOf<'complete'>()
})
