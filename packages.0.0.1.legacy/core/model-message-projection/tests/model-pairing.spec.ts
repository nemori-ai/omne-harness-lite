import { expect, it } from 'vitest'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import { copyJsonValue, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import {
  checkAppendInput,
  checkSourceToken,
  messageLogPayload,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import {
  projectMessages,
  materializeMessages,
  type ProjectionRules,
} from '@omne-harness-lite/model-message-projection'
const parsedTenant = parseTenantId({ organization: 'pair-org', account: 'pair-account' })
if (!('ok' in parsedTenant)) throw new Error('pair tenant')
const tenant = parsedTenant.ok,
  session = 'pair-session'
const at = '2026-10-07T00:00:00Z'
const visibility = { toHuman: true, toModel: true }
const rules: ProjectionRules = {
  version: 'pair-1',
  external: null,
  system: [],
  pendingCardBlocks: [],
  lastModelRequestPrefixLength: 0,
}
const adaptation = {
  implementation: { name: 'pairing-test', revision: '1' },
  definition: { modelId: 'pair/model', revision: '1' },
  configuration: { revision: '1', values: {} },
}
const profile = { origin: 'official', routeName: 'pair/model' }
const snapshot = {
  adaptation,
  providers: ['pair-provider'],
  allowFallback: false,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 4096,
  maxOutputTokens: 100,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  updatedAt: at,
}
function batch(offset = 0, tool = false): readonly LogEntry[] {
  const id = `response-${offset}`,
    run = 'pair-run',
    attempt = 1
  const reply = {
    id: `assistant-${offset}`,
    type: 'assistant',
    response: id,
    ending: 'complete',
    createdAt: at,
    blocks: tool
      ? [
          {
            id: `call-block-${offset}`,
            kind: 'tool_call',
            complete: true,
            callId: 'tool-call',
            tool: 'test_tool',
            arguments: {},
            visibility,
          },
        ]
      : [
          { id: `visible-${offset}`, kind: 'text', text: 'visible', visibility },
          {
            id: `hidden-${offset}`,
            kind: 'text',
            text: 'private',
            visibility: { toHuman: true, toModel: false },
          },
        ],
  }
  const original = {
    id,
    call: { callId: `model-call-${offset}`, runId: run },
    attemptId: attempt,
    dispatch: 1,
    route: {
      adaptation,
      profile,
      profileSnapshot: snapshot,
      provider: 'pair-provider',
      selectedBy: 'session',
      credentialScope: { layer: 'factory' },
      parameters: {},
    },
    outcome: 'complete',
    reply,
    replyDisposition: 'persisted',
    timing: { sentAt: at, firstTokenAt: at, endedAt: at },
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_read_tokens: 'unknown',
      cache_write_tokens: 'unknown',
      source: 'upstream',
    },
    cost: { cost_usd: 'unknown', source: 'none' },
    inputCalibration: {
      requestInput: { kind: 'unavailable', reason: 'not_retained' },
      observedInput: { kind: 'unavailable', reason: 'missing_usage' },
      outputGroup: { kind: 'unavailable', reason: 'not_retained' },
    },
  }
  const response = captureModelLogValue({
    category: 'response',
    input: { kind: 'value', value: original },
  })
  const message = captureModelLogValue({
    category: 'message',
    input: { kind: 'value', value: reply },
  })
  if (!('ok' in response) || !('ok' in message))
    throw new Error(`pairing fixture rejected ${JSON.stringify(response)}`)
  return [message.ok, response.ok].map((captured, index) => {
    const prepared = prepareModelLogEntry({
      session,
      shell: { tenant, run, attempt },
      captured,
      purpose:
        index === 0 ? { kind: 'persistedMessage', response: response.ok } : { kind: 'response' },
      messagePrefix: [],
    })
    if (!('ok' in prepared)) throw new Error('pairing entry fixture')
    const located = checkAppendInput(
      session,
      [prepared.ok],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in located) throw new Error('pairing entry boundary')
    return { ...located.ok.entries[0]!, session: located.ok.session, position: offset + index + 1 }
  })
}
function encoded(value: unknown): string {
  const copied = copyJsonValue(value)
  if ('failed' in copied) throw new Error('fixture JSON')
  return writeJsonLossless(copied.ok)
}
function project(entries: readonly LogEntry[]) {
  const checked = checkSourceToken({
    tenant,
    session,
    journalGeneration: 'pair-generation',
    tail: entries.length,
  })
  if ('failure' in checked) throw new Error('pair source')
  return projectMessages({ source: checked.ok, entries, rules })
}
it('validates the real [message,response] order before selection and preserves the original reply', () => {
  const entries = batch(),
    original = encoded(entries)
  const result = project(entries)
  expect(result).toHaveProperty('projected')
  if (!('projected' in result)) throw new Error(JSON.stringify(result))
  const output = materializeMessages(result.projected)
  if (!('materialized' in output)) throw new Error('materialize')
  expect(output.materialized).toHaveLength(1)
  expect(output.materialized[0]?.blocks.map(block => block.id)).toEqual(['visible-0'])
  expect(output.sources[0]).toEqual({
    messageId: 'assistant-0',
    position: 1,
    blockIds: ['visible-0'],
  })
  expect(encoded(entries)).toBe(original)
})
it('missing original response and a reply from another Run cannot become a successful projection', () => {
  const entries = batch()
  expect(project([entries[0]!])).toEqual({ unavailable: true, reason: 'requiredSource' })
  expect(project([entries[0]!, { ...entries[1]!, run: 'another-run' }])).toEqual({
    invalidInput: true,
    reason: 'claimedPayload',
  })
  const copied = copyJsonValue(entries[1]!.payload)
  if (
    'failed' in copied ||
    copied.ok === null ||
    typeof copied.ok !== 'object' ||
    !('value' in copied.ok)
  )
    throw new Error('owned response payload')
  const payload = copied.ok as { value: { value: { reply: { blocks: { text?: string }[] } } } }
  const changed = {
    ...payload,
    value: {
      ...payload.value,
      value: {
        ...payload.value.value,
        reply: {
          ...payload.value.value.reply,
          blocks: payload.value.value.reply.blocks.map((block, index) =>
            index === 0 ? { ...block, text: 'altered original' } : block,
          ),
        },
      },
    },
  }
  expect(project([entries[0]!, { ...entries[1]!, payload: changed }])).toEqual({
    invalidInput: true,
    reason: 'pairing',
  })
})
it('tool returns pair with a preceding complete call in the same Run and attempt', () => {
  const entries = batch(0, true)
  const tool = judgeMessage({
    id: 'tool-message',
    type: 'tool',
    callId: 'tool-call',
    createdAt: at,
    blocks: [
      {
        id: 'tool-result',
        kind: 'tool_result',
        callId: 'tool-call',
        outcome: 'completed',
        blocks: [{ id: 'tool-text', kind: 'text', text: 'result', visibility }],
        visibility,
      },
    ],
  })
  if ('rejected' in tool) throw new Error('tool fixture')
  const checked = checkAppendInput(
    session,
    [{ tenant, run: 'pair-run', attempt: 1, readKeys: [], payload: messageLogPayload(tool.ok) }],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked) throw new Error('tool entry fixture')
  const entry = { ...checked.ok.entries[0]!, session: checked.ok.session, position: 3 }
  expect(project([...entries, entry])).toHaveProperty('projected')
  expect(project([...entries, { ...entry, attempt: 2 }])).toEqual({
    invalidInput: true,
    reason: 'pairing',
  })
  expect(project([...entries, { ...entry, run: 'another-run' }])).toEqual({
    invalidInput: true,
    reason: 'pairing',
  })
  expect(project([...entries, ...batch(2, true)])).toEqual({
    invalidInput: true,
    reason: 'pairing',
  })
})
