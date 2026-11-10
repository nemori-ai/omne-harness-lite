// commitLog on the real participant over the node:sqlite test provider: the consequence rows, the
// progress row, the snapshot, the derived rows, the `log` operation record and the tail are one
// transaction (M-LOG P2). A write that fails inside the transaction leaves every table as it was,
// and the same observation then commits once. The same operation recalls its original receipt and
// another observation under it is a conflict (P1, P3); a lost reply is recalled by retrying
// `commitLog`, never by `queryOperation`. The shared cases run in log-conformance.spec.ts; this
// file holds what only a SQL transaction can show.
import { describe, expect, it } from 'vitest'
import type {
  SessionFailure,
  SessionLogCommitObservation,
  SessionLogReceipt,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { app, textOf, TENANT_A, TENANT_B, type App } from './fixtures/app.ts'
import { INTERPRETER_ENTRIES, kindOf } from './fixtures/entries.ts'
import {
  activeRun,
  agentEventOf,
  agentPublisher,
  eventOf,
  registrationOf,
  startRun,
  workOf,
} from './fixtures/real-provider.ts'

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}
const failureOf = (value: unknown): SessionFailure => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: SessionFailure }).failure
}

const commitLog = (a: App, observation: SessionLogCommitObservation) => {
  if (a.port.commitLog === undefined) throw new Error('the SQL port offers no commitLog')
  return a.port.commitLog({ observation })
}

/** An active Run whose event 1 (one call registration) is published and not yet interpreted. */
async function opened() {
  const a = await app()
  const agent = agentPublisher({
    storage: a.provider.storage,
    combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
    domainOf: tenant => (textOf(tenant) === textOf(TENANT_A) ? 'dom_0' : 'dom_1'),
  })
  ok(await a.create(TENANT_A))
  ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
  ok(await startRun(a, 'start-run-1'))
  const scene = activeRun(await workOf(a))
  const observation = eventOf(scene, 1, [registrationOf(scene.attempt, 1)], 'log-1')
  await agent.publish(agentEventOf(observation))
  return { a, agent, scene, observation }
}

/** Every row of every Session table of tenant A's domain, so a rollback is checked on all of them. */
function tables(a: App) {
  const names = a.provider
    .select('dom_0', `SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE 'sl_%'`)
    .rows.map(row => String(row[0]))
  return Object.fromEntries(
    names.map(name => [
      name,
      a.provider
        .select('dom_0', `SELECT * FROM ${name}`)
        .rows.map(row =>
          JSON.stringify(row, (_key, cell: unknown) =>
            typeof cell === 'bigint' ? String(cell) : cell,
          ),
        ),
    ]),
  )
}

describe('commitLog writes in one transaction', () => {
  it('a committed observation writes its rows, one log record, and moves the snapshot and the tail together', async () => {
    const { a, observation } = await opened()
    const before = tables(a)
    const receipt = ok<SessionLogReceipt>(await commitLog(a, observation))
    const after = tables(a)
    expect(after['sl_entry']?.length).toBe((before['sl_entry']?.length ?? 0) + 2)
    expect(after['sl_operation']?.length).toBe((before['sl_operation']?.length ?? 0) + 1)
    const record = a.provider.select(
      'dom_0',
      'SELECT form, receipt, result FROM sl_operation WHERE operation = ?',
      [observation.operation],
    ).rows[0]
    expect(record?.[0]).toBe('log')
    expect(JSON.parse(String(record?.[1]))).toEqual(JSON.parse(String(record?.[2])))
    const work = await workOf(a)
    expect(work.run.kind === 'active' ? work.run.execution.readThrough : null).toBe('1')
    expect(receipt).toMatchObject({ readThrough: '1', recovered: false })
  })

  // The four writes of the publication: a row, the snapshot, the operation record and the tail.
  it.each([
    ['at the progress row, after the consequence row', /INSERT INTO sl_entry/u, 2],
    ['at the snapshot', /INSERT OR REPLACE INTO sl_state/u, 1],
    ['at the operation record', /INSERT INTO sl_operation \(/u, 1],
    ['at the tail update', /UPDATE sl_journal/u, 1],
  ] as const)(
    'a write that fails %s leaves every table, and the same observation then commits once',
    async (_name, pattern, nth) => {
      const { a, observation } = await opened()
      const before = tables(a)
      a.provider.failWrite(pattern, nth)
      // An environment error inside the transaction is unknown (sql-contract §7.6).
      expect(failureOf(await commitLog(a, observation)).kind).toBe('commit-unknown')
      expect(tables(a)).toEqual(before)
      a.provider.failWrite(null)
      const receipt = ok<SessionLogReceipt>(await commitLog(a, observation))
      expect(receipt.recovered).toBe(false)
      expect(tables(a)['sl_entry']?.length).toBe((before['sl_entry']?.length ?? 0) + 2)
    },
  )
})

describe('the operation identity of commitLog', () => {
  it('the same operation with the same observation recalls the original receipt and writes nothing', async () => {
    const { a, observation } = await opened()
    const first = ok<SessionLogReceipt>(await commitLog(a, observation))
    const before = tables(a)
    const again = ok<SessionLogReceipt>(await commitLog(a, observation))
    expect(again).toEqual({ ...first, recovered: true })
    expect(tables(a)).toEqual(before)
  })

  it('the same operation with another observation is a conflict and writes nothing', async () => {
    const { a, observation } = await opened()
    ok(await commitLog(a, observation))
    const before = tables(a)
    expect(
      failureOf(await commitLog(a, { ...observation, source: evidence('log/event/other') })),
    ).toEqual({ kind: 'conflict', operation: observation.operation })
    expect(tables(a)).toEqual(before)
  })

  it('another operation of an interpreted event recalls the original receipt from its record', async () => {
    const { a, observation } = await opened()
    const first = ok<SessionLogReceipt>(await commitLog(a, observation))
    const before = tables(a)
    const retry = { ...observation, operation: operationId('log-1-retry') }
    expect(ok<SessionLogReceipt>(await commitLog(a, retry))).toEqual({ ...first, recovered: true })
    expect(tables(a)).toEqual(before)
    // The retry identity saved no record: it stays unknown, as in the memory pair.
    expect(
      ok(await a.port.queryOperation({ ...a.access(TENANT_A), operation: retry.operation })),
    ).toEqual({ kind: 'unknown' })
  })

  it('a log record answers conflict to both queries; a lost reply is recalled by retrying commitLog', async () => {
    const { a, observation } = await opened()
    a.provider.loseNextReply()
    expect(failureOf(await commitLog(a, observation))).toEqual({
      kind: 'commit-unknown',
      operation: observation.operation,
    })
    const query = { ...a.access(TENANT_A), operation: observation.operation }
    expect(failureOf(await a.port.queryOperation(query))).toEqual({
      kind: 'conflict',
      operation: observation.operation,
    })
    expect(failureOf(await a.port.queryControlOperation(query))).toEqual({
      kind: 'conflict',
      operation: observation.operation,
    })
    const before = tables(a)
    const again = ok<SessionLogReceipt>(await commitLog(a, observation))
    expect(again).toMatchObject({ operation: observation.operation, readThrough: '1' })
    expect(again.recovered).toBe(true)
    expect(tables(a)).toEqual(before)
  })

  it('an identity that a command holds is a conflict and writes nothing', async () => {
    const { a, observation } = await opened()
    const taken = { ...observation, operation: operationId('accept-input-1') }
    const before = tables(a)
    expect(failureOf(await commitLog(a, taken))).toEqual({
      kind: 'conflict',
      operation: taken.operation,
    })
    expect(tables(a)).toEqual(before)
  })

  it('a tenant that legal-identity did not mint is invalid and reaches no storage', async () => {
    const { a, observation } = await opened()
    const calls = a.provider.calls.length
    const forged = { ...observation, tenant: { ...TENANT_A } as typeof TENANT_A }
    expect(failureOf(await commitLog(a, forged))).toMatchObject({
      kind: 'invalid',
      field: 'tenant',
    })
    expect(a.provider.calls.length).toBe(calls)
  })
})

describe('the tenant of commitLog', () => {
  for (const entry of INTERPRETER_ENTRIES)
    it(`${entry.name}: another tenant's session and a session that never was answer the same denied`, async () => {
      const { a } = await opened()
      ok(await a.create(TENANT_B, 'only-b'))
      const before = tables(a)
      const other = await entry.call(a, TENANT_A, 'only-b')
      const ghost = await entry.call(a, TENANT_A, 'ghost')
      expect(kindOf(other)).toBe('denied')
      expect(other).toEqual(ghost)
      expect(tables(a)).toEqual(before)
    })
})

// The log only grows, so a read inside the commit that passes its bound passes it for good: the
// participant answers the definite failure `read-bound` and the port gives `invalid` on the field
// `storage` (SPEC 参加者失败的定性). Nothing is written.
describe('a commitLog whose in-transaction read would pass its bound', () => {
  const series = (count: number, insert: string, columns: string): string =>
    `${insert} WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${count}) SELECT ${columns} FROM n`

  it('a recall over more than 100000 log records of the session is invalid (read-bound)', async () => {
    const { a, observation } = await opened()
    ok(await commitLog(a, observation))
    // The same event under another operation writes no row and looks for the commit that covers it.
    const again = { ...observation, operation: operationId('log-again') }
    a.provider.seed(
      'dom_0',
      series(
        100_001,
        'INSERT INTO sl_operation (tenant, session, operation, input_digest, form, revision, receipt, result)',
        `?, 'session-1', 'seeded-' || i, 'd', 'log', NULL, '{}', '{}'`,
      ),
      [textOf(TENANT_A)],
    )
    expect(failureOf(await commitLog(a, again))).toEqual({
      kind: 'invalid',
      field: 'storage',
      reason: 'read-bound',
    })
  })

  it('a history index over 100000 routed entries is invalid (read-bound)', async () => {
    const { a, observation } = await opened()
    a.provider.seed(
      'dom_0',
      series(
        100_001,
        'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes)',
        `?, 'session-1', 1000000 + i, 1, 'intake.routed', '{}', 2`,
      ),
      [textOf(TENANT_A)],
    )
    expect(failureOf(await commitLog(a, observation))).toEqual({
      kind: 'invalid',
      field: 'storage',
      reason: 'read-bound',
    })
  })
})
