// The system reads across tenant domains (R10 references, R11 releasedScopes; Context r3.2
// RD-CURSOR and the references flow): rows of two tenants in tenant order, the continuation across
// the tenant boundary, the directory revision that a references cursor is bound to and a released
// scopes cursor is not, and a directory entry whose domain belongs to another tenant.
import { describe, expect, it } from 'vitest'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { app, TENANT_A, TENANT_B, TENANT_C, textOf, type App } from './fixtures/app.ts'
import { kindOf } from './fixtures/entries.ts'

// Tenant text order is A < B < C. The fixture puts B in dom_0 and C in dom_1.
const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}
const failureOf = (value: unknown): Record<string, unknown> => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: Record<string, unknown> }).failure
}

type Reference = { tenant: TenantId; session: string; capability: string; shape: unknown }
type Scope = { tenant: TenantId; session: string; task: string; scope: string }
type Page<T> = { rows: T[]; next: string | null }

const resident = (
  a: App,
  domain: string,
  tenant: TenantId,
  session: string,
  key: string,
  capability: string,
) =>
  a.provider.seed(
    domain,
    'INSERT INTO sl_resident_idx (resident_key, tenant, session, capability, shape) VALUES (?, ?, ?, ?, ?)',
    [key, textOf(tenant), session, capability, JSON.stringify({ capability })],
  )
const released = (a: App, domain: string, tenant: TenantId, session: string, scope: string) =>
  a.provider.seed(
    domain,
    'INSERT INTO sl_released_scope_idx (tenant, session, scope, data) VALUES (?, ?, ?, ?)',
    [
      textOf(tenant),
      session,
      scope,
      JSON.stringify({
        tenant: { $tenant: textOf(tenant) },
        session,
        task: `sop_release-${scope}`,
        scope,
      }),
    ],
  )

async function references(a: App, after: string | null, limit: number): Promise<unknown> {
  const out = await a.port.references({
    principal: 'tester',
    scope: 'system',
    key: 'k' as never,
    after,
    limit,
  })
  return 'ok' in out ? { ok: { rows: out.ok.sessions, next: out.ok.next } } : out
}
async function scopes(a: App, after: string | null, limit: number): Promise<unknown> {
  const out = await a.port.releasedScopes({ principal: 'tester', scope: 'system', after, limit })
  return 'ok' in out ? { ok: { rows: out.ok.scopes, next: out.ok.next } } : out
}
async function walk<T>(read: (after: string | null) => Promise<unknown>): Promise<T[][]> {
  const pages: T[][] = []
  let after: string | null = null
  for (let guard = 0; guard < 50; guard += 1) {
    const page: Page<T> = ok<Page<T>>(await read(after))
    pages.push(page.rows)
    if (page.next === null) return pages
    after = page.next
  }
  throw new Error('the walk did not end')
}
const tenantOf = (row: { tenant: TenantId }): string =>
  tenantEquals(row.tenant, TENANT_A) ? 'A' : tenantEquals(row.tenant, TENANT_B) ? 'B' : 'C'
const label = (row: { tenant: TenantId; session: string }, tail: string): string =>
  `${tenantOf(row)}/${row.session}/${tail}`

async function twoTenants(): Promise<App> {
  const a = await app({ directory: [TENANT_B, TENANT_C] })
  resident(a, 'dom_0', TENANT_B, 's1', 'k', 'cap')
  resident(a, 'dom_0', TENANT_B, 's2', 'k', 'cap')
  resident(a, 'dom_0', TENANT_B, 's3', 'other-key', 'cap')
  resident(a, 'dom_1', TENANT_C, 's1', 'k', 'cap')
  resident(a, 'dom_1', TENANT_C, 's1', 'k', 'cap2')
  released(a, 'dom_0', TENANT_B, 's1', 'scope-1')
  released(a, 'dom_0', TENANT_B, 's2', 'scope-1')
  released(a, 'dom_1', TENANT_C, 's1', 'scope-1')
  released(a, 'dom_1', TENANT_C, 's1', 'scope-2')
  return a
}

describe('references over two tenants', () => {
  it('one page with room lists the rows of the key of both tenants in tenant order', async () => {
    const a = await twoTenants()
    const page = ok<Page<Reference>>(await references(a, null, 100))
    expect(page.next).toBeNull()
    expect(page.rows.map(row => label(row, row.capability))).toEqual([
      'B/s1/cap',
      'B/s2/cap',
      'C/s1/cap',
      'C/s1/cap2',
    ])
    expect(page.rows[0]?.shape).toEqual({ capability: 'cap' })
  })

  it('pages of one row walk every row exactly once, across the tenant boundary', async () => {
    const a = await twoTenants()
    const pages = await walk<Reference>(after => references(a, after, 1))
    expect(pages.flat().map(row => label(row, row.capability))).toEqual([
      'B/s1/cap',
      'B/s2/cap',
      'C/s1/cap',
      'C/s1/cap2',
    ])
    expect(pages.every(rows => rows.length <= 1)).toBe(true)
  })

  it('a continuation under the same directory revision goes on', async () => {
    const a = await twoTenants()
    const first = ok<Page<Reference>>(await references(a, null, 3))
    if (first.next === null) throw new Error('fixture: more than one page')
    const rest = ok<Page<Reference>>(await references(a, first.next, 3))
    expect(rest.rows.map(row => label(row, row.capability))).toEqual(['C/s1/cap2'])
  })

  it('a continuation after a new directory revision is invalid: a new tenant sorts before the cursor', async () => {
    const a = await twoTenants()
    const first = ok<Page<Reference>>(await references(a, null, 3))
    expect(first.rows.map(tenantOf)).toEqual(['B', 'B', 'C'])
    if (first.next === null) throw new Error('fixture: more than one page')
    const domain = await a.register(TENANT_A)
    resident(a, domain, TENANT_A, 's1', 'k', 'cap')
    const mark = a.provider.calls.length
    expect(failureOf(await references(a, first.next, 3))).toMatchObject({
      kind: 'invalid',
      field: 'cursor',
    })
    expect(a.provider.calls.length).toBe(mark)
    // A walk from the first page reads the new tenant too.
    const again = await walk<Reference>(after => references(a, after, 2))
    expect(again.flat().map(tenantOf)).toEqual(['A', 'B', 'B', 'C', 'C'])
  })
})

describe('releasedScopes over two tenants', () => {
  it('pages of two rows walk every scope of both tenants exactly once', async () => {
    const a = await twoTenants()
    const pages = await walk<Scope>(after => scopes(a, after, 2))
    expect(pages.flat().map(row => label(row, row.scope))).toEqual([
      'B/s1/scope-1',
      'B/s2/scope-1',
      'C/s1/scope-1',
      'C/s1/scope-2',
    ])
    expect(pages.flat()[0]?.task).toBe('sop_release-scope-1')
  })

  it('a continuation is not bound to the directory revision: it goes on past a new tenant that sorts before it', async () => {
    const a = await twoTenants()
    const first = ok<Page<Scope>>(await scopes(a, null, 3))
    expect(first.rows.map(tenantOf)).toEqual(['B', 'B', 'C'])
    if (first.next === null) throw new Error('fixture: more than one page')
    const domain = await a.register(TENANT_A)
    released(a, domain, TENANT_A, 's1', 'scope-1')
    const rest = ok<Page<Scope>>(await scopes(a, first.next, 3))
    expect(rest.rows.map(row => label(row, row.scope))).toEqual(['C/s1/scope-2'])
    expect(rest.next).toBeNull()
  })
})

describe('a directory entry whose domain is not the domain of its tenant', () => {
  const reads = [
    ['references', (a: App) => references(a, null, 10)],
    ['releasedScopes', (a: App) => scopes(a, null, 10)],
  ] as const
  for (const [name, read] of reads)
    it(`${name}: unavailable, and no read of the swapped entry reaches the other domain`, async () => {
      const a = await twoTenants()
      const [b, c] = a.directory.entries
      if (b === undefined || c === undefined) throw new Error('fixture')
      // C's entry names B's domain: a swap in the directory.
      a.directory.entries[1] = { tenant: c.tenant, domain: b.domain }
      const mark = a.provider.calls.length
      expect(kindOf(await read(a))).toBe('unavailable')
      const sent = a.provider.calls.slice(mark).filter(call => call.kind === 'read')
      expect(sent.every(call => (call.input as { tenant: string }).tenant === b.tenant)).toBe(true)
    })

  for (const [name, read] of reads)
    it(`${name}: an entry whose tenant text is not a minted tenant is unavailable, not skipped`, async () => {
      const a = await twoTenants()
      // The domain really exists under that text, so only the tenant check of the walk refuses it.
      const domain = {
        scope: { kind: 'tenant' as const, tenant: 'not-a-tenant' },
        transactionDomain: 'dom_unminted',
      }
      await a.provider.storage.registerCombination({
        ...domain,
        combinationVersion: 'c1',
        manifestDigest: 'a'.repeat(64),
        participants: ['session'],
      })
      resident(a, 'dom_unminted', TENANT_B, 's9', 'k', 'cap')
      a.provider.seed('dom_unminted', 'UPDATE sl_resident_idx SET tenant = ? WHERE session = ?', [
        'not-a-tenant',
        's9',
      ])
      released(a, 'dom_unminted', TENANT_B, 's9', 'scope-9')
      a.provider.seed(
        'dom_unminted',
        'UPDATE sl_released_scope_idx SET tenant = ? WHERE session = ?',
        ['not-a-tenant', 's9'],
      )
      a.directory.entries[1] = { tenant: 'not-a-tenant', domain }
      expect(kindOf(await read(a))).toBe('unavailable')
    })
})
