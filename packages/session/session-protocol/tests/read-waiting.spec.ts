import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const read = sessionProtocol.operations['read-waiting']
const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied']

describe('read-waiting', () => {
  it('is a login read of the small limit that counts as access', () => {
    expect({ identity: read.identity, effect: read.effect, limit: read.limit }).toEqual({
      identity: 'login',
      effect: 'read',
      limit: 'small',
    })
    expect(read.countsAsAccess).toBe(true)
  })

  it('has `invalid` as its only own outcome, like read-history', () => {
    expect(Object.keys(read.outcomes).filter(name => !always.includes(name))).toEqual(['invalid'])
  })

  it('reads a body of the tenant and the session and writes it back as it was', () => {
    expectRoundTrip(read.body, { tenant, session })
  })

  it.each([
    ['without a session', { tenant }],
    ['without a tenant', { session }],
    ['with a run', { tenant, session, run: 'run-1' }],
  ])('refuses a body %s', (_label, sample) => {
    expect(readSample(read.body, sample)).toEqual({ ok: false })
  })

  it.each([
    ['not waiting', { waiting: null }],
    [
      'waiting with a cause and its detail',
      {
        waiting: {
          run: 'run-1',
          pending: 2,
          cause: { kind: 'no-reply', detail: 'upstream 503' },
        },
      },
    ],
    [
      'waiting with a cause and no detail',
      {
        waiting: { run: 'run-1', pending: 1, cause: { kind: 'guard', detail: null } },
      },
    ],
    [
      'waiting with nothing pending and no cause',
      {
        waiting: { run: 'run-1', pending: 0, cause: null },
      },
    ],
  ])('answers succeeded %s and writes it back as it was', (_label, sample) => {
    expectRoundTrip(read.outcomes.succeeded, sample)
  })

  it.each([
    ['without waiting', {}],
    ['with a negative count', { waiting: { run: 'run-1', pending: -1, cause: null } }],
    ['with a fractional count', { waiting: { run: 'run-1', pending: 1.5, cause: null } }],
    ['with a count as text', { waiting: { run: 'run-1', pending: '1', cause: null } }],
    ['with an empty run', { waiting: { run: '', pending: 0, cause: null } }],
    [
      'with an empty cause kind',
      {
        waiting: { run: 'run-1', pending: 0, cause: { kind: '', detail: null } },
      },
    ],
    [
      'with an empty detail',
      {
        waiting: { run: 'run-1', pending: 0, cause: { kind: 'guard', detail: '' } },
      },
    ],
    [
      'with the whole session state',
      {
        waiting: { run: 'run-1', pending: 0, cause: null, inputs: ['input-1'] },
      },
    ],
  ])('refuses a succeeded body %s', (_label, sample) => {
    expect(readSample(read.outcomes.succeeded, sample)).toEqual({ ok: false })
  })

  it('answers invalid with an empty body', () => {
    expect(expectRoundTrip(read.outcomes.invalid, {})).toEqual({})
    expect(readSample(read.outcomes.invalid, { reason: 'x' })).toEqual({ ok: false })
  })
})
