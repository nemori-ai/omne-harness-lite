// N2 through the public port, at the production bounds: a read inside the commit that would pass its
// bound makes the commit unavailable and writes nothing; it never judges on the rows it happened to
// read. The model view bound is reached only by a compaction, which this member cannot commit yet
// (its compaction reads are null), so that bound is covered at module level in participant.spec.ts.
import { describe, expect, it } from 'vitest'
import type { SessionCommand } from '@omne-harness/session-contract'
import { operationId, sessionId } from '@omne-harness/session-contract/testing'
import { app, TENANT_A, textOf } from './fixtures/app.ts'

const DOMAIN = 'dom_0'
const failureOf = (value: unknown): Record<string, unknown> => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: Record<string, unknown> }).failure
}
const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

/** Inserts `count` rows with one statement: a recursive sequence 1..count fed into `insert`. */
const series = (count: number, insert: string): string =>
  `${insert} WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${count}) SELECT ${'$COLUMNS'} FROM n`

describe('a commit whose in-transaction read would pass its bound', () => {
  it('the history index over 100000 routed entries makes accept unavailable and writes nothing', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, 'session-1', 'one'))
    const before = ok<{ revision: string }>(await a.port.readWork(a.access(TENANT_A)))
    a.provider.seed(
      DOMAIN,
      series(
        100_001,
        'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes)',
      ).replace('$COLUMNS', `?, 'session-1', 1000000 + i, 1, 'intake.routed', '{}', 2`),
      [textOf(TENANT_A)],
    )
    const refused = failureOf(await a.accept(TENANT_A, 'session-1', 'two'))
    expect(refused).toMatchObject({ kind: 'unavailable' })
    expect(String(refused['diagnostic'])).toContain('history index')
    expect(ok<{ revision: string }>(await a.port.readWork(a.access(TENANT_A))).revision).toBe(
      before.revision,
    )
  })

  it('more than 1000 operation receipts make completeInitialization unavailable and write nothing', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const before = ok<{ revision: string }>(await a.port.readWork(a.access(TENANT_A)))
    a.provider.seed(
      DOMAIN,
      series(
        1001,
        'INSERT INTO sl_operation (tenant, session, operation, input_digest, form, revision, receipt, result)',
      ).replace('$COLUMNS', `?, 'session-1', 'seeded-' || i, 'd', 'batch', 1000 + i, '{}', '{}'`),
      [textOf(TENANT_A)],
    )
    const command = {
      kind: 'completeInitialization',
      input: {
        tenant: TENANT_A,
        session: sessionId('session-1'),
        operation: operationId('complete-1'),
        result: { item: 'seeded' },
      },
    } as unknown as SessionCommand
    const refused = failureOf(
      await a.port.commit({ access: a.access(TENANT_A), command, guards: [] }),
    )
    expect(refused).toMatchObject({ kind: 'unavailable' })
    expect(String(refused['diagnostic'])).toContain('operation receipts')
    expect(ok<{ revision: string }>(await a.port.readWork(a.access(TENANT_A))).revision).toBe(
      before.revision,
    )
  })
})
