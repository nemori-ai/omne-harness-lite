// 调用域的待办标记在 SQLite 上的兑现：标记与调用域的记录同一事务，主键 `(tenant, call)` 是扫描的
// 索引，关闭重开后仍在；在 002 之前就已迁移的事务域，下次打开时补上标记表。数据库直接检查，
// 不只经端口。
import { afterEach, describe, expect, it } from 'vitest'
import type { LedgerCommitInput, LedgerDomain } from '@omne-harness/tool'
import { decodeToolCallId, type ToolCallId } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import participant from '../src/worker/participant.ts'
import { createSqlToolLedgerStore } from '../src/index.ts'
import {
  domainNameOf,
  openApp,
  SUITE_TENANTS,
  TENANT_A,
  TENANT_B,
  textOf,
  UNREGISTERED,
  type App,
} from './fixtures/app.ts'
import { domainRef, migratedPort } from './fixtures/sqlite-storage.ts'

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

async function app(input: Parameters<typeof openApp>[0] = {}): Promise<App> {
  const created = await openApp(input)
  opened.push(created)
  return created
}

function decoded<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error('fixture identity is not legal')
  return answer.ok
}

const call = (text: string): ToolCallId => decoded(decodeToolCallId(text))
const domainOf = (text: string, tenant = TENANT_A): LedgerDomain => ({
  kind: 'call',
  tenant,
  call: call(text),
})

function commitOf(domain: LedgerDomain, expected: string, pending: boolean): LedgerCommitInput {
  return {
    domain,
    expected: decoded(decodeToolRevision(expected)),
    revision: decoded(decodeToolRevision(String(Number(expected) + 1))),
    writes: [{ kind: 'put', record: { kind: 'host', host: { key: 'a', value: expected } } }],
    pending,
  }
}

function markers(a: App, tenant = TENANT_A) {
  return a.sqlite.inspect(
    domainNameOf(tenant),
    'SELECT call FROM tl_pending WHERE tenant = ? ORDER BY call',
    [textOf(tenant)],
  )
}

function records(a: App) {
  return a.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT key FROM tl_record WHERE tenant = ?', [
    textOf(TENANT_A),
  ])
}

describe('the pending marker of a call domain', () => {
  it('is written by the participant in the transaction of the call records', async () => {
    const a = await app()
    expect(await a.store.commit(commitOf(domainOf('c1'), '0', true))).toEqual({
      kind: 'committed',
    })
    expect(markers(a)).toEqual([{ call: 'c1' }])
    expect(await a.store.commit(commitOf(domainOf('c1'), '1', false))).toEqual({
      kind: 'committed',
    })
    expect(markers(a)).toEqual([])
  })

  it('goes with the call domain when the domain is dropped, and leaves the marker of another call', async () => {
    const a = await app()
    for (const text of ['c1', 'c2']) await a.store.commit(commitOf(domainOf(text), '0', true))
    expect(
      await a.store.commit({
        domain: domainOf('c1'),
        expected: decoded(decodeToolRevision('1')),
        revision: decoded(decodeToolRevision('0')),
        writes: [{ kind: 'drop' }],
      }),
    ).toEqual({ kind: 'committed' })
    // A dropped call owes no work: a marker left behind would be listed by every later scan.
    expect(markers(a)).toEqual([{ call: 'c2' }])
    expect(records(a)).toHaveLength(1)
  })

  it('rolls back with the records when its own statement fails, and the records roll it back', async () => {
    const a = await app()
    // Statement 1 reads the revision, 2 writes the record, 3 sets the revision, 4 writes the marker.
    // A failed statement is a definite refusal of this commit (TS-02): `rejected`, nothing written.
    a.sqlite.failStatement(4)
    expect((await a.store.commit(commitOf(domainOf('c1'), '0', true))).kind).toBe('rejected')
    expect({ records: records(a), markers: markers(a) }).toEqual({ records: [], markers: [] })
    a.sqlite.failStatement(2)
    expect((await a.store.commit(commitOf(domainOf('c1'), '0', true))).kind).toBe('rejected')
    expect({ records: records(a), markers: markers(a) }).toEqual({ records: [], markers: [] })
  })

  it('is not sent for a domain that is not a call domain, and the participant refuses one', async () => {
    const a = await app()
    const host: LedgerDomain = { kind: 'host', tenant: TENANT_A, key: 'h1' }
    expect(await a.store.commit({ ...commitOf(domainOf('c1'), '0', true), domain: host })).toEqual({
      kind: 'committed',
    })
    expect(markers(a)).toEqual([])
    const { port, rows } = migratedPort()
    const facts = {
      tenant: 'tenant-a',
      kind: 'host',
      name: 'h1',
      intent: 'ledger',
      expected: '0',
      revision: '1',
      writes: [],
      asserts: [],
      pending: true,
    }
    expect(participant.execute(facts, port)).toEqual({
      kind: 'unsupported',
      basis: { reason: 'facts' },
    })
    expect(
      participant.execute({ ...facts, kind: 'call', name: 'c1', pending: 'yes' }, port),
    ).toEqual({ kind: 'unsupported', basis: { reason: 'facts' } })
    expect(rows('SELECT COUNT(*) AS n FROM tl_pending')).toEqual([{ n: 0n }])
  })

  it('survives a close and a reopen of the storage', async () => {
    const first = await openApp({ keep: true })
    await first.store.commit(commitOf(domainOf('c1'), '0', true))
    first.sqlite.close()
    const second = await app({ directory: first.directory })
    expect(await second.store.scanPending({ tenant: null, after: null, limit: 10 })).toEqual({
      kind: 'page',
      calls: [{ tenant: expect.objectContaining({ name: 'TenantId' }), call: 'c1' }],
      more: false,
    })
  })

  it('reaches a domain that was migrated before the marker table: the next open adds the table', async () => {
    const first = await openApp({ keep: true })
    await first.store.commit(commitOf(domainOf('old'), '0', false))
    // The domain as the baseline migration alone left it: no marker table, no record of the second.
    const name = domainNameOf(TENANT_A)
    first.sqlite.inspect(name, 'DROP TABLE tl_pending')
    first.sqlite.inspect(name, "DELETE FROM _sql_migration WHERE id = 'r6-002-tool-pending'")
    first.sqlite.close()
    const second = await app({ directory: first.directory })
    expect(await second.store.commit(commitOf(domainOf('old'), '1', true))).toEqual({
      kind: 'committed',
    })
    expect(markers(second)).toEqual([{ call: 'old' }])
  })

  it('pages through the primary key range of one tenant, without a scan of the table', async () => {
    const a = await app()
    for (const text of ['c1', 'c2', 'c3']) await a.store.commit(commitOf(domainOf(text), '0', true))
    const plan = a.sqlite.inspect(
      domainNameOf(TENANT_A),
      'EXPLAIN QUERY PLAN SELECT call FROM tl_pending WHERE tenant = ? AND call > ? ORDER BY call LIMIT ?',
      [textOf(TENANT_A), 'c1', 2n],
    )
    expect(plan.map(row => String(row['detail']))).toEqual([
      expect.stringMatching(/^SEARCH tl_pending USING PRIMARY KEY \(tenant=\? AND call>\?\)$/u),
    ])
    expect(
      await a.store.scanPending({
        tenant: TENANT_A,
        after: { tenant: TENANT_A, call: call('c1') },
        limit: 1,
      }),
    ).toMatchObject({ kind: 'page', calls: [{ call: 'c2' }], more: true })
  })
})

describe('a scan the store cannot answer', () => {
  it('answers unavailable across tenants when the tenant listing is denied, unavailable or throws, and serves one tenant', async () => {
    const a = await app()
    await a.store.commit(commitOf(domainOf('c1'), '0', true))
    for (const tenants of [
      async () => ({ kind: 'denied' as const }),
      async () => ({ kind: 'unavailable' as const, diagnostic: 'down' }),
      async () => Promise.reject(new Error('broken')),
    ]) {
      const store = createSqlToolLedgerStore({ ...a.options, tenants })
      expect(await store.scanPending({ tenant: null, after: null, limit: 10 })).toMatchObject({
        kind: 'unavailable',
      })
      expect(await store.scanPending({ tenant: TENANT_A, after: null, limit: 10 })).toMatchObject({
        kind: 'page',
        calls: [{ call: 'c1' }],
      })
    }
  })

  it('answers unavailable for a tenant scan whose cursor names another tenant', async () => {
    const a = await app()
    expect(
      await a.store.scanPending({
        tenant: TENANT_A,
        after: { tenant: TENANT_B, call: call('c1') },
        limit: 10,
      }),
    ).toMatchObject({ kind: 'unavailable' })
  })
})

/** The first three suite tenants, in the order of their tenant texts: the order of a scan. */
const ORDERED = SUITE_TENANTS.slice(0, 3).sort((a, b) => (textOf(a) < textOf(b) ? -1 : 1))
const [FIRST, MIDDLE, LAST] = ORDERED as [
  (typeof ORDERED)[0],
  (typeof ORDERED)[0],
  (typeof ORDERED)[0],
]

const entryOf = (tenant: (typeof ORDERED)[0]) => ({
  tenant: textOf(tenant),
  domain: domainRef(textOf(tenant), domainNameOf(tenant)),
})

/** A store whose directory lists `tenants` in the given order. */
const listing = (a: App, tenants: readonly (typeof ORDERED)[0][]) =>
  createSqlToolLedgerStore({
    ...a.options,
    tenants: async () => ({ kind: 'ready', revision: '1', entries: tenants.map(entryOf) }),
  })

const namesOf = (answer: Awaited<ReturnType<App['store']['scanPending']>>) =>
  answer.kind === 'page' ? answer.calls.map(entry => [textOf(entry.tenant), entry.call]) : answer

describe('the scan of every tenant', () => {
  /** Two markers in the first tenant, one in the middle one, two in the last. */
  async function marked() {
    const a = await app()
    for (const [text, tenant] of [
      ['c1', FIRST],
      ['c2', FIRST],
      ['c3', MIDDLE],
      ['c4', LAST],
      ['c5', LAST],
    ] as const)
      await a.store.commit(commitOf(domainOf(text, tenant), '0', true))
    // The directory lists the tenants in another order than the scan answers them.
    return listing(a, [LAST, FIRST, MIDDLE])
  }

  it('lists the tenants in the order of their texts, whatever order the directory lists them in', async () => {
    const store = await marked()
    const page = await store.scanPending({ tenant: null, after: null, limit: 10 })
    expect(namesOf(page)).toEqual([
      [textOf(FIRST), 'c1'],
      [textOf(FIRST), 'c2'],
      [textOf(MIDDLE), 'c3'],
      [textOf(LAST), 'c4'],
      [textOf(LAST), 'c5'],
    ])
    expect(page).toMatchObject({ more: false })
  })

  it('says there is more when a full page ends a tenant that is not the last, and goes on after the cursor', async () => {
    const store = await marked()
    const first = await store.scanPending({ tenant: null, after: null, limit: 2 })
    expect(namesOf(first)).toEqual([
      [textOf(FIRST), 'c1'],
      [textOf(FIRST), 'c2'],
    ])
    expect(first).toMatchObject({ more: true })
    // The cursor is in the middle tenant: the first tenant is not read again.
    const rest = await store.scanPending({
      tenant: null,
      after: { tenant: MIDDLE, call: call('c3') },
      limit: 10,
    })
    expect(namesOf(rest)).toEqual([
      [textOf(LAST), 'c4'],
      [textOf(LAST), 'c5'],
    ])
    expect(rest).toMatchObject({ more: false })
  })

  it('says there is more when the last tenant holds rows after the page', async () => {
    const store = await marked()
    const page = await store.scanPending({
      tenant: null,
      after: { tenant: MIDDLE, call: call('c3') },
      limit: 1,
    })
    expect(namesOf(page)).toEqual([[textOf(LAST), 'c4']])
    expect(page).toMatchObject({ more: true })
  })

  it('says there is no more when a full page ends the last tenant', async () => {
    const store = await marked()
    const page = await store.scanPending({
      tenant: null,
      after: { tenant: MIDDLE, call: call('c3') },
      limit: 2,
    })
    expect(namesOf(page)).toEqual([
      [textOf(LAST), 'c4'],
      [textOf(LAST), 'c5'],
    ])
    expect(page).toMatchObject({ more: false })
  })

  it('says there is no more when one tenant holds as many rows as the page asks', async () => {
    const a = await app()
    for (const text of ['c1', 'c2']) await a.store.commit(commitOf(domainOf(text), '0', true))
    expect(await a.store.scanPending({ tenant: TENANT_A, after: null, limit: 2 })).toMatchObject({
      kind: 'page',
      calls: [{ call: 'c1' }, { call: 'c2' }],
      more: false,
    })
  })

  it.each([
    ['a text that is no tenant', { ...entryOf(TENANT_A), tenant: 'not-a-tenant' }],
    [
      'a text that is no tenant, in a domain that names the same text',
      { tenant: 'not-a-tenant', domain: domainRef('not-a-tenant', domainNameOf(TENANT_A)) },
    ],
    [
      'a domain that is not a tenant domain',
      { ...entryOf(TENANT_A), domain: { ...entryOf(TENANT_A).domain, scope: { kind: 'global' } } },
    ],
    ['the domain of another tenant', { ...entryOf(TENANT_A), domain: entryOf(TENANT_B).domain }],
  ])('refuses the whole page for a directory entry with %s', async (_name, entry) => {
    const a = await app()
    await a.store.commit(commitOf(domainOf('c1'), '0', true))
    const store = createSqlToolLedgerStore({
      ...a.options,
      tenants: async () => ({ kind: 'ready', revision: '1', entries: [entry as never] }),
    })
    expect(await store.scanPending({ tenant: null, after: null, limit: 10 })).toEqual({
      kind: 'unavailable',
      diagnostic: 'the tenant domain directory holds an entry of no tenant',
    })
  })
})

describe('why a scan is unavailable', () => {
  it('names the failure of the tenant listing', async () => {
    const a = await app()
    const diagnosticOf = async (
      tenants: Parameters<typeof createSqlToolLedgerStore>[0]['tenants'],
    ) =>
      createSqlToolLedgerStore({ ...a.options, tenants }).scanPending({
        tenant: null,
        after: null,
        limit: 10,
      })
    expect(await diagnosticOf(async () => ({ kind: 'denied' }))).toEqual({
      kind: 'unavailable',
      diagnostic: 'tenant directory: the listing was denied',
    })
    expect(await diagnosticOf(async () => ({ kind: 'unavailable', diagnostic: 'down' }))).toEqual({
      kind: 'unavailable',
      diagnostic: 'tenant directory: down',
    })
    expect(await diagnosticOf(() => Promise.reject(new Error('secret')))).toEqual({
      kind: 'unavailable',
      diagnostic: 'tenant directory: the listing threw',
    })
  })

  it('names a tenant the directory does not hold, a cursor of another tenant and a cursor of no tenant', async () => {
    const a = await app()
    const unregistered = await a.store.scanPending({ tenant: UNREGISTERED, after: null, limit: 10 })
    expect(unregistered).toMatchObject({ kind: 'unavailable', diagnostic: expect.any(String) })
    expect(
      await a.store.scanPending({
        tenant: TENANT_A,
        after: { tenant: TENANT_B, call: call('c1') },
        limit: 10,
      }),
    ).toEqual({ kind: 'unavailable', diagnostic: 'the scan cursor names another tenant' })
    const noTenant = { organization: { text: 'x' }, account: { text: 'y' } }
    expect(
      await a.store.scanPending({
        tenant: null,
        after: { tenant: noTenant as never, call: call('c1') },
        limit: 10,
      }),
    ).toEqual({ kind: 'unavailable', diagnostic: 'not a legal tenant' })
  })

  /** A store whose pending read answers `answer` instead of reading. */
  function answering(a: App, answer: unknown) {
    const inner = a.options.storage
    const storage = Object.assign(Object.create(inner) as typeof inner, {
      read: (request: Parameters<typeof inner.read>[0]) =>
        request.handler === 'tool.ledger.pending'
          ? Promise.resolve(answer as never)
          : inner.read(request),
    })
    return createSqlToolLedgerStore({ ...a.options, storage })
  }

  it.each([
    [{ kind: 'failed', reason: 'disk' }, 'pending read: disk'],
    [{ kind: 'cancelled' }, 'pending read: cancelled'],
    [{ kind: 'read', output: 'rows' }, 'pending read: the rows do not hold a pending page'],
    [
      { kind: 'read', output: { calls: 'c1', more: false } },
      'pending read: the rows do not hold a pending page',
    ],
    [
      { kind: 'read', output: { calls: [1], more: false } },
      'pending read: the rows do not hold a pending page',
    ],
    [
      { kind: 'read', output: { calls: ['c1'], more: 'no' } },
      'pending read: the rows do not hold a pending page',
    ],
    [
      { kind: 'read', output: { calls: [''], more: false } },
      'pending read: a row holds no call identity',
    ],
  ])(
    'answers unavailable, not a shorter page, when the storage answers %j',
    async (answer, diagnostic) => {
      const a = await app()
      const store = answering(a, answer)
      const unavailable = { kind: 'unavailable', diagnostic }
      expect(await store.scanPending({ tenant: TENANT_A, after: null, limit: 10 })).toEqual(
        unavailable,
      )
      expect(await store.scanPending({ tenant: null, after: null, limit: 10 })).toEqual(unavailable)
    },
  )
})
