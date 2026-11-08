import { describe, expect, it } from 'vitest'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'

function current(a: App, tenant = TENANT_A, session = 'session-1') {
  return a.provider.storage.read({
    domain: a.directory.entries[0]!.domain,
    requestKey: 'permission-current-test',
    handler: 'session.permission-current',
    protocol: '1',
    input: { tenant: textOf(tenant), session, capabilityId: 'calendar', enforcementKey: 'create' },
  })
}

describe('Session current permission relation', () => {
  it('reads the original creation mode and empty assignment without loading the snapshot', async () => {
    const a = await app()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    a.provider.readSql.length = 0
    expect(await current(a)).toMatchObject({
      kind: 'read',
      output: {
        kind: 'current',
        tenant: textOf(TENANT_A),
        session: 'session-1',
        capabilityId: 'calendar',
        enforcementKey: 'create',
        revision: '0',
        assignment: null,
        mode: { override: null },
      },
    })
    expect(a.provider.readSql).toHaveLength(2)
    expect(a.provider.readSql.every(sql => !/\bsl_(state|state_item|entry)\b/.test(sql))).toBe(true)
  })

  it('distinguishes an unready session from a ready session without an assignment', async () => {
    const a = await app()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    for (const [tenant, session] of [
      [TENANT_B, 'session-1'],
      [TENANT_A, 'missing'],
    ] as const)
      expect(await current(a, tenant, session)).toMatchObject({
        kind: 'read',
        output: { kind: 'not-ready' },
      })
  })

  it('changes the permission revision on a mode change only once, not on ordinary intake', async () => {
    const a = await app()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(await a.accept(TENANT_A, 'session-1', 'ordinary')).toHaveProperty('ok')
    const access = a.access(TENANT_A)
    const command = {
      kind: 'change' as const,
      input: {
        tenant: TENANT_A,
        session: access.session,
        operation: operationId('permission-mode-change'),
        declaration: {
          kind: 'permission-mode' as const,
          value: 'never' as const,
          authorization: evidence('mode-policy-fixture'),
        },
      },
    }
    expect(await current(a)).toMatchObject({ kind: 'read', output: { revision: '0' } })
    const committed = await a.port.commit({ access, command, guards: [] })
    expect(committed, JSON.stringify(committed)).toHaveProperty('ok')
    const changed = await current(a)
    expect(changed).toMatchObject({
      kind: 'read',
      output: {
        revision: '1',
        mode: { override: { value: 'never' } },
        assignment: null,
      },
    })
    expect(await a.port.commit({ access, command, guards: [] })).toHaveProperty('ok')
    expect(await current(a)).toEqual(changed)
  })

  it('rolls the event and snapshot back when their permission projection cannot be written', async () => {
    const a = await app()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    const access = a.access(TENANT_A)
    const before = await a.port.readWork(access)
    const projection = await current(a)
    const command = {
      kind: 'change' as const,
      input: {
        tenant: TENANT_A,
        session: access.session,
        operation: operationId('failed-mode-change'),
        declaration: {
          kind: 'permission-mode' as const,
          value: 'never' as const,
          authorization: evidence('mode-policy-fixture'),
        },
      },
    }
    a.provider.failWrite(/UPDATE sl_permission_head/)
    expect(await a.port.commit({ access, command, guards: [] })).toHaveProperty('failure')
    expect(await a.port.readWork(access)).toEqual(before)
    expect(await current(a)).toEqual(projection)
    a.provider.failWrite(null)
    expect(await a.port.commit({ access, command, guards: [] })).toHaveProperty('ok')
    expect(await current(a)).toMatchObject({ kind: 'read', output: { revision: '1' } })
  })
})
