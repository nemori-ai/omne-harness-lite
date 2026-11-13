// Read and write equivalence with the `session-public/1` family (card #1266 C6). A body the old
// family accepts reads, through the new contract, to the same value; a body it rejects, the new
// contract rejects too. The one allowed difference: `create-session` may leave `definition` out.
import { describe, expect, it } from 'vitest'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  readSessionRequest,
  readSessionResponse,
  type Codec,
  type SessionOperation,
} from '@omne-harness/public-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const tenant = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
const session = '0123456789abcdef'.repeat(4)
const target = { tenant, session }
const userMessage = { role: 'user', blocks: [{ type: 'text', text: 'hello' }], weight: 1 }
const producer = { kind: 'model', call: 'call-1' }
const source = { owner: 'agent', record: 'record-1', revision: '4', digest: 'digest-1' }

type Name = keyof typeof sessionProtocol.operations
type Samples = Readonly<Record<Name, readonly Record<string, unknown>[]>>

const validBodies: Samples = {
  'create-session': [{ createCallId: 'call', definition: 'default', purpose: '' }],
  'query-create-session': [{ tenant, createCallId: 'call' }],
  'send-input': [{ ...target, acceptId: 'accept', inputId: 'input', message: userMessage }],
  'query-send-input': [{ ...target, acceptId: 'accept' }],
  'read-history': [
    { ...target, cursor: null, direction: 'backward', pageBytes: '65536' },
    { ...target, cursor: 'opaque-cursor' },
  ],
  'cancel-run': [{ ...target, controlId: 'control', run: 'run-1', urgency: 'graceful' }],
  'stop-call': [{ ...target, controlId: 'control', producer }],
}

const invalidBodies: Samples = {
  'create-session': [
    { createCallId: '', definition: 'default', purpose: '' },
    { createCallId: 'call', definition: '', purpose: '' },
    { createCallId: 'call', definition: 'default', purpose: '', extra: 1 },
  ],
  'query-create-session': [{ tenant: 'not-a-tenant', createCallId: 'call' }],
  'send-input': [
    { ...target, acceptId: 'accept', inputId: 'input', message: { role: 'assistant' } },
    { ...target, acceptId: 'accept', message: userMessage },
  ],
  'query-send-input': [{ ...target }, { tenant, session: 'short', acceptId: 'accept' }],
  'read-history': [
    { ...target, cursor: null },
    { ...target, cursor: 'opaque-cursor', direction: 'forward', pageBytes: '65536' },
    { ...target, cursor: null, direction: 'sideways', pageBytes: '65536' },
    { ...target, cursor: null, direction: 'forward', pageBytes: '0' },
  ],
  'cancel-run': [{ ...target, controlId: 'control', run: 'run-1', urgency: 'soon' }],
  'stop-call': [{ ...target, controlId: 'control', producer: { kind: 'agent', call: 'c' } }],
}

const successBodies: Samples = {
  'create-session': [{ session, recovered: false }],
  'query-create-session': [{ session }],
  'send-input': [{ recovered: true }],
  'query-send-input': [{}],
  'read-history': [
    {
      entries: [{ entryId: 'entry-1', revision: '3', kind: 'user', payload: { a: [1, null] } }],
      next: null,
      exhausted: true,
      scannedThrough: '3',
    },
    { entries: [], next: 'next-cursor', exhausted: false, scannedThrough: '' },
  ],
  'cancel-run': [
    { kind: 'requested', controlId: 'control', run: 'run-1' },
    {
      kind: 'ended',
      controlId: 'control',
      run: 'run-1',
      terminal: { outcome: 'cancelled', source },
    },
  ],
  'stop-call': [
    { kind: 'requested', controlId: 'control', producer },
    {
      kind: 'ended',
      controlId: 'control',
      producer,
      terminal: { version: '2', outcome: 'interrupted', source },
    },
  ],
}

const tree = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return read.value
}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

/** Any codec of the contract; the samples are untyped JSON, so the value type is not checked here. */
type AnyCodec = Codec<any>

function readNew(codec: AnyCodec, sample: unknown) {
  return codec.read(tree(sample), limits)
}

function readOldBody(operation: SessionOperation, body: unknown) {
  const read = readSessionRequest({
    bytes: bytes({
      protocolVersion: 'session-public/1',
      messageId: 'm',
      operation,
      loginProof: 'proof',
      ...(operation === 'create-session' ? { actingTenant: tenant } : {}),
      body,
    }),
    limits,
  })
  return read.kind === 'request' ? { ok: true, value: read.request.body } : { ok: false }
}

function readOldOutcome(operation: SessionOperation, outcome: string, body: unknown) {
  const read = readSessionResponse({
    bytes: bytes({ protocolVersion: 'session-public/1', messageId: 'm', outcome, body }),
    operation,
    expectedMessageId: 'm',
    limits,
  })
  return read.kind === 'response' ? { ok: true, value: read.response.body } : { ok: false }
}

/** Reads, writes back, and checks the written JSON is the sample. */
function expectRoundTrip(codec: AnyCodec, sample: unknown) {
  const read = readNew(codec, sample)
  if (!read.ok) throw new Error('sample not accepted')
  const written = codec.write(read.value, limits)
  if (!written.ok) throw new Error('read value not written')
  expect(JSON.parse(writeJsonText(written.value))).toEqual(sample)
  return read.value
}

const operations = Object.keys(validBodies) as Name[]
const cases = (samples: Samples) =>
  operations.flatMap(name => samples[name].map(sample => [name, sample] as const))

describe('request bodies', () => {
  it.each(cases(validBodies))(
    '%s: a body the old family accepts reads to the same value',
    (name, sample) => {
      const old = readOldBody(name, sample)
      expect(old.ok).toBe(true)
      const value = expectRoundTrip(sessionProtocol.operations[name].body, sample)
      expect(value).toEqual(old.value)
    },
  )

  it.each(cases(invalidBodies))('%s: a body the old family rejects is rejected', (name, sample) => {
    expect(readOldBody(name, sample)).toEqual({ ok: false })
    expect(readNew(sessionProtocol.operations[name].body, sample)).toEqual({ ok: false })
  })

  it('create-session may leave definition out, which the old family refused', () => {
    const sample = { createCallId: 'call', purpose: 'chat' }
    expect(readOldBody('create-session', sample)).toEqual({ ok: false })
    expect(expectRoundTrip(sessionProtocol.operations['create-session'].body, sample)).toEqual(
      sample,
    )
  })
})

describe('outcome bodies', () => {
  it.each(cases(successBodies))('%s: a succeeded body reads to the old value', (name, sample) => {
    const old = readOldOutcome(name, 'succeeded', sample)
    expect(old.ok).toBe(true)
    const value = expectRoundTrip(sessionProtocol.operations[name].outcomes.succeeded, sample)
    expect(value).toEqual(old.value)
  })

  it.each(['create-session', 'send-input'] as const)(
    '%s: limited carries resource and limit',
    name => {
      const sample = { resource: 'input-bytes', limit: 65536 }
      const old = readOldOutcome(name, 'limited', sample)
      expect(old.ok).toBe(true)
      expect(expectRoundTrip(sessionProtocol.operations[name].outcomes.limited, sample)).toEqual(
        old.value,
      )
      const wrong = { resource: 'sessions', limit: 1 }
      expect(readOldOutcome(name, 'limited', wrong)).toEqual({ ok: false })
      expect(readNew(sessionProtocol.operations[name].outcomes.limited, wrong)).toEqual({
        ok: false,
      })
    },
  )

  it('every other outcome with a codec has an empty body, as before', () => {
    for (const name of operations)
      for (const [outcome, codec] of Object.entries(sessionProtocol.operations[name].outcomes)) {
        if (outcome === 'succeeded' || outcome === 'limited' || codec === true) continue
        expect(readOldOutcome(name, outcome, {}).ok).toBe(true)
        expect(expectRoundTrip(codec, {})).toEqual({})
        expect(readNew(codec, { reason: 'x' })).toEqual({ ok: false })
      }
  })
})
