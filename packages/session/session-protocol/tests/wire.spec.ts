import { describe, expect, it } from 'vitest'
import { readTenantText } from '@omne-harness/public-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'
import {
  expectRoundTrip,
  readSample as readNew,
  session,
  tenant,
  tree,
} from './fixtures/samples.ts'

const target = { tenant, session }
const userMessage = { role: 'user', blocks: [{ type: 'text', text: 'hello' }], weight: 1 }
const producer = { kind: 'model', call: 'call-1' }
const source = { owner: 'agent', record: 'record-1', revision: '4', digest: 'digest-1' }

type Name = Exclude<
  keyof typeof sessionProtocol.operations,
  | 'list-sessions'
  | 'list-archived-sessions'
  | 'retry-run'
  | 'read-waiting'
  | 'read-pending'
  | 'read-waiting-calls'
  | 'read-input-fate'
  | 'search-history'
  | 'background-call'
  | 'list-background-calls'
  | 'read-permission-mode'
  | 'change-permission-mode'
>
type Samples = Readonly<Record<Name, readonly Record<string, unknown>[]>>

const validBodies: Samples = {
  'create-session': [{ createCallId: 'call', definition: 'default', purpose: '' }],
  'query-create-session': [{ tenant, createCallId: 'call' }],
  'send-input': [{ ...target, acceptId: 'accept', inputId: 'input', message: userMessage }],
  'interrupt-input': [{ ...target, acceptId: 'accept', inputId: 'input', message: userMessage }],
  'query-send-input': [{ ...target, acceptId: 'accept' }],
  'read-history': [
    { ...target, cursor: null, direction: 'backward', pageBytes: '65536' },
    { ...target, cursor: 'opaque-cursor' },
  ],
  'cancel-run': [{ ...target, controlId: 'control', run: 'run-1', urgency: 'graceful' }],
  'archive-session': [{ ...target, controlId: 'control' }],
  'unarchive-session': [{ ...target, controlId: 'control' }],
  'stop-call': [
    { ...target, controlId: 'control', producer },
    { ...target, controlId: 'control', producer, reason: 'not needed' },
    { ...target, controlId: 'control', producer, reason: null },
  ],
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
  'interrupt-input': [
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
  'archive-session': [{ ...target }, { ...target, controlId: 'control', run: 'run-1' }],
  'unarchive-session': [{ ...target, controlId: '' }],
  'stop-call': [
    { ...target, controlId: 'control', producer: { kind: 'agent', call: 'c' } },
    { ...target, controlId: 'control', producer, reason: 7 },
  ],
}

const successBodies: Samples = {
  'create-session': [{ session, recovered: false }],
  'query-create-session': [{ session }],
  'send-input': [{ recovered: true }],
  'interrupt-input': [
    { recovered: false, as: 'interrupt' },
    { recovered: true, as: 'ordinary' },
  ],
  'query-send-input': [{}],
  'read-history': [
    {
      entries: [{ entryId: 'entry-1', revision: '3', kind: 'user', payload: { a: [1, null] } }],
      next: null,
      exhausted: true,
      scannedThrough: '3',
      upper: '7',
    },
    { entries: [], next: 'next-cursor', exhausted: false, scannedThrough: '', upper: '7' },
  ],
  'archive-session': [
    { kind: 'archived', controlId: 'control', runs: 1, backgroundCalls: 0 },
    { kind: 'already-archived', controlId: 'control' },
  ],
  'unarchive-session': [
    { kind: 'unarchived', controlId: 'control' },
    { kind: 'not-archived', controlId: 'control' },
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

const tenantId = readTenantText(tenant)

function expectedRequest(sample: Readonly<Record<string, unknown>>): unknown {
  return {
    ...sample,
    ...(Object.hasOwn(sample, 'tenant') ? { tenant: tenantId } : {}),
    ...(Object.hasOwn(sample, 'message') ? { message: tree(sample.message) } : {}),
  }
}

function expectedSuccess(sample: Readonly<Record<string, unknown>>): unknown {
  if (!Array.isArray(sample.entries)) return sample
  const entries = sample.entries as readonly Readonly<Record<string, unknown>>[]
  return { ...sample, entries: entries.map(entry => ({ ...entry, payload: tree(entry.payload) })) }
}

const operations = Object.keys(validBodies) as Name[]
const cases = (samples: Samples) =>
  operations.flatMap(name => samples[name].map(sample => [name, sample] as const))

describe('request bodies', () => {
  it.each(cases(validBodies))(
    '%s: a body the old family accepts reads to the same value',
    (name, sample) => {
      const value = expectRoundTrip(sessionProtocol.operations[name].body, sample)
      expect(value).toEqual(expectedRequest(sample))
    },
  )

  it.each(cases(invalidBodies))('%s: a body the old family rejects is rejected', (name, sample) => {
    expect(readNew(sessionProtocol.operations[name].body, sample)).toEqual({ ok: false })
  })

  it('create-session may leave definition out, which the old family refused', () => {
    const sample = { createCallId: 'call', purpose: 'chat' }
    expect(expectRoundTrip(sessionProtocol.operations['create-session'].body, sample)).toEqual(
      sample,
    )
  })
})

describe('outcome bodies', () => {
  const sameAsOld = cases(successBodies).filter(([name]) => name !== 'read-history')
  it.each(sameAsOld)('%s: a succeeded body reads to the old value', (name, sample) => {
    const value = expectRoundTrip(sessionProtocol.operations[name].outcomes.succeeded, sample)
    expect(value).toEqual(expectedSuccess(sample))
  })

  it.each(successBodies['read-history'])(
    'read-history: the page is the old page plus the pinned revision `upper`',
    sample => {
      const { upper, ...oldPage } = sample
      const codec = sessionProtocol.operations['read-history'].outcomes.succeeded
      expect(expectRoundTrip(codec, sample)).toEqual({
        ...(expectedSuccess(oldPage) as object),
        upper,
      })
      expect(readNew(codec, oldPage)).toEqual({ ok: false })
      expect(readNew(codec, { ...oldPage, upper: 7 })).toEqual({ ok: false })
    },
  )

  it.each(['create-session', 'send-input'] as const)(
    '%s: limited carries resource and limit',
    name => {
      const sample = { resource: 'input-bytes', limit: 65536 }
      expect(expectRoundTrip(sessionProtocol.operations[name].outcomes.limited, sample)).toEqual(
        sample,
      )
      const wrong = { resource: 'sessions', limit: 1 }
      expect(readNew(sessionProtocol.operations[name].outcomes.limited, wrong)).toEqual({
        ok: false,
      })
    },
  )

  it('every other outcome with a codec has an empty body, as before', () => {
    for (const name of operations)
      for (const [outcome, codec] of Object.entries(sessionProtocol.operations[name].outcomes)) {
        if (outcome === 'succeeded' || outcome === 'limited' || codec === true) continue
        expect(expectRoundTrip(codec, {})).toEqual({})
        expect(readNew(codec, { reason: 'x' })).toEqual({ ok: false })
      }
  })
})

describe('list-sessions', () => {
  const listing = sessionProtocol.operations['list-sessions']
  const row = {
    session,
    createdAt: '2026-11-13T01:02:03Z',
    lastActivityAt: null,
    lifecycle: 'dormant',
    title: null,
  }

  it.each([[{ tenant, cursor: null }], [{ tenant, cursor: 'opaque-cursor', limit: 20 }]])(
    'reads a body and writes it back as it was',
    sample => {
      expectRoundTrip(listing.body, sample)
    },
  )

  it.each([
    ['without a cursor', { tenant }],
    ['with a limit of zero', { tenant, cursor: null, limit: 0 }],
    ['with a text limit', { tenant, cursor: null, limit: '5' }],
    ['with the old includeArchived', { tenant, cursor: null, includeArchived: true }],
    ['with a tenant that is no tenant', { tenant: 'not-a-tenant', cursor: null }],
    ['with a field it does not have', { tenant, cursor: null, extra: 1 }],
  ])('refuses a body %s', (_label, sample) => {
    expect(readNew(listing.body, sample)).toEqual({ ok: false })
  })

  it.each([
    [{ sessions: [], next: null, completeness: 'complete' }],
    [{ sessions: [row], next: 'next-cursor', completeness: 'partial' }],
    [
      {
        sessions: [{ ...row, title: 'hello', lifecycle: 'archived' }],
        next: null,
        completeness: 'complete',
      },
    ],
  ])('reads a succeeded body and writes it back as it was', sample => {
    expectRoundTrip(listing.outcomes.succeeded, sample)
  })

  it.each([
    ['without completeness', { sessions: [], next: null }],
    ['with another completeness', { sessions: [], next: null, completeness: 'full' }],
    [
      'with another lifecycle',
      { sessions: [{ ...row, lifecycle: 'paused' }], next: null, completeness: 'complete' },
    ],
    [
      'with a time that is not an instant',
      { sessions: [{ ...row, createdAt: 'yesterday' }], next: null, completeness: 'complete' },
    ],
    [
      'with a row without a title',
      { sessions: [{ ...row, title: undefined }], next: null, completeness: 'complete' },
    ],
  ])('refuses a succeeded body %s', (_label, sample) => {
    expect(readNew(listing.outcomes.succeeded, sample)).toEqual({ ok: false })
  })

  it('answers invalid with an empty body', () => {
    expect(expectRoundTrip(listing.outcomes.invalid, {})).toEqual({})
    expect(readNew(listing.outcomes.invalid, { reason: 'x' })).toEqual({ ok: false })
  })
})

describe('list-archived-sessions', () => {
  const listing = sessionProtocol.operations['list-archived-sessions']
  const row = {
    session,
    createdAt: null,
    lastActivityAt: '2026-11-13T01:02:03Z',
    lifecycle: 'archived',
    title: 'old work',
    archivedAt: '2026-11-14T00:00:00Z',
    archivedBy: 'person',
  }

  it.each([
    [{ tenant, cursor: null }],
    [
      {
        tenant,
        cursor: 'opaque-cursor',
        limit: 20,
        from: '2026-11-01T00:00:00Z',
        to: null,
        by: 'auto',
        titleContains: '构建',
      },
    ],
  ])('reads a body and writes it back as it was', sample => {
    expectRoundTrip(listing.body, sample)
  })

  it.each([
    ['with a time that is no instant', { tenant, cursor: null, from: 'yesterday' }],
    ['with another way of archiving', { tenant, cursor: null, by: 'robot' }],
    ['with a numeric title part', { tenant, cursor: null, titleContains: 3 }],
  ])('refuses a body %s', (_label, sample) => {
    expect(readNew(listing.body, sample)).toEqual({ ok: false })
  })

  it.each([
    [{ sessions: [row], next: null, completeness: 'complete' }],
    [
      {
        sessions: [{ ...row, archivedAt: null, archivedBy: null }],
        next: 'n',
        completeness: 'partial',
      },
    ],
  ])('reads a succeeded body and writes it back as it was', sample => {
    expectRoundTrip(listing.outcomes.succeeded, sample)
  })

  it('refuses an item without the archive fields', () => {
    const { archivedAt: _at, archivedBy: _by, ...plain } = row
    expect(
      readNew(listing.outcomes.succeeded, {
        sessions: [plain],
        next: null,
        completeness: 'complete',
      }),
    ).toEqual({ ok: false })
  })
})
