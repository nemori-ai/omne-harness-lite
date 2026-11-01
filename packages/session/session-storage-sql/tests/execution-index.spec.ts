// The execution index of the Session log: the commit of SE13 (`startRun`) writes, in the same
// transaction, the row that maps the execution of the new Run to its session and Run; the read
// handler `session.execution` finds it by tenant and execution. The row is a derivative of SE13:
// a startRun that rolls back leaves none, and an execution already indexed to another session
// makes the commit fail, never overwrite. Another tenant finds nothing, the same as an execution
// that never started.
import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import { creation, guard, operationId, sessionId } from '@omne-harness/session-contract/testing'
import type { JsonValue } from '@omne-harness/sql-contract'
import { SESSION_EXECUTION_HANDLER, decodeSessionExecution } from '../src/participants.ts'
import { sessionStorageMaterials } from '../src/materials.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'
import { kindOf } from './fixtures/entries.ts'

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

const domainOf = (tenant: TenantId) => (tenant === TENANT_A ? 'dom_0' : 'dom_1')

async function read(a: App, input: JsonValue, tenant: TenantId = TENANT_A) {
  const result = await a.provider.storage.read({
    domain: {
      scope: { kind: 'tenant', tenant: textOf(tenant) },
      transactionDomain: domainOf(tenant),
    },
    handler: SESSION_EXECUTION_HANDLER,
    protocol: '1',
    requestKey: 'r',
    input,
  })
  return result
}

async function lookup(a: App, execution: string, tenant: TenantId = TENANT_A) {
  const result = await read(a, { tenant: textOf(tenant), execution }, tenant)
  if (result.kind !== 'read') throw new Error(`read: ${JSON.stringify(result)}`)
  return decodeSessionExecution(result.output)
}

const rows = (a: App, sql: string, params: readonly string[] = []) =>
  a.provider.select('dom_0', sql, params).rows

const startRun = (a: App, session: string, tenant: TenantId = TENANT_A) =>
  a.port.commit({
    access: a.access(tenant, session),
    command: {
      kind: 'startRun',
      input: {
        tenant,
        session: sessionId(session),
        operation: operationId(`start-${session}`),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: 'instance-1' },
      },
    },
    guards: [guard('evidence-bridge', 'login-entry', { session, operation: `start-${session}` })],
  })

/** Creates `session` with one accepted input, ready for a startRun. */
async function ready(a: App, session: string, tenant: TenantId = TENANT_A) {
  ok(await a.create(tenant, session))
  ok(await a.accept(tenant, session, `${session}-input`))
}

/** Starts a Run in `session` and answers the execution Session allocated for it. */
async function started(a: App, session: string, tenant: TenantId = TENANT_A) {
  await ready(a, session, tenant)
  ok(await startRun(a, session, tenant))
  const work = ok<WorkSnapshot>(await a.port.readWork(a.access(tenant, session)))
  if (work.run.kind !== 'active') throw new Error('no active Run')
  return { execution: work.run.execution.execution, run: work.run.run }
}

describe('the materials of the execution index', () => {
  it('the session participant owns the index table through its own second migration, and the handler reads only that table', () => {
    const materials = sessionStorageMaterials()
    const session = materials.participants.find(item => item.participant === 'session')
    expect(session?.ownedTables).toContain('sl_execution_idx')
    expect(materials.migrations.map(item => `${item.owner}/${item.id}`)).toContain(
      'session/002-execution-index',
    )
    const handler = materials.readHandlers.find(item => item.handler === SESSION_EXECUTION_HANDLER)
    expect(handler?.readTables).toEqual(['sl_execution_idx'])
    expect(handler?.requiresMigrations).toEqual([{ owner: 'session', id: '002-execution-index' }])
  })
})

describe('the startRun commit writes the index in its own transaction', () => {
  it('maps the execution of the new Run to its session, Run and the position of its SE13', async () => {
    const a = await app()
    const { execution, run } = await started(a, 'session-1')
    const se13 = rows(
      a,
      "SELECT position FROM sl_entry WHERE tenant = ? AND session = ? AND kind = 'run.started' LIMIT 2",
      [textOf(TENANT_A), 'session-1'],
    )
    expect(se13).toHaveLength(1)
    expect(await lookup(a, execution)).toEqual({
      session: 'session-1',
      run,
      position: String(se13[0]?.[0]),
    })
  })

  it('maps two sessions of one tenant each to its own execution', async () => {
    const a = await app()
    const first = await started(a, 'session-1')
    const second = await started(a, 'session-2')
    expect(first.execution).not.toBe(second.execution)
    expect(await lookup(a, first.execution)).toMatchObject({ session: 'session-1' })
    expect(await lookup(a, second.execution)).toMatchObject({ session: 'session-2' })
  })

  for (const [where, pattern] of [
    ['at the index row', /INSERT INTO sl_execution_idx/],
    ['at the operation record, after the index row', /INSERT INTO sl_operation/],
  ] as const)
    it(`a startRun that fails ${where} leaves no index row and no SE13; the same command then commits once`, async () => {
      const a = await app()
      await ready(a, 'session-1')
      a.provider.failWrite(pattern)
      expect(kindOf(await startRun(a, 'session-1'))).toBe('unavailable')
      expect(rows(a, 'SELECT COUNT(*) FROM sl_execution_idx')[0]?.[0]).toBe(0n)
      expect(rows(a, "SELECT COUNT(*) FROM sl_entry WHERE kind = 'run.started'")[0]?.[0]).toBe(0n)
      ok(await startRun(a, 'session-1'))
      expect(rows(a, 'SELECT COUNT(*) FROM sl_execution_idx')[0]?.[0]).toBe(1n)
    })

  it('a startRun that Session rejects writes no index row', async () => {
    const a = await app()
    await ready(a, 'session-1')
    const refused = await a.port.commit({
      access: a.access(TENANT_A),
      command: {
        kind: 'startRun',
        input: {
          tenant: TENANT_A,
          session: sessionId('session-1'),
          operation: operationId('start-without-login'),
          entry: 'interactive',
          candidate: creation().definition.candidate,
          instance: { owner: 'agent', id: 'instance-1' },
        },
      },
      guards: [],
    })
    expect(kindOf(refused)).toBe('login-required')
    expect(rows(a, 'SELECT COUNT(*) FROM sl_execution_idx')[0]?.[0]).toBe(0n)
  })

  it('an execution already indexed to another session makes the startRun fail and keeps the first row', async () => {
    // The execution of session-2's first Run, learnt in a separate store: Session derives it from
    // the session, the first input and the predecessor, so it is the same in every store.
    const probe = await app()
    const { execution } = await started(probe, 'session-2')

    const a = await app()
    await ready(a, 'session-2')
    const entries = rows(a, 'SELECT COUNT(*) FROM sl_entry')[0]?.[0]
    a.provider.seed(
      'dom_0',
      'INSERT INTO sl_execution_idx (tenant, execution, session, run, position) VALUES (?, ?, ?, ?, ?)',
      [textOf(TENANT_A), execution, 'session-1', 'run_other', 7n],
    )
    expect(kindOf(await startRun(a, 'session-2'))).toBe('unavailable')
    expect(await lookup(a, execution)).toEqual({
      session: 'session-1',
      run: 'run_other',
      position: '7',
    })
    expect(rows(a, 'SELECT COUNT(*) FROM sl_entry')[0]?.[0]).toBe(entries)
    const work = ok<WorkSnapshot>(await a.port.readWork(a.access(TENANT_A, 'session-2')))
    expect(work.run.kind).not.toBe('active')
  })
})

describe('the read handler session.execution', () => {
  it('answers null for an execution that no Run started', async () => {
    const a = await app()
    await started(a, 'session-1')
    expect(await lookup(a, 'run_never/execution')).toBeNull()
  })

  it('another tenant finds nothing, in its own domain and through rows planted in the domain of tenant A', async () => {
    const a = await app()
    const { execution } = await started(a, 'session-1')
    expect(await lookup(a, execution, TENANT_B)).toBeNull()
    const planted = await read(a, { tenant: textOf(TENANT_B), execution })
    expect(planted.kind === 'read' && planted.output).toBeNull()
    // The same answer as an execution that never started: nothing tells the two apart.
    expect(await lookup(a, execution, TENANT_B)).toEqual(await lookup(a, 'run_never/execution'))
  })

  it('an input without a tenant or an execution fails the handler, never answers null', async () => {
    // The node:sqlite fixture lets the handler's throw through; a provider turns it into a failed read.
    const a = await app()
    for (const input of [
      { tenant: textOf(TENANT_A) },
      { execution: 'run_x/execution' },
      { tenant: '', execution: 'run_x/execution' },
      null,
    ])
      await expect(read(a, input as JsonValue)).rejects.toThrow('invalid input')
  })

  it('the decoder tells an absent row from a malformed output', () => {
    expect(decodeSessionExecution(null)).toBeNull()
    expect(decodeSessionExecution({ session: 's', run: 'r', position: '1' })).toEqual({
      session: 's',
      run: 'r',
      position: '1',
    })
    expect(decodeSessionExecution({ session: 's', run: 'r' })).toBe('malformed')
    expect(decodeSessionExecution('s')).toBe('malformed')
  })
})
