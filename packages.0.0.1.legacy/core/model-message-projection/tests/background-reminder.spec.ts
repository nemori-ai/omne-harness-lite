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
type Ending = 'finished' | 'interrupted'
const endings: readonly Ending[] = ['finished', 'interrupted']
const prefixes = new Map<string, readonly LogEntry[]>()
function prefix(callId = 'call-a'): readonly LogEntry[] {
  const cached = prefixes.get(callId)
  if (cached !== undefined) return cached
  const id = `response-${callId}`,
    run = 'pair-run',
    attempt = 1
  const reply = {
    id: `assistant-${callId}`,
    type: 'assistant',
    response: id,
    ending: 'complete',
    createdAt: at,
    blocks: [
      {
        id: `call-block-${callId}`,
        kind: 'tool_call',
        complete: true,
        callId,
        tool: 'test_tool',
        arguments: {},
        visibility,
      },
    ],
  }
  const original = {
    id,
    call: { callId: `model-call-${callId}`, runId: run },
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
  const entries = [message.ok, response.ok].map((captured, index) => {
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
    const [entry] = located.ok.entries
    if (entry === undefined) throw new Error('missing model entry')
    return Object.freeze({ ...entry, session: located.ok.session, position: index + 1 })
  })
  const frozen = Object.freeze(entries)
  prefixes.set(callId, frozen)
  return frozen
}

function encoded(value: unknown): string {
  const copied = copyJsonValue(value)
  if ('failed' in copied) throw new Error('fixture JSON')
  return writeJsonLossless(copied.ok)
}
const fences = {
  same: { run: 'pair-run', attempt: 1 },
  wrongRun: { run: 'another-run', attempt: 1 },
  nextAttempt: { run: 'pair-run', attempt: 2 },
  absent: {},
}
function messageEntry(value: unknown, fence: keyof typeof fences = 'same'): LogEntry {
  const message = judgeMessage(value)
  if ('rejected' in message) throw new Error(`message fixture rejected ${encoded(message)}`)
  const checked = checkAppendInput(
    session,
    [{ tenant, ...fences[fence], readKeys: [], payload: messageLogPayload(message.ok) }],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked) throw new Error(`entry fixture rejected ${encoded(checked)}`)
  const [entry] = checked.ok.entries
  if (entry === undefined) throw new Error('missing message entry')
  return { ...entry, session: checked.ok.session, position: 1 }
}
function placeholder(callId = 'call-a', outcome: 'backgrounded' | 'completed' = 'backgrounded') {
  return messageEntry({
    id: `placeholder-${callId}`,
    type: 'tool',
    callId,
    createdAt: at,
    blocks: [
      {
        id: `placeholder-result-${callId}`,
        kind: 'tool_result',
        callId,
        outcome,
        ...(outcome === 'backgrounded'
          ? { reason: { code: 'backgrounded_auto', text: 'running' } }
          : {}),
        blocks: [],
        visibility,
      },
    ],
  })
}
function reminder(
  ending: Ending,
  {
    callId = 'call-a',
    id = `ending-${ending}`,
    fence = 'same',
  }: {
    callId?: string
    id?: string
    fence?: keyof typeof fences
  } = {},
) {
  const completion =
    ending === 'finished'
      ? {
          source: { kind: 'background_execution_finished', callId, outcome: 'completed' },
          result: { outcome: 'completed' },
        }
      : {
          source: { kind: 'background_execution_interrupted', callId },
          result: {
            outcome: 'failed',
            reason: { code: 'abnormal_interruption', text: 'execution lost' },
          },
        }
  return messageEntry(
    {
      id,
      type: 'system_reminder',
      nature: 'event',
      source: completion.source,
      createdAt: at,
      blocks: [
        {
          id: `${id}-result`,
          kind: 'tool_result',
          callId,
          ...completion.result,
          blocks: [],
          visibility,
        },
      ],
    },
    fence,
  )
}
function input(rows: readonly LogEntry[]) {
  const source = checkSourceToken({
    tenant,
    session,
    journalGeneration: 'pair-generation',
    tail: rows.length,
  })
  if ('failure' in source) throw new Error('source fixture')
  return {
    source: source.ok,
    entries: rows.map((entry, index) => ({ ...entry, position: index + 1 })),
    rules,
  }
}
function expectedAssistant(callId: string) {
  return {
    id: `assistant-${callId}`,
    type: 'assistant',
    response: `response-${callId}`,
    ending: 'complete',
    createdAt: '2026-10-07T00:00:00Z',
    blocks: [
      {
        id: `call-block-${callId}`,
        kind: 'tool_call',
        complete: true,
        callId,
        tool: 'test_tool',
        arguments: {},
        visibility: { toHuman: true, toModel: true },
      },
    ],
  }
}
function expectedPlaceholder(callId: string) {
  return {
    id: `placeholder-${callId}`,
    type: 'tool',
    callId,
    createdAt: '2026-10-07T00:00:00Z',
    blocks: [
      {
        id: `placeholder-result-${callId}`,
        kind: 'tool_result',
        callId,
        outcome: 'backgrounded',
        reason: { code: 'backgrounded_auto', text: 'running' },
        blocks: [],
        visibility: { toHuman: true, toModel: true },
      },
    ],
  }
}
function expectedFinished(callId: string) {
  return {
    id: 'ending-finished',
    type: 'system_reminder',
    nature: 'event',
    source: { kind: 'background_execution_finished', callId, outcome: 'completed' },
    createdAt: '2026-10-07T00:00:00Z',
    blocks: [
      {
        id: 'ending-finished-result',
        kind: 'tool_result',
        callId,
        outcome: 'completed',
        blocks: [],
        visibility: { toHuman: true, toModel: true },
      },
    ],
  }
}
function expectedInterrupted(callId: string) {
  return {
    id: 'ending-interrupted',
    type: 'system_reminder',
    nature: 'event',
    source: { kind: 'background_execution_interrupted', callId },
    createdAt: '2026-10-07T00:00:00Z',
    blocks: [
      {
        id: 'ending-interrupted-result',
        kind: 'tool_result',
        callId,
        outcome: 'failed',
        reason: { code: 'abnormal_interruption', text: 'execution lost' },
        blocks: [],
        visibility: { toHuman: true, toModel: true },
      },
    ],
  }
}
function expectPairingFailure(rows: readonly LogEntry[]) {
  const request = input(rows),
    before = encoded(request)
  expect(projectMessages(request)).toEqual({ invalidInput: true, reason: 'pairing' })
  expect(encoded(request)).toBe(before)
}

it.each(endings)('preserves the complete %s background result and its sources', ending => {
  const request = input([...prefix(), placeholder(), reminder(ending)])
  const before = encoded(request)
  const result = projectMessages(request)
  if (!('projected' in result)) throw new Error(encoded(result))
  expect(materializeMessages(result.projected)).toEqual({
    materialized: [
      expectedAssistant('call-a'),
      expectedPlaceholder('call-a'),
      ending === 'finished' ? expectedFinished('call-a') : expectedInterrupted('call-a'),
    ],
    sources: [
      { messageId: 'assistant-call-a', position: 1, blockIds: ['call-block-call-a'] },
      { messageId: 'placeholder-call-a', position: 3, blockIds: ['placeholder-result-call-a'] },
      { messageId: `ending-${ending}`, position: 4, blockIds: [`ending-${ending}-result`] },
    ],
    outputMessages: 3,
    outputBlocks: 3,
  })
  expect(encoded(request)).toBe(before)
})
it('ends two distinct calls independently in one Run and attempt', () => {
  const request = input([
    ...prefix(),
    placeholder(),
    reminder('finished'),
    ...prefix('call-b'),
    placeholder('call-b'),
    reminder('interrupted', { callId: 'call-b' }),
  ])
  const before = encoded(request)
  const result = projectMessages(request)
  if (!('projected' in result)) throw new Error(encoded(result))
  expect(materializeMessages(result.projected)).toEqual({
    materialized: [
      expectedAssistant('call-a'),
      expectedPlaceholder('call-a'),
      expectedFinished('call-a'),
      expectedAssistant('call-b'),
      expectedPlaceholder('call-b'),
      expectedInterrupted('call-b'),
    ],
    sources: [
      { messageId: 'assistant-call-a', position: 1, blockIds: ['call-block-call-a'] },
      { messageId: 'placeholder-call-a', position: 3, blockIds: ['placeholder-result-call-a'] },
      { messageId: 'ending-finished', position: 4, blockIds: ['ending-finished-result'] },
      { messageId: 'assistant-call-b', position: 5, blockIds: ['call-block-call-b'] },
      { messageId: 'placeholder-call-b', position: 7, blockIds: ['placeholder-result-call-b'] },
      { messageId: 'ending-interrupted', position: 8, blockIds: ['ending-interrupted-result'] },
    ],
    outputMessages: 6,
    outputBlocks: 6,
  })
  expect(encoded(request)).toBe(before)
})
it.each(endings)('rejects %s without a preceding complete call', ending => {
  expectPairingFailure([reminder(ending)])
})
it.each(endings)('rejects %s without a background placeholder', ending => {
  expectPairingFailure([...prefix(), reminder(ending)])
})
it.each(endings)('rejects %s after an ordinary completed tool return', ending => {
  expectPairingFailure([...prefix(), placeholder('call-a', 'completed'), reminder(ending)])
})
it.each(endings)('rejects %s before its background placeholder', ending => {
  expectPairingFailure([...prefix(), reminder(ending), placeholder()])
})
it.each(endings)('rejects %s for an unknown call despite another background call', ending => {
  expectPairingFailure([...prefix(), placeholder(), reminder(ending, { callId: 'unknown-call' })])
})
it.each(endings)('rejects %s from another Run', ending => {
  expectPairingFailure([...prefix(), placeholder(), reminder(ending, { fence: 'wrongRun' })])
})
it.each(endings)('rejects %s from attempt two', ending => {
  expectPairingFailure([...prefix(), placeholder(), reminder(ending, { fence: 'nextAttempt' })])
})
it.each(endings)('rejects %s with no Run or attempt', ending => {
  expectPairingFailure([...prefix(), placeholder(), reminder(ending, { fence: 'absent' })])
})
const duplicates: readonly [Ending, Ending][] = [
  ['finished', 'finished'],
  ['interrupted', 'interrupted'],
  ['finished', 'interrupted'],
  ['interrupted', 'finished'],
]
it.each(duplicates)('rejects %s followed by %s for the same background call', (first, second) => {
  expectPairingFailure([
    ...prefix(),
    placeholder(),
    reminder(first, { id: 'first-ending' }),
    reminder(second, { id: 'second-ending' }),
  ])
})
