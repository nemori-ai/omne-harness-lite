import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const tenant = { organization: 'benchmark', account: 'benchmark' }
export const at = '2026-10-01T00:00:00Z'
export const seed = 1701

export function user(index) {
  return {
    id: `user-${index}`,
    type: 'user',
    createdAt: at,
    blocks: [
      {
        id: `u-block-${index}`,
        kind: 'text',
        text: `synthetic-${(index * 48271 + seed) % 2147483647} 中文 ${'x'.repeat(128)}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  }
}

export function group(modules, session, index) {
  const binding = {
    implementation: { name: 'benchmark', revision: 'one' },
    definition: { modelId: 'synthetic/model', revision: 'one' },
    configuration: { revision: 'one', values: {} },
  }
  const snapshot = {
    adaptation: binding,
    providers: ['synthetic'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 100000,
    maxOutputTokens: 1000,
    inputConstraints: {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
    updatedAt: at,
  }
  const dispatched = {
    kind: 'model_call_dispatched',
    call: `call-${index}`,
    dispatch: 1,
    response: `response-${index}`,
    adaptation: binding,
    profile: { origin: 'official', routeName: 'synthetic/model' },
    profileSnapshot: snapshot,
    provider: 'synthetic',
    selectedBy: 'session',
    credentialScope: { layer: 'factory' },
    parameters: {},
  }
  const reply = {
    id: `assistant-${index}`,
    type: 'assistant',
    response: `response-${index}`,
    ending: 'complete',
    createdAt: '2026-10-01T00:00:02Z',
    blocks: [
      {
        id: `a-block-${index}`,
        kind: 'text',
        text: `answer-${index} ${'y'.repeat(192)}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  }
  const response = {
    id: `response-${index}`,
    call: { callId: `call-${index}` },
    dispatch: 1,
    route: {
      adaptation: binding,
      profile: dispatched.profile,
      profileSnapshot: snapshot,
      provider: 'synthetic',
      selectedBy: 'session',
      credentialScope: { layer: 'factory' },
      parameters: {},
    },
    outcome: 'complete',
    reply,
    replyDisposition: 'persisted',
    timing: { sentAt: at, firstTokenAt: '2026-10-01T00:00:01Z', endedAt: '2026-10-01T00:00:02Z' },
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_tokens: 'unknown',
      cache_write_tokens: 0,
      source: 'upstream',
    },
    inputCalibration: {
      requestInput: { kind: 'unavailable', reason: 'not_retained' },
      observedInput: { kind: 'unavailable', reason: 'missing_usage' },
      outputGroup: { kind: 'unavailable', reason: 'not_retained' },
    },
    cost: { cost_usd: 0, source: 'upstream_usage' },
  }
  const capturedResponse = capture(modules, 'response', response)
  return [
    prepare(modules, session, 'message', user(index), { kind: 'message' }),
    prepare(modules, session, 'record', dispatched, { kind: 'record' }),
    prepare(
      modules,
      session,
      'record',
      {
        kind: 'model_call_opened',
        call: `call-${index}`,
        dispatch: 1,
        firstTokenAt: '2026-10-01T00:00:01Z',
      },
      { kind: 'record' },
    ),
    prepare(modules, session, 'message', reply, {
      kind: 'persistedMessage',
      response: capturedResponse,
    }),
    prepare(modules, session, 'response', response, { kind: 'response' }),
  ]
}

export function history(modules, session, groups) {
  return Array.from({ length: groups }, (_, index) => {
    if (index % 64 === 0) return group(modules, session, index)
    return Array.from({ length: 5 }, (_, offset) => {
      const message = user(1000000 + index * 5 + offset)
      message.blocks[0].text = `note-${index}-${offset}`
      return prepare(modules, session, 'message', message, { kind: 'message' })
    })
  }).flat()
}

function capture(modules, category, value) {
  const result = modules.codec.captureModelLogValue({ category, input: { kind: 'value', value } })
  assert.ok('ok' in result, `Synthetic ${category} must be valid: ${JSON.stringify(result)}`)
  return result.ok
}

export function prepare(modules, session, category, value, purpose) {
  const result = modules.codec.prepareModelLogEntry({
    session,
    shell: { tenant },
    captured: capture(modules, category, value),
    purpose,
    messagePrefix: [],
  })
  assert.ok('ok' in result, `Synthetic entry must be valid: ${JSON.stringify(result)}`)
  return result.ok
}

export function locate(entries, session, offset = 0) {
  return entries.map((entry, index) => ({ ...entry, session, position: offset + index + 1 }))
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    if (value.constructor.name === 'LosslessNumber') return value.source
    return `{${Object.keys(value)
      .sort()
      .filter(key => value[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

export function integer(value) {
  const result = Number(typeof value === 'number' ? value : value.source)
  assert.ok(Number.isSafeInteger(result), 'Benchmark ordinal must be a safe integer')
  return result
}

export function checkCut(adapter, cut, expected, values) {
  assert.equal(adapter.length(cut), expected.length)
  assert.equal(integer(adapter.source(cut).tail), expected.length)
  const entries = adapter.entries(cut)
  assert.equal(digest(entries), digest(expected), 'Content differs from independent raw input')
  const bytes = Buffer.byteLength(
    values.writeJsonLossless({ entries: expected, tail: adapter.source(cut).tail }),
  )
  assert.equal(adapter.bytes(cut), bytes, 'Exact persisted prefix byte charge differs')
  const facts = adapter.facts(cut)
  assert.equal(facts.invalid, false, 'Session facts must remain valid')
  const expectedFacts = expected
    .filter(entry => entry.payload.owner === 'session-runtime')
    .map(entry => ({ entry, fact: entry.payload.value }))
  assert.equal(digest(facts.entries), digest(expectedFacts), 'Session facts differ from raw input')
  return {
    rows: entries.length,
    bytes,
    digest: digest(entries),
    indexReferences: cut.history?.indexReferences ?? null,
  }
}
