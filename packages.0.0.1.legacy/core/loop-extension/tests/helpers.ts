import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'

export const at = '2026-09-23T10:00:00Z'
export const adaptation = {
  implementation: { name: 'vendor-a.family', revision: '1' },
  definition: { modelId: 'vendor-a/chat-large', revision: '1' },
  configuration: { revision: '1', values: {} },
}
export const profile: JsonObject = {
  providers: ['provider-a', 'provider-b'],
  allowFallback: true,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 200000,
  maxOutputTokens: 64000,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  adaptation,
  updatedAt: at,
}
export const dispatch: JsonObject = {
  adaptation,
  kind: 'model_call_dispatched',
  call: 'mc_01',
  dispatch: 1,
  provider: 'provider-a',
  response: 'rsp_01',
  profile: { origin: 'official', routeName: 'vendor-a/chat-large' },
  profileSnapshot: profile,
  parameters: {},
  selectedBy: 'session',
  credentialScope: { layer: 'factory' },
}
export const visibility = { toHuman: true, toModel: true }
export const call: JsonObject = {
  id: 'blk_1',
  kind: 'tool_call',
  complete: true,
  callId: 'call_01',
  tool: 'shell',
  arguments: { command: 'echo hi' },
  visibility,
}
export const result: JsonObject = {
  id: 'result_1',
  kind: 'tool_result',
  callId: 'call_01',
  outcome: 'completed',
  blocks: [],
  visibility,
}
export const user: JsonObject = { id: 'msg_1', type: 'user', blocks: [], createdAt: at }
export const assistant: JsonObject = {
  id: 'msg_2',
  type: 'assistant',
  response: 'rsp_01',
  ending: 'complete',
  blocks: [],
  createdAt: at,
}
export const reminder: JsonObject = {
  id: 'msg_9',
  type: 'system_reminder',
  blocks: [],
  createdAt: at,
  nature: 'event',
  source: { kind: 'extension', extension: 'g' },
}
export const variants: readonly {
  readonly position: string
  readonly dimension?: JsonObject
  readonly subject: JsonObject
  readonly callId?: string
  readonly modelCallId?: string
  readonly mask: string
}[] = [
  { position: 'attempt_started', subject: { attempt: 1 }, mask: '11000101' },
  {
    position: 'before_persist_message',
    subject: { message: user, producer: 'user' },
    mask: '11101000',
  },
  { position: 'after_persist_message', subject: { message: user }, mask: '11000101' },
  { position: 'before_compaction', subject: { plan: {} }, mask: '11001101' },
  {
    position: 'after_compaction',
    subject: {
      compaction: {
        id: 'comp_1',
        type: 'compaction',
        blocks: [],
        silenced: [{ messageId: 'old_msg', blockId: 'old_blk' }],
        createdAt: at,
      },
    },
    mask: '11000101',
  },
  {
    position: 'before_model_call',
    subject: {
      request: { target: 'vendor-a/chat-large', parameters: {}, messages: [], tools: [] },
    },
    mask: '11111101',
  },
  {
    position: 'after_model_call',
    dimension: { ending: 'complete_reply' },
    subject: {
      reply: assistant,
      usage: {
        input_tokens: 'unknown',
        output_tokens: 'unknown',
        cache_read_tokens: 'unknown',
        cache_write_tokens: 'unknown',
        source: 'none',
      },
      cost: { cost_usd: 'unknown', source: 'none' },
    },
    mask: '11000101',
  },
  {
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    subject: {
      failure: 'upstream_unavailable',
      profile,
      dispatches: [dispatch],
      retryConclusions: [],
    },
    modelCallId: 'mc_01',
    mask: '11000111',
  },
  {
    position: 'before_action',
    subject: { call, definition: { name: 'shell' }, batch: ['call_01'] },
    callId: 'call_01',
    mask: '11101101',
  },
  {
    position: 'after_action',
    dimension: { scope: 'each' },
    subject: { callId: 'call_01', outcome: 'completed', result },
    callId: 'call_01',
    mask: '11100101',
  },
  {
    position: 'after_action',
    dimension: { scope: 'batch' },
    subject: { outcomes: [{ callId: 'call_01', outcome: 'completed' }] },
    mask: '11000101',
  },
  { position: 'before_terminal', subject: { proposed: { state: 'completed' } }, mask: '11001101' },
  { position: 'after_terminal', subject: { terminal: { state: 'completed' } }, mask: '10000000' },
]
export function inputAt(variant: (typeof variants)[number]): JsonObject {
  return {
    position: variant.position,
    ...(variant.dimension === undefined ? {} : { dimension: variant.dimension }),
    ...(variant.position === 'before_persist_message' ? {} : { run: 'run_1', attempt: 1 }),
    subject: variant.subject,
    earlier: [],
    log: 'log_1',
    environment: 'env_1',
  }
}
export function outputsAt(variant: (typeof variants)[number]): readonly JsonObject[] {
  return [
    { kind: 'observed' },
    { kind: 'inject', message: reminder },
    { kind: 'rewrite', subject: variant.subject },
    { kind: 'select_model', profile: 'vendor-a/chat-large' },
    { kind: 'veto', reason: 'x' },
    { kind: 'stop', reason: 'x' },
    { kind: 'retry', plan: { provider: 'provider-b' } },
    {
      kind: 'ask',
      card: {
        explanation: 'x',
        options: [{ id: 'yes', label: 'yes' }],
        about: {
          position: variant.position,
          ...(variant.callId === undefined ? {} : { callId: variant.callId }),
        },
      },
    },
  ]
}
export function recordAt(
  variant: (typeof variants)[number],
  power: string,
  output: JsonObject,
): JsonObject {
  return {
    extension: 'g',
    position: variant.position,
    ...(variant.dimension === undefined ? {} : { dimension: variant.dimension }),
    ...(variant.callId === undefined ? {} : { callId: variant.callId }),
    ...(variant.modelCallId === undefined ? {} : { modelCallId: variant.modelCallId }),
    power,
    output,
    at,
  }
}
export function json(text: string): JsonValue {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new Error('test JSON invalid')
  return parsed.ok
}
