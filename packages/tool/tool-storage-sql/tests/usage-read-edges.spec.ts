import { describe, expect, it } from 'vitest'
import type { LedgerUsageQuery } from '@omne-harness/tool'
import { decodeToolCallId, type ToolCallId } from '@omne-harness/tool-contract'
import type { SqlToolStorageOptions } from '../src/options.ts'
import { usageReadOver } from '../src/usage-store.ts'
import { parseUsageInput } from '../src/worker/facts.ts'
import handler from '../src/worker/read-usage.ts'
import { domainRef } from './fixtures/sqlite-storage.ts'
import { domainNameOf, TENANT_A, TENANT_B, textOf } from './fixtures/app.ts'

const domainA = domainRef(textOf(TENANT_A), domainNameOf(TENANT_A))
const call = (text: string): ToolCallId => {
  const decoded = decodeToolCallId(text)
  if ('failure' in decoded) throw new Error('fixture call')
  return decoded.ok
}
const query = (changes: Partial<LedgerUsageQuery> = {}): LedgerUsageQuery => ({
  tenant: TENANT_A,
  range: null,
  consumer: null,
  order: 'ascending',
  after: null,
  limit: 2,
  ...changes,
})
const row = (name: string) => JSON.stringify({ call: name, tool: 'Shell' })

/** The usage read over a directory and a storage that answer as given, with the inputs it sent. */
function over(
  answer: () => Promise<unknown>,
  lookup: () => Promise<unknown> = () => Promise.resolve({ kind: 'ready', domain: domainA }),
) {
  const sent: unknown[] = []
  const options = {
    domains: { lookup },
    storage: { read: (request: { input: unknown }) => (sent.push(request.input), answer()) },
    combination: { combinationVersion: '1', manifestDigest: 'd' },
  } as unknown as SqlToolStorageOptions
  return { read: usageReadOver(options), sent }
}
const unavailable = (diagnostic: string) => ({ kind: 'unavailable', diagnostic })

describe('the usage read of the SQL ledger, before and after the worker (C18)', () => {
  it('sends the checked query as the worker reads it', async () => {
    const r = over(() => Promise.resolve({ kind: 'read', output: { undated: 0, facts: [] } }))
    await r.read(query())
    await r.read(
      query({
        range: { from: 'f', to: 't' },
        consumer: { owner: 'agent', works: ['exec-1', 'exec-2'] },
        order: 'descending',
        after: { start: 's', call: call('c') },
        limit: 3,
      }),
    )
    expect(r.sent).toEqual([
      {
        tenant: textOf(TENANT_A),
        from: null,
        to: null,
        owner: null,
        works: [],
        order: 'ascending',
        afterStart: null,
        afterCall: null,
        limit: 2,
      },
      {
        tenant: textOf(TENANT_A),
        from: 'f',
        to: 't',
        owner: 'agent',
        works: ['exec-1', 'exec-2'],
        order: 'descending',
        afterStart: 's',
        afterCall: 'c',
        limit: 3,
      },
    ])
  })

  it('cuts the page at the limit and says whether more remain', async () => {
    const rows = [row('a'), row('b'), row('c')]
    const r = over(() => Promise.resolve({ kind: 'read', output: { undated: 4, facts: rows } }))
    const two = await r.read(query({ limit: 2 }))
    expect(two).toMatchObject({ kind: 'page', undated: 4, more: true })
    expect(two.kind === 'page' && two.facts.map(item => item.call)).toEqual(['a', 'b'])
    expect(await r.read(query({ limit: 3 }))).toMatchObject({ kind: 'page', more: false })
  })

  it('answers an empty page for a tenant with no domain and unavailable for the rest', async () => {
    const read = () => Promise.resolve({ kind: 'read', output: { undated: 0, facts: [] } })
    expect(await over(read, () => Promise.resolve({ kind: 'unregistered' })).read(query())).toEqual(
      { kind: 'page', facts: [], undated: 0, more: false },
    )
    expect(
      await over(read, () => Promise.resolve({ kind: 'unavailable', diagnostic: 'x' })).read(
        query(),
      ),
    ).toEqual(unavailable('tenant domain lookup: x'))
    const foreign = domainRef(textOf(TENANT_B), domainNameOf(TENANT_B))
    expect(
      await over(read, () => Promise.resolve({ kind: 'ready', domain: foreign })).read(query()),
    ).toEqual(unavailable('the tenant domain directory answered another scope'))
    const owned = { ...domainA, scope: { kind: 'organization', organization: 'o' } }
    expect(
      await over(read, () => Promise.resolve({ kind: 'ready', domain: owned })).read(query()),
    ).toEqual(unavailable('the tenant domain directory answered another scope'))
    expect(await over(read).read(query({ tenant: { organization: 1 } as never }))).toEqual(
      unavailable('not a legal tenant'),
    )
  })

  it('answers unavailable when the storage does not read, throws, or reads no usage page', async () => {
    expect(await over(() => Promise.resolve({ kind: 'cancelled' })).read(query())).toEqual(
      unavailable('usage read: cancelled'),
    )
    expect(
      await over(() =>
        Promise.resolve({ kind: 'failed', reason: 'read_failed', diagnostic: 'port' }),
      ).read(query()),
    ).toEqual(unavailable('usage read: read_failed port'))
    expect(
      await over(() => Promise.resolve({ kind: 'failed', reason: 'read_failed' })).read(query()),
    ).toEqual(unavailable('usage read: read_failed'))
    expect(await over(() => Promise.reject(new Error('down'))).read(query())).toEqual(
      unavailable('usage read: the storage threw'),
    )
    for (const output of [
      'rows',
      { undated: '0', facts: [] },
      { undated: 0, facts: 'rows' },
      { undated: 0, facts: [5] },
      { undated: 0, facts: [JSON.stringify({ tool: 'Shell' })] },
      { undated: 0, facts: [JSON.stringify('fact')] },
    ])
      expect(
        await over(() => Promise.resolve({ kind: 'read', output })).read(query()),
        JSON.stringify(output),
      ).toEqual(unavailable('usage read: the rows do not hold a usage page'))
  })
})

describe('the usage input as the worker parses it', () => {
  const valid = {
    tenant: 't',
    from: 'f',
    to: 'u',
    owner: 'agent',
    works: ['w'],
    order: 'ascending',
    afterStart: 's',
    afterCall: 'c',
    limit: 2,
  }

  it('takes a well-formed input, open or bounded, at both ends of the limit', () => {
    expect(parseUsageInput(valid)).toEqual(valid)
    const open = { ...valid, from: null, to: null, owner: null, works: [] }
    expect(parseUsageInput({ ...open, afterStart: null, afterCall: null })).toMatchObject({
      from: null,
      afterStart: null,
    })
    for (const limit of [1, 500])
      expect(parseUsageInput({ ...valid, limit })).toMatchObject({ limit })
  })

  it('refuses every malformed field', () => {
    const { tenant: _tenant, ...noTenant } = valid
    const malformed: readonly unknown[] = [
      'input',
      noTenant,
      { ...valid, from: 5 },
      { ...valid, to: 5 },
      { ...valid, owner: 5 },
      { ...valid, afterStart: 5 },
      { ...valid, afterCall: 5 },
      { ...valid, from: null },
      { ...valid, afterCall: null },
      { ...valid, works: 'w' },
      { ...valid, works: ['w', 5] },
      { ...valid, order: 'sideways' },
      { ...valid, limit: 'two' },
      { ...valid, limit: 0 },
      { ...valid, limit: 501 },
    ]
    for (const input of malformed)
      expect(parseUsageInput(input as never), JSON.stringify(input)).toBeNull()
  })

  it('makes the read handler fail a malformed input or a scope with no work, before it reads', () => {
    const port = {
      all: () => {
        throw new Error('read the port')
      },
    }
    for (const input of ['input', { ...valid, works: [] }])
      expect(handler.read(input as never, port as never), JSON.stringify(input)).toEqual({
        kind: 'failed',
        diagnostic: 'not a usage page request',
      })
  })
})
