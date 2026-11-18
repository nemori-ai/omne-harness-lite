import { describe, expect, it } from 'vitest'
import type { AuthorizationExpression, SessionCommand } from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { decodeSessionPermissionRead } from '../src/permission-current.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'

const consumer = (position: string) => ({
  owner: '@omne-harness/agent',
  work: 'run_1/execution',
  position,
})
const once = (
  position: string,
  direction: AuthorizationExpression['direction'] = 'grant',
): AuthorizationExpression => ({
  scope: { kind: 'once', consumer: consumer(position), target: 'Shell#1', argumentsDigest: 'd' },
  direction,
  source: evidence(`decision/${position}`),
})
const forGate = (
  capabilityId: string,
  direction: AuthorizationExpression['direction'] = 'grant',
  basis = 'rev-1',
): AuthorizationExpression => ({
  scope: { kind: 'session', capabilityId, enforcementKey: 'tool.invoke', basis },
  direction,
  source: evidence(`decision/${capabilityId}/${direction}/${basis}`),
})

function expressing(a: App, expression: AuthorizationExpression, name: string): SessionCommand {
  return {
    kind: 'change',
    input: {
      tenant: TENANT_A,
      session: a.access(TENANT_A).session,
      operation: operationId(name),
      declaration: {
        kind: 'authorization-expression',
        expression,
        authorization: evidence('authorization-expression-policy'),
      },
    },
  }
}

async function express(a: App, expression: AuthorizationExpression, name: string) {
  const committed = await a.port.commit({
    access: a.access(TENANT_A),
    command: expressing(a, expression, name),
    guards: [],
  })
  expect(committed, JSON.stringify(committed)).toHaveProperty('ok')
}

type Asked = Readonly<{ capabilityId?: string; position?: string; tenant?: typeof TENANT_A }>

async function current(a: App, asked: Asked = {}) {
  const read = await a.provider.storage.read({
    domain: a.directory.entries[0]!.domain,
    requestKey: 'authorization-context-test',
    handler: 'session.permission-current',
    protocol: '1',
    input: {
      tenant: textOf(asked.tenant ?? TENANT_A),
      session: 'session-1',
      capabilityId: asked.capabilityId ?? 'Shell',
      enforcementKey: 'tool.invoke',
      ...(asked.position === undefined ? {} : { consumer: consumer(asked.position) }),
    },
  })
  if (read.kind !== 'read') throw new Error(JSON.stringify(read))
  const decoded = decodeSessionPermissionRead(read.output)
  if (decoded === 'malformed') throw new Error(`malformed: ${JSON.stringify(read.output)}`)
  return decoded
}

const authorizations = async (a: App, asked: Asked = {}) => {
  const read = await current(a, asked)
  return read.kind === 'current' ? read.authorizations : null
}

describe('the authorizations the permission read answers with', () => {
  it('answers none, at revision zero, for a session nobody authorized in', async () => {
    const a = await app()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(await authorizations(a, { position: 'step-1/tool/0' })).toEqual({
      revision: '0',
      once: null,
      session: null,
    })
  })

  it('answers an authorization right after its commit, by its key, without moving the permission revision', async () => {
    const a = await app()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    await express(a, once('step-1/tool/0'), 'grant-once')
    await express(a, forGate('Shell'), 'grant-session')
    a.provider.readSql.length = 0
    const read = await current(a, { position: 'step-1/tool/0' })
    expect(read).toMatchObject({
      revision: '0',
      authorizations: {
        revision: '2',
        once: { consumer: consumer('step-1/tool/0'), target: 'Shell#1', argumentsDigest: 'd' },
        session: { capabilityId: 'Shell', enforcementKey: 'tool.invoke', basis: 'rev-1' },
      },
    })
    expect(a.provider.readSql).toHaveLength(5)
    expect(a.provider.readSql.every(sql => !/\bsl_(state|state_item|entry)\b/.test(sql))).toBe(true)
  })

  it('reads no once row for a read that names no action: one statement less', async () => {
    const a = await app()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    await express(a, once('step-1/tool/0'), 'grant-once')
    a.provider.readSql.length = 0
    expect(await authorizations(a)).toMatchObject({ revision: '1', once: null })
    expect(a.provider.readSql).toHaveLength(4)
    expect(a.provider.readSql.some(sql => sql.includes('sl_authorization_once'))).toBe(false)
  })

  it('answers only the action and the gate the read names', async () => {
    const a = await app()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    await express(a, once('step-1/tool/0'), 'grant-once')
    await express(a, forGate('Shell'), 'grant-session')
    expect(await authorizations(a, { position: 'step-1/tool/1' })).toMatchObject({ once: null })
    expect(await authorizations(a)).toMatchObject({ once: null, session: { basis: 'rev-1' } })
    expect(
      await authorizations(a, { capabilityId: 'Files', position: 'step-1/tool/0' }),
    ).toMatchObject({ once: { target: 'Shell#1' }, session: null })
    expect(await current(a, { tenant: TENANT_B })).toEqual({ kind: 'not-ready' })
  })

  it('keeps one entry and one row when the same operation is committed again', async () => {
    const a = await app()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    await express(a, once('step-1/tool/0'), 'grant-once')
    await express(a, once('step-1/tool/0'), 'grant-once')
    const entries = a.provider.select(
      'dom_0',
      "SELECT COUNT(*) FROM sl_entry WHERE kind = 'session.authorization-expressed'",
    )
    expect(entries.rows).toEqual([[1n]])
    expect(await authorizations(a, { position: 'step-1/tool/0' })).toMatchObject({ revision: '1' })
  })

  it('keeps the latest session authorization of a gate and drops what is revoked', async () => {
    const a = await app()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    await express(a, forGate('Shell'), 'grant-shell')
    await express(a, forGate('Shell', 'grant', 'rev-2'), 'grant-shell-again')
    await express(a, forGate('Files'), 'grant-files')
    await express(a, once('step-1/tool/0'), 'grant-once')
    expect(await authorizations(a)).toMatchObject({ session: { basis: 'rev-2' } })
    await express(a, forGate('Shell', 'revoke'), 'revoke-shell')
    await express(a, once('step-1/tool/0', 'revoke'), 'revoke-once')
    expect(await authorizations(a, { position: 'step-1/tool/0' })).toMatchObject({
      revision: '6',
      once: null,
      session: null,
    })
    expect(await authorizations(a, { capabilityId: 'Files' })).toMatchObject({
      session: { basis: 'rev-1' },
    })
    const rows = a.provider.select('dom_0', 'SELECT COUNT(*) FROM sl_authorization_session')
    expect(rows.rows).toEqual([[1n]])
  })
})
