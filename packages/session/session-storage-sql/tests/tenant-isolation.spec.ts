// Tenant isolation and default deny at every entry of the transaction port (C6, L3).
import { describe, expect, it } from 'vitest'
import { operationId } from '@omne-harness/session-contract/testing'
import { tenantEquals } from '@omne-harness/legal-identity'
import { app, TENANT_A, TENANT_B, TENANT_C, textOf } from './fixtures/app.ts'
import { kindOf, SESSION_ENTRIES, SYSTEM_ENTRIES } from './fixtures/entries.ts'

describe('a tenant that the access check does not admit', () => {
  for (const entry of SESSION_ENTRIES)
    it(`${entry.name}: denied, and nothing reaches the storage`, async () => {
      const a = await app()
      a.denyTenant(TENANT_C)
      const result = await entry.call(a, TENANT_C, 'session-1')
      expect(kindOf(result)).toBe('denied')
      expect(a.provider.calls).toEqual([])
    })

  for (const entry of SYSTEM_ENTRIES)
    it(`${entry.name}: denied by the access check, and nothing reaches the storage`, async () => {
      const a = await app()
      a.denyOperation(entry.name)
      expect(kindOf(await entry.call(a, TENANT_A, 'session-1'))).toBe('denied')
      expect(a.provider.calls).toEqual([])
    })

  it('commit: an access that names another tenant or session than the command is denied unasked', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const asked = a.accessCheck.controls.asked().length
    const calls = a.provider.calls.length
    const command = {
      kind: 'control',
      input: {
        tenant: TENANT_A,
        session: 'session-1',
        operation: operationId('archive'),
        intent: { kind: 'archive' },
      },
    } as never
    const other = await a.port.commit({
      access: a.access(TENANT_B, 'session-1'),
      command,
      guards: [],
    })
    const wrongSession = await a.port.commit({
      access: a.access(TENANT_A, 'session-2'),
      command,
      guards: [],
    })
    expect(kindOf(other)).toBe('denied')
    expect(kindOf(wrongSession)).toBe('denied')
    expect(a.accessCheck.controls.asked().length).toBe(asked)
    expect(a.provider.calls.length).toBe(calls)
  })
})

describe('a session of another tenant', () => {
  async function twoTenants() {
    const a = await app()
    await a.create(TENANT_B, 'only-b')
    await a.accept(TENANT_B, 'only-b', 'one')
    await a.create(TENANT_A, 'session-1')
    return a
  }

  for (const entry of SESSION_ENTRIES.filter(
    item => !['pending', 'history.next'].includes(item.name),
  ))
    it(`${entry.name}: tenant A gets denied for the session that only tenant B has`, async () => {
      const a = await twoTenants()
      expect(kindOf(await entry.call(a, TENANT_A, 'only-b'))).toBe('denied')
    })

  it('commit into the session of another tenant leaves that session unchanged', async () => {
    const a = await twoTenants()
    const before = await a.port.readWork(a.access(TENANT_B, 'only-b'))
    expect(kindOf(await a.accept(TENANT_A, 'only-b', 'intruder'))).toBe('denied')
    expect(await a.port.readWork(a.access(TENANT_B, 'only-b'))).toEqual(before)
  })

  it('pending lists only the sessions of the tenant that asks', async () => {
    const a = await twoTenants()
    await a.accept(TENANT_A, 'session-1', 'mine')
    const listed = await a.port.pending({
      principal: 'tester',
      tenant: TENANT_A,
      after: null,
      limit: 10,
    })
    expect(listed).toEqual({ ok: { sessions: ['session-1'], next: null } })
  })

  it('the same session name in two tenants is two sessions', async () => {
    const a = await app()
    await a.create(TENANT_A)
    await a.create(TENANT_B)
    await a.accept(TENANT_B, 'session-1', 'extra')
    const one = await a.port.readWork(a.access(TENANT_A))
    const two = await a.port.readWork(a.access(TENANT_B))
    expect('ok' in one && 'ok' in two).toBe(true)
    if ('ok' in one && 'ok' in two) {
      expect(one.ok.revision).toBe('1')
      expect(two.ok.revision).toBe('2')
      expect(tenantEquals(one.ok.tenant, TENANT_A)).toBe(true)
    }
  })
})

describe('the transaction domain of a call', () => {
  it('is the one of the tenant that the call names, for every read and write', async () => {
    const a = await app()
    for (const tenant of [TENANT_A, TENANT_B]) {
      await a.create(tenant)
      await a.accept(tenant, 'session-1', 'one')
    }
    for (const entry of [...SESSION_ENTRIES, ...SYSTEM_ENTRIES])
      for (const tenant of [TENANT_A, TENANT_B]) await entry.call(a, tenant, 'session-1')
    const named = a.provider.calls.flatMap(call => {
      if (call.kind === 'read') {
        const input = call.input as { tenant: string }
        return [[input.tenant, call.domain.scope] as const]
      }
      if (call.kind === 'commit') {
        const tenant = (call.facts as { tenant?: string }).tenant
        return tenant === undefined ? [] : [[tenant, call.identity.scope] as const]
      }
      return []
    })
    expect(named.length).toBeGreaterThan(20)
    for (const [tenant, scope] of named) expect(scope).toEqual({ kind: 'tenant', tenant })
    expect(new Set(named.map(([tenant]) => tenant))).toEqual(
      new Set([textOf(TENANT_A), textOf(TENANT_B)]),
    )
  })

  it('is refused when the directory answers the domain of another tenant', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const other = a.directory.entries[1]
    if (other === undefined) throw new Error('fixture')
    a.directory.swap = other
    const calls = a.provider.calls.length
    for (const entry of SESSION_ENTRIES) {
      const result = await entry.call(a, TENANT_A, 'session-1')
      expect(kindOf(result), entry.name).toBe('unavailable')
    }
    expect(a.provider.calls.length).toBe(calls)
  })

  it('is refused when the entry is labelled tenant A but holds the domain scope of tenant B', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const other = a.directory.entries[1]
    if (other === undefined) throw new Error('fixture')
    a.directory.swap = { tenant: textOf(TENANT_A), domain: other.domain }
    const calls = a.provider.calls.length
    for (const entry of SESSION_ENTRIES.filter(item => item.name !== 'history.next'))
      expect(kindOf(await entry.call(a, TENANT_A, 'session-1')), entry.name).toBe('unavailable')
    expect(a.provider.calls.length).toBe(calls)
  })

  it('is refused when the entry of tenant A holds a scope that is not a tenant scope', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const own = a.directory.entries[0]
    if (own === undefined) throw new Error('fixture')
    a.directory.swap = {
      tenant: textOf(TENANT_A),
      domain: {
        ...own.domain,
        // A malformed scope that still names tenant A: only its kind is wrong.
        scope: { kind: 'system', tenant: textOf(TENANT_A) } as never,
      },
    }
    const calls = a.provider.calls.length
    for (const entry of SESSION_ENTRIES.filter(item => item.name !== 'history.next'))
      expect(kindOf(await entry.call(a, TENANT_A, 'session-1')), entry.name).toBe('unavailable')
    expect(a.provider.calls.length).toBe(calls)
  })

  it('is refused when the entry is labelled another tenant but holds the domain scope of tenant A', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const own = a.directory.entries[0]
    if (own === undefined) throw new Error('fixture')
    a.directory.swap = { tenant: textOf(TENANT_B), domain: own.domain }
    const calls = a.provider.calls.length
    for (const entry of SESSION_ENTRIES.filter(item => item.name !== 'history.next'))
      expect(kindOf(await entry.call(a, TENANT_A, 'session-1')), entry.name).toBe('unavailable')
    expect(a.provider.calls.length).toBe(calls)
  })

  it('is unavailable, not empty, for a tenant that the directory does not know', async () => {
    const a = await app()
    for (const entry of SESSION_ENTRIES) {
      expect(kindOf(await entry.call(a, TENANT_C, 'session-1')), entry.name).toBe('unavailable')
    }
    expect(a.provider.calls).toEqual([])
  })
})
