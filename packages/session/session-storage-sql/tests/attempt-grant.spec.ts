// The grant of an attempt (R2-D349): the commit that writes an SE15 row writes the source of its
// batch receipt into `sl_attempt_grant` in the same transaction, keyed by the attempt and placed at
// the row's position. The receipt source is the `grant` the Session hands the Agent at invoke or
// resume; it is not the evidence of the SE15 row (`started`), so the history index carries the
// written relation as `SessionAttemptRecord.grant` and resolves a grant by it. A Run with two SE15
// gives two grants, each resolving to its own attempt, through the kept index and a whole read
// alike. The migration is registered after the state items of the same owner.
import { describe, expect, it } from 'vitest'
import type { CommitReceipt, SessionAttemptRecord } from '@omne-harness/session-contract'
import { operationId, sessionId } from '@omne-harness/session-contract/testing'
import { canonicalText } from '../src/codec.ts'
import { sessionStorageMaterials } from '../src/materials.ts'
import { grantNames } from '../src/worker/history-index.ts'
import { app, textOf, TENANT_A, type App } from './fixtures/app.ts'
import { FIXTURE_READ_OUTPUT_LIMIT_BYTES } from './fixtures/read-limit.ts'
import { activeRun, startRun, workOf } from './fixtures/real-provider.ts'

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

const SESSION = 'session-1'

/** The stored grant rows of session-1 of tenant A, in position order. */
function storedGrants(
  a: App,
): readonly Readonly<{ attempt: string; position: bigint; grant: unknown }>[] {
  return a.provider
    .select(
      'dom_0',
      'SELECT attempt, position, grant FROM sl_attempt_grant WHERE tenant = ? AND session = ? ORDER BY position',
      [textOf(TENANT_A), SESSION],
    )
    .rows.map(row => ({
      attempt: String(row[0]),
      position: row[1] as bigint,
      grant: JSON.parse(String(row[2])) as unknown,
    }))
}

/** The SE15 positions of session-1 of tenant A, in order. */
function attemptPositions(a: App): readonly bigint[] {
  return a.provider
    .select(
      'dom_0',
      `SELECT position FROM sl_entry WHERE tenant = ? AND session = ? AND kind = 'run.attempt-started' ORDER BY position`,
      [textOf(TENANT_A), SESSION],
    )
    .rows.map(row => row[0] as bigint)
}

async function attemptsOf(a: App): Promise<readonly SessionAttemptRecord[]> {
  const work = await workOf(a)
  const attempts = work.historyIndex?.attempts
  if (attempts === undefined) throw new Error('the work answer carries no history index')
  return attempts
}

function claim(a: App, run: ReturnType<typeof activeRun>, name: string) {
  return a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'claim',
      input: {
        tenant: TENANT_A,
        session: sessionId(SESSION),
        operation: operationId(name),
        run: run.run,
        instance: { owner: 'agent', id: 'instance-1' },
        continuity: { owner: 'test', record: 'continuity', revision: '1', digest: 'd' },
        expected: run.revision,
      },
    } as never,
    guards: [],
  })
}

describe('the migration of the attempt grant table', () => {
  it('comes after the state items of the same owner and is registered with its module', () => {
    const materials = sessionStorageMaterials({
      readOutputLimitBytes: FIXTURE_READ_OUTPUT_LIMIT_BYTES,
    })
    const found = materials.migrations.find(item => item.id === '005-attempt-grant')
    expect(found?.owner).toBe('session')
    expect(found?.requires).toEqual([{ owner: 'session', id: '004-state-items' }])
    expect(found?.moduleUrl).toMatch(/attempt-grant-migration\.(ts|js)$/u)
    const session = materials.participants.find(item => item.participant === 'session')
    expect(session?.ownedTables).toContain('sl_attempt_grant')
    for (const handler of ['session.work', 'session.work-index', 'session.work-reads']) {
      const read = materials.readHandlers.find(item => item.handler === handler)
      expect(read?.readTables, handler).toContain('sl_attempt_grant')
      expect(read?.requiresMigrations, handler).toContainEqual({
        owner: 'session',
        id: '005-attempt-grant',
      })
    }
  })
})

describe('the commit that writes an SE15 writes its grant', () => {
  it('the row holds the receipt source of the startRun commit at the position of the SE15', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    const started = ok<{ receipt: CommitReceipt }>(await startRun(a, 'start-run-1'))
    const run = activeRun(await workOf(a))
    expect(storedGrants(a)).toEqual([
      { attempt: run.attempt, position: attemptPositions(a)[0], grant: started.receipt.source },
    ])
  })

  it('the attempt record of the index carries the grant, which is not the evidence of the SE15 row', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    const started = ok<{ receipt: CommitReceipt }>(await startRun(a, 'start-run-1'))
    const run = activeRun(await workOf(a))
    const [attempt] = await attemptsOf(a)
    expect(attempt?.attempt).toBe(run.attempt)
    expect(attempt?.grant).toEqual(started.receipt.source)
    expect(canonicalText(attempt?.started)).not.toBe(canonicalText(started.receipt.source))
    // The grant names the attempt; the row evidence does too; a third evidence names none.
    expect(grantNames(attempt as SessionAttemptRecord, started.receipt.source)).toBe(true)
    expect(
      grantNames(attempt as SessionAttemptRecord, (attempt as SessionAttemptRecord).started),
    ).toBe(true)
    expect(
      grantNames(attempt as SessionAttemptRecord, {
        ...started.receipt.source,
        digest: 'sha256:' + '0'.repeat(64),
      }),
    ).toBe(false)
  })

  it('a second SE15 of the same Run has the grant of its own commit: each grant resolves to its attempt', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    const started = ok<{ receipt: CommitReceipt }>(await startRun(a, 'start-run-1'))
    const first = activeRun(await workOf(a))
    // The first read folds the first SE15 into the kept index; the claim is folded after its cursor.
    expect((await attemptsOf(a)).map(item => item.attempt)).toEqual([first.attempt])
    const claimed = ok<{ receipt: CommitReceipt }>(await claim(a, first, 'claim-1'))
    const second = activeRun(await workOf(a))
    expect(second.run).toBe(first.run)
    expect(second.attempt).not.toBe(first.attempt)
    expect(canonicalText(claimed.receipt.source)).not.toBe(canonicalText(started.receipt.source))

    const attempts = await attemptsOf(a)
    const byGrant = (grant: CommitReceipt['source']) =>
      attempts.filter(item => grantNames(item, grant)).map(item => item.attempt)
    expect(byGrant(started.receipt.source)).toEqual([first.attempt])
    expect(byGrant(claimed.receipt.source)).toEqual([second.attempt])
    expect(storedGrants(a).map(item => [item.attempt, item.grant])).toEqual([
      [first.attempt, started.receipt.source],
      [second.attempt, claimed.receipt.source],
    ])
    expect(storedGrants(a).map(item => item.position)).toEqual(attemptPositions(a))
  })
})
