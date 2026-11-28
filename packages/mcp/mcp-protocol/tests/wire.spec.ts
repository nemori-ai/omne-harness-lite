import { describe, expect, it } from 'vitest'
import { mcpProtocol } from '@omne-harness/mcp-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const { operations } = mcpProtocol

const usable = {
  name: 'docs',
  connection: { state: 'ready', reason: null },
  credential: 'present',
  use: { kind: 'usable' },
  catalog: { kind: 'acquired', actions: 3 },
}
const blocked = {
  name: 'notes',
  connection: { state: 'lost', reason: 'the endpoint could not be reached' },
  credential: 'absent',
  use: { kind: 'blocked', reason: 'the endpoint is disabled' },
  catalog: { kind: 'not-acquired', reason: 'the address of the endpoint is not set' },
}
const bare = {
  ...usable,
  name: 'plain',
  credential: 'not-required',
  catalog: { kind: 'not-acquired', reason: null },
}
const action = { name: 'search', summary: '[peer] Search the docs.', available: true, reason: null }

describe('the request bodies', () => {
  it('list-endpoints reads a tenant and writes it back as it was', () => {
    expectRoundTrip(operations['list-endpoints'].body, { tenant })
  })

  it.each(['read-endpoint', 'refresh-endpoint'] as const)(
    '%s reads a tenant and a name and writes them back as they were',
    name => {
      expectRoundTrip(operations[name].body, { tenant, name: 'docs' })
    },
  )

  it.each([
    ['a tenant that is no tenant', { tenant: 'nobody', name: 'docs' }],
    ['an empty name', { tenant, name: '' }],
    ['a numeric name', { tenant, name: 1 }],
    ['no name', { tenant }],
    ['a field it does not have', { tenant, name: 'docs', extra: 1 }],
  ])('read-endpoint and refresh-endpoint refuse %s', (_label, sample) => {
    expect(readSample(operations['read-endpoint'].body, sample).ok).toBe(false)
    expect(readSample(operations['refresh-endpoint'].body, sample).ok).toBe(false)
  })

  it('list-endpoints refuses a name and a missing tenant', () => {
    expect(readSample(operations['list-endpoints'].body, { tenant, name: 'docs' })).toMatchObject({
      ok: false,
    })
    expect(readSample(operations['list-endpoints'].body, {}).ok).toBe(false)
  })
})

describe('list-endpoints succeeded', () => {
  it.each([[[]], [[usable, blocked, bare]]])('round-trips the items %j', items => {
    expectRoundTrip(operations['list-endpoints'].outcomes.succeeded, { items })
  })

  it.each(['none', 'preparing', 'ready', 'degraded', 'lost'])(
    'round-trips the connection state %s',
    state => {
      expectRoundTrip(operations['list-endpoints'].outcomes.succeeded, {
        items: [{ ...usable, connection: { state, reason: state === 'lost' ? 'why' : null } }],
      })
    },
  )

  it.each(['present', 'absent', 'invalid', 'not-required'])(
    'round-trips the credential %s',
    credential => {
      expectRoundTrip(operations['list-endpoints'].outcomes.succeeded, {
        items: [{ ...usable, credential }],
      })
    },
  )

  it('carries the text of a peer that is empty or holds control characters', () => {
    expectRoundTrip(operations['list-endpoints'].outcomes.succeeded, {
      items: [
        {
          ...blocked,
          use: { kind: 'blocked', reason: '' },
          connection: { state: 'lost', reason: 'a\tb' },
        },
      ],
    })
  })

  it.each([
    ['another connection state', { ...usable, connection: { state: 'gone', reason: null } }],
    ['another credential', { ...usable, credential: 'maybe' }],
    ['a use that is neither', { ...usable, use: { kind: 'maybe' } }],
    ['a usable with a reason', { ...usable, use: { kind: 'usable', reason: 'x' } }],
    ['a blocked without a reason', { ...usable, use: { kind: 'blocked' } }],
    ['an acquired catalog without a count', { ...usable, catalog: { kind: 'acquired' } }],
    ['a negative count', { ...usable, catalog: { kind: 'acquired', actions: -1 } }],
    ['a count that is text', { ...usable, catalog: { kind: 'acquired', actions: '3' } }],
    [
      'a not-acquired catalog with a count',
      { ...usable, catalog: { kind: 'not-acquired', reason: null, actions: 1 } },
    ],
    ['an empty name', { ...usable, name: '' }],
    ['no catalog', { ...usable, catalog: undefined }],
  ])('refuses an item with %s', (_label, item) => {
    expect(
      readSample(operations['list-endpoints'].outcomes.succeeded, { items: [item] }),
    ).toMatchObject({
      ok: false,
    })
  })
})

describe('read-endpoint', () => {
  it.each([
    [null],
    [[]],
    [[action]],
    [[action, { ...action, name: 'drop', available: false, reason: 'the endpoint is disabled' }]],
  ])('round-trips a read with the actions %j', actions => {
    expectRoundTrip(operations['read-endpoint'].outcomes.succeeded, { endpoint: usable, actions })
  })

  it('keeps the actions apart from the endpoint, and refuses a read without them', () => {
    expect(
      readSample(operations['read-endpoint'].outcomes.succeeded, { endpoint: usable }),
    ).toMatchObject({ ok: false })
    expect(
      readSample(operations['read-endpoint'].outcomes.succeeded, {
        endpoint: usable,
        actions: [{ ...action, available: 'yes' }],
      }),
    ).toMatchObject({ ok: false })
    expect(
      readSample(operations['read-endpoint'].outcomes.succeeded, {
        endpoint: usable,
        actions: [{ ...action, name: '' }],
      }),
    ).toMatchObject({ ok: false })
  })

  it('answers not-visible with an empty body and refuses one that says something', () => {
    expectRoundTrip(operations['read-endpoint'].outcomes['not-visible'], {})
    expect(
      readSample(operations['read-endpoint'].outcomes['not-visible'], {
        reason: 'no such endpoint',
      }),
    ).toMatchObject({ ok: false })
  })
})

describe('refresh-endpoint', () => {
  it.each([
    ['published', null],
    ['superseded', null],
    ['cancelled', null],
    ['failed', 'the endpoint could not be reached'],
  ])('round-trips the result %s', (refreshed, reason) => {
    expectRoundTrip(operations['refresh-endpoint'].outcomes.succeeded, { refreshed, reason })
  })

  it.each([
    ['another result', { refreshed: 'kept', reason: null }],
    ['no reason member', { refreshed: 'failed' }],
    ['a reason that is not text', { refreshed: 'failed', reason: 3 }],
  ])('refuses %s', (_label, sample) => {
    expect(readSample(operations['refresh-endpoint'].outcomes.succeeded, sample)).toMatchObject({
      ok: false,
    })
  })

  it('answers not-visible with an empty body', () => {
    expectRoundTrip(operations['refresh-endpoint'].outcomes['not-visible'], {})
  })
})

describe('observe-endpoints', () => {
  const { open, frame } = mcpProtocol.observations['observe-endpoints']

  it('opens with a tenant and nothing else', () => {
    expectRoundTrip(open, { tenant })
    expect(readSample(open, {}).ok).toBe(false)
    expect(readSample(open, { tenant, name: 'docs' }).ok).toBe(false)
  })

  it.each(['endpoints', 'events'])('a frame says the %s may have changed', about => {
    expectRoundTrip(frame, { kind: 'changed', about })
  })

  it.each([
    ['another subject', { kind: 'changed', about: 'skills' }],
    ['no subject', { kind: 'changed' }],
    ['another kind', { kind: 'ended', about: 'endpoints' }],
  ])('refuses a frame with %s', (_label, sample) => {
    expect(readSample(frame, sample).ok).toBe(false)
  })
})
