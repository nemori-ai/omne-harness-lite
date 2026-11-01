// The access evidence of an operation record: a commit that carried an allowed decision writes it
// into `sl_operation_evidence` in the same transaction as the operation row, and the query
// answer of the record carries it back. The record of another tenant is not reachable, a recall
// keeps the original evidence, and a commit that rolls back leaves no evidence behind. The suite
// case of session-contract for the view (`delegated.spec.ts`) checks the view; this file checks
// the storage side of the same fact and the public port.
import { describe, expect, it } from 'vitest'
import { mutationAccessRequest } from '@omne-harness/session-contract'
import type { SessionCommand } from '@omne-harness/session-contract'
import {
  evidence,
  guard,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { sessionCommandFacts } from '../src/participants.ts'
import { sessionStorageMaterials } from '../src/materials.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'
import { kindOf } from './fixtures/entries.ts'

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

const SESSION = 'session-1'

/** The stored evidence text of one operation in the domain of tenant A (undefined: no row). */
function storedText(a: App, operation: string): string | undefined {
  const found = a.provider.select(
    'dom_0',
    'SELECT evidence FROM sl_operation_evidence WHERE tenant = ? AND session = ? AND operation = ? LIMIT 1',
    [textOf(TENANT_A), SESSION, operationId(operation)],
  )
  return found.rows.length === 0 ? undefined : (found.rows[0]?.[0] as string)
}

/** The number of operation records of the name in the domain of tenant A. */
const operationRows = (a: App, operation: string): unknown =>
  a.provider.select(
    'dom_0',
    'SELECT COUNT(*) FROM sl_operation WHERE tenant = ? AND session = ? AND operation = ?',
    [textOf(TENANT_A), SESSION, operationId(operation)],
  ).rows[0]?.[0]

const acceptCommand = (name: string): Extract<SessionCommand, { kind: 'accept' }> => ({
  kind: 'accept',
  input: {
    tenant: TENANT_A,
    session: sessionId(SESSION),
    operation: operationId(`accept-${name}`),
    value: ordinaryInput(name),
  },
})

async function created(): Promise<App> {
  const a = await app()
  expect(kindOf(await a.create(TENANT_A))).toBeUndefined()
  return a
}

const viewCommit = (a: App, command: SessionCommand, bound: string) =>
  a.pair.delegated
    .bind({
      request: mutationAccessRequest(a.access(TENANT_A), command),
      evidence: evidence(bound),
    })
    .commit({ access: a.access(TENANT_A), command, guards: [] })

/** The commit of a Session command by an external committer, with the given extra facts. */
function directCommit(a: App, command: SessionCommand, extra: Readonly<Record<string, unknown>>) {
  const base = sessionCommandFacts(command, [])
  return a.provider.storage.commit({
    identity: {
      scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
      transactionDomain: 'dom_0',
      operation: command.input.operation,
      protocolVersion: '2',
      operationKey: `${command.input.operation}#1`,
    },
    combinationVersion: 'c1',
    manifestDigest: 'a'.repeat(64),
    commands: [{ ...base, facts: { ...base.facts, ...extra } } as never],
  })
}

describe('the migration of the evidence table', () => {
  it('comes after the execution index of the same owner and is registered with its module', () => {
    const { migrations } = sessionStorageMaterials()
    const ids = migrations.map(item => `${item.owner}/${item.id}`)
    expect(ids).toEqual([
      'session/001-session-log',
      'execution-record/001-execution-record',
      'session/002-execution-index',
      'session/003-operation-evidence',
    ])
    const found = migrations.find(item => item.id === '003-operation-evidence')
    expect(found?.requires).toEqual([{ owner: 'session', id: '002-execution-index' }])
    const session = sessionStorageMaterials().participants.find(
      item => item.participant === 'session',
    )
    expect(session?.ownedTables).toContain('sl_operation_evidence')
    expect(found?.moduleUrl).toMatch(/operation-evidence-migration\.(ts|js)$/u)
  })
})

describe('the evidence of a commit is stored with its operation record', () => {
  it('a view commit stores the bound evidence, not one the access check would give', async () => {
    const a = await created()
    const asked = a.accessCheck.controls.asked().length
    ok(await viewCommit(a, acceptCommand('one'), 'access/face/accept'))
    expect(a.accessCheck.controls.asked().length).toBe(asked)
    expect(JSON.parse(storedText(a, 'accept-one') ?? 'null')).toEqual(
      evidence('access/face/accept'),
    )
  })

  it('a public commit stores the decision of its own access check', async () => {
    const a = await created()
    ok(
      await a.port.commit({
        access: a.access(TENANT_A),
        command: acceptCommand('one'),
        guards: [guard('login', 'login-entry', 'present')],
      }),
    )
    expect(JSON.parse(storedText(a, 'accept-one') ?? 'null')).toEqual(evidence('access/accept'))
  })

  it('a recall keeps the evidence of the original and writes no second one', async () => {
    const a = await created()
    ok(await viewCommit(a, acceptCommand('one'), 'access/face/first'))
    const again = ok<{ recovered?: boolean }>(
      await viewCommit(a, acceptCommand('one'), 'access/face/second'),
    )
    expect(again.recovered).toBe(true)
    expect(JSON.parse(storedText(a, 'accept-one') ?? 'null')).toEqual(evidence('access/face/first'))
  })

  it('a commit that fails after the operation row leaves no row and no evidence; the retry stores once', async () => {
    const a = await created()
    a.provider.failWrite(/UPDATE sl_journal/u)
    expect(kindOf(await viewCommit(a, acceptCommand('one'), 'access/face/accept'))).toBe(
      'unavailable',
    )
    expect(storedText(a, 'accept-one')).toBeUndefined()
    ok(await viewCommit(a, acceptCommand('one'), 'access/face/accept'))
    expect(JSON.parse(storedText(a, 'accept-one') ?? 'null')).toEqual(
      evidence('access/face/accept'),
    )
  })

  it('a committer that sends no evidence leaves the operation record without an evidence row', async () => {
    const a = await created()
    const result = await directCommit(a, acceptCommand('one'), {})
    expect(result.kind).toBe('committed')
    expect(operationRows(a, 'accept-one')).toBe(1n)
    expect(storedText(a, 'accept-one')).toBeUndefined()
  })

  it('a value that is not a durable evidence is refused and nothing is written', async () => {
    const a = await created()
    const result = await directCommit(a, acceptCommand('one'), { evidence: { owner: 1 } })
    expect(result.kind).toBe('rolled_back')
    expect(storedText(a, 'accept-one')).toBeUndefined()
  })
})

describe('the query answer of an operation record', () => {
  const query = (a: App, tenant: typeof TENANT_A, session: string, operation: string) =>
    a.provider.storage.commit({
      identity: {
        scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
        transactionDomain: 'dom_0',
        operation: 'session.lookup',
        protocolVersion: '2',
        operationKey: `lookup#${operation}#${tenant === TENANT_A ? 'a' : 'b'}#${session}`,
      },
      combinationVersion: 'c1',
      manifestDigest: 'a'.repeat(64),
      commands: [
        {
          participant: 'session',
          facts: {
            intent: 'query',
            tenant: textOf(tenant),
            session,
            operation: operationId(operation),
          },
        },
      ],
    })

  it('carries the evidence of the record', async () => {
    const a = await created()
    ok(await viewCommit(a, acceptCommand('one'), 'access/face/accept'))
    const result = await query(a, TENANT_A, SESSION, 'accept-one')
    expect(result.kind).toBe('committed')
    const response = (result as never as { responses: { reply: { response: unknown } }[] })
      .responses[0]?.reply.response
    expect(response).toMatchObject({ kind: 'operation', evidence: evidence('access/face/accept') })
  })

  it('does not give the evidence of tenant A to a query in the name of tenant B', async () => {
    const a = await created()
    ok(await viewCommit(a, acceptCommand('one'), 'access/face/accept'))
    const result = await query(a, TENANT_B, SESSION, 'accept-one')
    const response = (result as never as { responses: { reply: { response: unknown } }[] })
      .responses[0]?.reply.response
    expect(response).toEqual({ kind: 'no-session' })
  })
})
