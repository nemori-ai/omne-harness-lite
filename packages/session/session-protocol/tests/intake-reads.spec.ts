import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const operations = sessionProtocol.operations
const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied']
const card = { owner: 'human-intervention', record: 'card-1', revision: '1', digest: 'sha256:c' }

describe.each(['read-pending', 'read-waiting-calls', 'read-input-fate'] as const)('%s', name => {
  const read = operations[name]

  it('is a login read of the small limit that counts as access', () => {
    expect({ identity: read.identity, effect: read.effect, limit: read.limit }).toEqual({
      identity: 'login',
      effect: 'read',
      limit: 'small',
    })
    expect(read.countsAsAccess).toBe(true)
  })

  it('has `invalid` as its only own outcome', () => {
    expect(Object.keys(read.outcomes).filter(outcome => !always.includes(outcome))).toEqual([
      'invalid',
    ])
    expect(expectRoundTrip(read.outcomes.invalid, {})).toEqual({})
  })
})

describe('read-pending', () => {
  const read = operations['read-pending']
  const input = {
    input: 'input-1',
    position: '17',
    source: { name: 'session.member', label: 'Member' },
    role: 'user',
    wakes: true,
    preview: 'hello',
  }

  it('reads a body of the session, the position to continue after and the page limit', () => {
    expectRoundTrip(read.body, { tenant, session, after: null, limit: 20 })
    expectRoundTrip(read.body, { tenant, session, after: '17', limit: 1 })
  })

  it.each([
    ['without a limit', { tenant, session, after: null }],
    ['without after', { tenant, session, limit: 5 }],
    ['with a limit of zero', { tenant, session, after: null, limit: 0 }],
    ['with a position that is not one', { tenant, session, after: 'x', limit: 5 }],
    ['with a cursor', { tenant, session, after: null, limit: 5, cursor: 'c' }],
  ])('refuses a body %s', (_label, sample) => {
    expect(readSample(read.body, sample).ok).toBe(false)
  })

  it('answers the pending inputs and where the next page starts', () => {
    expectRoundTrip(read.outcomes.succeeded, { inputs: [], next: null })
    const reminder = { ...input, role: 'system_reminder', wakes: false, preview: '' }
    expectRoundTrip(read.outcomes.succeeded, { inputs: [input, reminder], next: '17' })
  })

  it.each([
    ['with another role', { ...input, role: 'assistant' }],
    ['with a wake that is not a boolean', { ...input, wakes: 'yes' }],
    ['without the source label', { ...input, source: { name: 'session.member' } }],
    ['with the whole message', { ...input, message: { role: 'user' } }],
  ])('refuses a pending input %s', (_label, sample) => {
    expect(readSample(read.outcomes.succeeded, { inputs: [sample], next: null })).toMatchObject({
      ok: false,
    })
  })
})

describe('read-waiting-calls', () => {
  const read = operations['read-waiting-calls']
  const call = { card, action: 'act-1', passage: 'before-tool', position: 'p1', run: 'run-1' }

  it('reads a body of the tenant and the session', () => {
    expectRoundTrip(read.body, { tenant, session })
    expect(readSample(read.body, { tenant }).ok).toBe(false)
  })

  it('answers the calls that wait for a card, with the card each one raised', () => {
    expectRoundTrip(read.outcomes.succeeded, { calls: [] })
    expectRoundTrip(read.outcomes.succeeded, {
      calls: [call, { ...call, action: null, run: null }],
    })
  })

  it.each([
    ['without the card', { ...call, card: undefined }],
    ['with a card of three members', { ...call, card: { owner: 'o', record: 'r', revision: '1' } }],
    ['with an empty passage', { ...call, passage: '' }],
  ])('refuses a waiting call %s', (_label, sample) => {
    expect(readSample(read.outcomes.succeeded, { calls: [sample] }).ok).toBe(false)
  })
})

describe('read-input-fate', () => {
  const read = operations['read-input-fate']

  it('reads a body of the session and the input identity the sender gave', () => {
    expectRoundTrip(read.body, { tenant, session, inputId: 'input-1' })
    expect(readSample(read.body, { tenant, session }).ok).toBe(false)
    expect(readSample(read.body, { tenant, session, inputId: '' }).ok).toBe(false)
  })

  it.each([
    ['pending', { kind: 'pending', returnedFrom: null }],
    ['pending again after a failed Run', { kind: 'pending', returnedFrom: 'run-1' }],
    ['taken', { kind: 'taken', run: 'run-1' }],
    ['answered while the Run goes on', { kind: 'answered', run: 'run-1', terminal: 'active' }],
    ['answered and completed', { kind: 'answered', run: 'run-1', terminal: 'completed' }],
    ['answered and failed', { kind: 'answered', run: 'run-1', terminal: 'failed' }],
    ['answered and cancelled', { kind: 'answered', run: 'run-1', terminal: 'cancelled' }],
    ['settled by a cancel', { kind: 'settled', by: 'cancelled', run: 'run-1' }],
    ['settled by the archive', { kind: 'settled', by: 'archived', run: null }],
    ['settled by the freeze', { kind: 'settled', by: 'frozen', run: null }],
    ['refused', { kind: 'refused', reason: 'too-large' }],
  ])('answers succeeded %s and writes it back as it was', (_label, fate) => {
    expectRoundTrip(read.outcomes.succeeded, { fate })
  })

  it.each([
    ['of an unknown kind', { kind: 'lost' }],
    ['taken without its Run', { kind: 'taken' }],
    ['answered with an unknown terminal', { kind: 'answered', run: 'r', terminal: 'ended' }],
    ['settled by something else', { kind: 'settled', by: 'timeout', run: null }],
    ['pending with a member of another cell', { kind: 'pending', returnedFrom: null, run: 'r' }],
  ])('refuses a fate %s', (_label, fate) => {
    expect(readSample(read.outcomes.succeeded, { fate }).ok).toBe(false)
  })
})
