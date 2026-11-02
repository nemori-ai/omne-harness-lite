// R9 / SS-17: the system reads of the Session storage (R10 references, R11 releasedScopes) over
// the real sqlite-provider: real files, the real read Worker pool and tenant domains that hold
// their own rows. The index rows are written straight into the domain files, so these cases
// verify the read path only, not the maintenance of the index by a commit (W3). Session storage
// adapters, the application seams and a revocation across processes are not covered here.
// @module-tag slow
// Why slow: real Workers and real files; every case opens a provider twice.
import { afterEach, describe, expect, it } from 'vitest'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  openSystemReads,
  TENANT_A,
  TENANT_B,
  type SystemReads,
  type SystemRows,
} from './fixtures/real-system-reads.ts'

const opened: SystemReads[] = []
afterEach(async () => {
  for (const app of opened.splice(0)) await app.dispose()
})

// Tenant A sorts before tenant B. The domain of A holds one row of B that no walk may return.
const ROWS: SystemRows = {
  residents: [
    { domain: TENANT_A, session: 'a1', key: 'k', capability: 'cap' },
    { domain: TENANT_A, session: 'a2', key: 'k', capability: 'cap' },
    { domain: TENANT_A, session: 'a3', key: 'other-key', capability: 'cap' },
    { domain: TENANT_A, tenant: TENANT_B, session: 'stray', key: 'k', capability: 'cap' },
    { domain: TENANT_B, session: 'b1', key: 'k', capability: 'cap' },
    { domain: TENANT_B, session: 'b1', key: 'k', capability: 'cap2' },
    { domain: TENANT_B, session: 'b2', key: 'other-key', capability: 'cap' },
  ],
  released: [
    { domain: TENANT_A, session: 'a1', scope: 'scope-1' },
    { domain: TENANT_A, session: 'a2', scope: 'scope-1' },
    { domain: TENANT_A, tenant: TENANT_B, session: 'stray', scope: 'scope-1' },
    { domain: TENANT_B, session: 'b1', scope: 'scope-1' },
    { domain: TENANT_B, session: 'b1', scope: 'scope-2' },
  ],
}
const REFERENCES = ['A/a1/cap', 'A/a2/cap', 'B/b1/cap', 'B/b1/cap2']
const SCOPES = ['A/a1/scope-1', 'A/a2/scope-1', 'B/b1/scope-1', 'B/b1/scope-2']

async function open(): Promise<SystemReads> {
  const app = await openSystemReads(ROWS)
  opened.push(app)
  return app
}

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}
const failureOf = (value: unknown): Record<string, unknown> => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: Record<string, unknown> }).failure
}

type Row = { tenant: TenantId; session: string }
type Page = { rows: Row[]; labels: string[]; next: string | null }

const tenantOf = (tenant: TenantId): string => (tenantEquals(tenant, TENANT_A) ? 'A' : 'B')

async function references(
  app: SystemReads,
  after: string | null,
  limit: number,
  key = 'k',
): Promise<unknown> {
  const out = await app.port.references({
    principal: 'tester',
    scope: 'system',
    key: key as never,
    after,
    limit,
  })
  if (!('ok' in out)) return out
  const rows = out.ok.sessions as unknown as (Row & { capability: string })[]
  return {
    ok: {
      rows,
      labels: rows.map(row => `${tenantOf(row.tenant)}/${row.session}/${row.capability}`),
      next: out.ok.next,
    },
  }
}
async function scopes(app: SystemReads, after: string | null, limit: number): Promise<unknown> {
  const out = await app.port.releasedScopes({ principal: 'tester', scope: 'system', after, limit })
  if (!('ok' in out)) return out
  const rows = out.ok.scopes as unknown as (Row & { scope: string })[]
  return {
    ok: {
      rows,
      labels: rows.map(row => `${tenantOf(row.tenant)}/${row.session}/${row.scope}`),
      next: out.ok.next,
    },
  }
}
async function walk(read: (after: string | null) => Promise<unknown>): Promise<Page[]> {
  const pages: Page[] = []
  let after: string | null = null
  for (let guard = 0; guard < 50; guard += 1) {
    const page: Page = ok<Page>(await read(after))
    pages.push(page)
    if (page.next === null) return pages
    after = page.next
  }
  throw new Error('the walk did not end')
}

describe('R9 SS-17 references over two tenants on the real provider', () => {
  it('SS-17 one page lists the rows of the key of both tenants in tenant order', async () => {
    const app = await open()
    const page = ok<Page>(await references(app, null, 100))
    expect(page.labels).toEqual(REFERENCES)
    expect(page.next).toBeNull()
  })

  it('SS-17 pages of one row walk every row exactly once, across the tenant boundary', async () => {
    const app = await open()
    const pages = await walk(after => references(app, after, 1))
    expect(pages.flatMap(page => page.labels)).toEqual(REFERENCES)
    expect(pages.every(page => page.rows.length <= 1)).toBe(true)
  })

  it('SS-17 the rows of one tenant come from its own domain and carry its tenant', async () => {
    const app = await open()
    const page = ok<Page>(await references(app, null, 100))
    // The domain of A holds a row of the tenant B (`stray`); it appears in no result.
    expect(page.rows.some(row => row.session === 'stray')).toBe(false)
    expect(page.rows.filter(row => tenantOf(row.tenant) === 'A').map(row => row.session)).toEqual([
      'a1',
      'a2',
    ])
    expect(page.rows.filter(row => tenantOf(row.tenant) === 'B').map(row => row.session)).toEqual([
      'b1',
      'b1',
    ])
  })

  it('SS-17 a cursor of one key is invalid for another key and goes on for its own key', async () => {
    const app = await open()
    const first = ok<Page>(await references(app, null, 1))
    if (first.next === null) throw new Error('fixture: more than one page')
    expect(failureOf(await references(app, first.next, 1, 'other-key'))).toMatchObject({
      kind: 'invalid',
      field: 'cursor',
    })
    const rest = ok<Page>(await references(app, first.next, 1))
    expect(rest.labels).toEqual(['A/a2/cap'])
  })

  it('SS-17 a cursor after a new directory revision is invalid', async () => {
    const app = await open()
    const first = ok<Page>(await references(app, null, 1))
    if (first.next === null) throw new Error('fixture: more than one page')
    app.directory.revision = '2'
    expect(failureOf(await references(app, first.next, 1))).toMatchObject({
      kind: 'invalid',
      field: 'cursor',
    })
  })
})

describe('R9 SS-17 releasedScopes over two tenants on the real provider', () => {
  it('SS-17 pages of one row walk the scopes of both tenants exactly once', async () => {
    const app = await open()
    const pages = await walk(after => scopes(app, after, 1))
    expect(pages.flatMap(page => page.labels)).toEqual(SCOPES)
    expect(pages.every(page => page.rows.length <= 1)).toBe(true)
  })

  it('SS-17 the scopes of one tenant come from its own domain and carry its tenant', async () => {
    const app = await open()
    const page = ok<Page>(await scopes(app, null, 100))
    expect(page.labels).toEqual(SCOPES)
    expect(page.rows.some(row => row.session === 'stray')).toBe(false)
  })

  it('SS-17 a cursor goes on after a new directory revision', async () => {
    const app = await open()
    const first = ok<Page>(await scopes(app, null, 1))
    if (first.next === null) throw new Error('fixture: more than one page')
    app.directory.revision = '2'
    const rest = ok<Page>(await scopes(app, first.next, 10))
    expect(rest.labels).toEqual(SCOPES.slice(1))
  })
})

describe('R9 SS-17 a system read without access or without a directory', () => {
  it('SS-17 an access decision that does not allow the system read answers denied and reads no domain', async () => {
    const app = await open()
    app.deny('references')
    app.deny('releasedScopes')
    expect(failureOf(await references(app, null, 10))).toEqual({
      kind: 'denied',
      action: 'references',
    })
    expect(failureOf(await scopes(app, null, 10))).toEqual({
      kind: 'denied',
      action: 'releasedScopes',
    })
    expect(app.reads).toEqual([])
  })

  it('SS-17 a directory that cannot be read is unavailable, not an empty page', async () => {
    const app = await open()
    app.directory.readable = false
    expect(failureOf(await references(app, null, 10))).toMatchObject({ kind: 'unavailable' })
    expect(failureOf(await scopes(app, null, 10))).toMatchObject({ kind: 'unavailable' })
    expect(app.reads).toEqual([])
  })
})
