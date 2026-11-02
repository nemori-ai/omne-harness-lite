// commitEntries on the real participant over the SQLite test provider: the consequence rows, the
// progress row, `sl_state`, `sl_operation` and the tail are one transaction (session-contract
// docs/same-log-pure.md「互斥与原子性由谁给」, first row). A write that fails inside the transaction
// leaves every one of them as it was, and the same input then commits once. A lost reply is
// `commit-unknown`, and the original operation is found again. The shared cases run in
// conformance.spec.ts; this file holds what only a SQL transaction can show.
import { describe, expect, it } from 'vitest'
import type {
  RunId,
  SessionEntriesObservation,
  SessionEntriesReceipt,
  SessionFailure,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  guard,
  operationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { app, TENANT_A, type App } from './fixtures/app.ts'

const CALL = 'entries-call-1'
const base = { tenant: TENANT_A, session: sessionId('session-1') }

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}
const failureOf = (value: unknown): SessionFailure => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: SessionFailure }).failure
}

async function work(a: App): Promise<WorkSnapshot> {
  return ok<WorkSnapshot>(await a.port.readWork(a.access(TENANT_A)))
}

/** An active Run with its execution and the bound external Tool call `CALL`; the range (0, 2]. */
async function opened() {
  const a = await app()
  ok(await a.create(TENANT_A))
  ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
  ok(
    await a.port.commit({
      access: a.access(TENANT_A),
      command: {
        kind: 'startRun',
        input: {
          ...base,
          operation: operationId('start-run'),
          entry: 'interactive',
          candidate: creation().definition.candidate,
          instance: { owner: 'agent', id: 'instance-1' },
        },
      },
      guards: [
        guard('evidence-bridge', 'login-entry', {
          session: base.session,
          operation: 'start-run',
        }),
      ],
    }),
  )
  const snapshot = await work(a)
  if (snapshot.run.kind !== 'active') throw new Error('the Run of the fixture is not active')
  ok(
    await a.port.commit({
      access: a.access(TENANT_A),
      command: {
        kind: 'bindExternalCall',
        input: {
          ...base,
          operation: operationId('entries-bind'),
          expected: snapshot.revision,
          qualification: evidence('entries/qualified'),
          binding: {
            producer: { kind: 'tool', call: CALL },
            action: 'action',
            consumer: { owner: 'session', work: 'work', position: 'entries-at', purpose: 'action' },
            request: evidence('entries/request'),
            initiatingAttempt: null,
          },
        },
      },
      guards: [],
    }),
  )
  const execution = snapshot.run.execution.execution
  const observation: SessionEntriesObservation = {
    tenant: TENANT_A,
    session: base.session,
    run: snapshot.run.run,
    execution,
    channel: 'tool-received',
    operation: operationId('entries-1'),
    after: '0',
    through: '2',
    boundary: {
      execution,
      channel: 'tool-received',
      revision: '1',
      executionEvidence: evidence('agent/head'),
      count: '3',
    },
    items: [
      {
        ordinal: '1',
        key: 'key-1',
        fact: evidence('agent/entry/1'),
        interpretation: [
          { kind: 'execution', producer: { kind: 'tool', call: CALL }, source: evidence('t/f') },
        ],
      },
      {
        ordinal: '2',
        key: 'key-2',
        fact: evidence('agent/entry/2'),
        interpretation: [{ kind: 'observed' }],
      },
    ],
  }
  return { a, input: { observation, start: { kind: 'initial' as const } } }
}

/** The rows of every table that a commitEntries writes, read in the domain of tenant A. */
function tables(a: App) {
  const count = (sql: string) => Number(a.provider.select('dom_0', sql).rows[0]?.[0] ?? -1)
  return {
    entries: count('SELECT COUNT(*) FROM sl_entry'),
    operations: count('SELECT COUNT(*) FROM sl_operation'),
    covered: count('SELECT covered FROM sl_state'),
    tail: count('SELECT tail FROM sl_journal'),
  }
}

describe('commitEntries writes in one transaction', () => {
  it('a committed range writes two log rows, one operation row, and moves sl_state and the tail together', async () => {
    const { a, input } = await opened()
    const before = tables(a)
    const receipt = ok<SessionEntriesReceipt>(await a.port.commitEntries(input))
    const after = tables(a)
    expect(after).toEqual({
      entries: before.entries + 2,
      operations: before.operations + 1,
      covered: before.covered + 1,
      tail: before.tail + 1,
    })
    expect((await work(a)).entriesProgress).toEqual([
      expect.objectContaining({ through: '2', interpreted: receipt.interpreted }),
    ])
  })

  // AT-1 to AT-3, and the operation row: the write fails at one statement inside the participant.
  it.each([
    ['AT-1 after the consequence row, before the progress row', /INSERT INTO sl_entry/u, 2],
    ['AT-2 after the progress row, before sl_state', /INSERT OR REPLACE INTO sl_state/u, 1],
    ['AT-3 after every row, at the tail update', /UPDATE sl_journal/u, 1],
    ['the operation row', /INSERT INTO sl_operation/u, 1],
  ] as const)(
    'a write that fails %s leaves every table, and the same input then commits once',
    async (_name, pattern, nth) => {
      const { a, input } = await opened()
      const before = tables(a)
      const progress = (await work(a)).entriesProgress
      a.provider.failWrite(pattern, nth)
      const refused = failureOf(await a.port.commitEntries(input))
      expect(refused.kind).toBe('unavailable')
      expect(tables(a)).toEqual(before)
      expect((await work(a)).entriesProgress).toEqual(progress)
      // The storage keeps the rolled back attempt: the original stays unknown (session-contract SL09).
      expect(
        ok(
          await a.port.queryOperation({
            ...a.access(TENANT_A),
            operation: input.observation.operation,
          }),
        ),
      ).toMatchObject({ kind: 'attempt-rejected', original: 'unknown' })
      a.provider.failWrite(null)
      ok<SessionEntriesReceipt>(await a.port.commitEntries(input))
      expect(tables(a).entries).toBe(before.entries + 2)
    },
  )

  it('AT-4 a lost reply is commit-unknown; the original is then committed, recalled and written once', async () => {
    const { a, input } = await opened()
    const before = tables(a)
    a.provider.loseNextReply()
    expect(failureOf(await a.port.commitEntries(input))).toEqual({
      kind: 'commit-unknown',
      operation: input.observation.operation,
    })
    const resolution = ok<{ kind: string; receipt: { revision: string } }>(
      await a.port.queryOperation({
        ...a.access(TENANT_A),
        operation: input.observation.operation,
      }),
    )
    const snapshot = await work(a)
    expect(resolution).toMatchObject({
      kind: 'committed',
      receipt: { revision: snapshot.revision },
    })
    const again = ok<SessionEntriesReceipt>(await a.port.commitEntries(input))
    expect(again).toEqual({
      operation: input.observation.operation,
      through: '2',
      interpreted: snapshot.source,
    })
    expect(tables(a).entries).toBe(before.entries + 2)
  })
})

describe('the operation identity of commitEntries', () => {
  it('an identity that an answer-only control holds is a conflict and writes nothing', async () => {
    const { a, input } = await opened()
    ok(
      await a.port.commit({
        access: a.access(TENANT_A),
        command: {
          kind: 'cancelRun',
          input: {
            tenant: TENANT_A,
            session: input.observation.session,
            operation: operationId('answered'),
            run: 'run_never' as RunId,
            urgency: 'force',
          },
        } as never,
        guards: [],
      }),
    )
    const before = tables(a)
    const operation = operationId('answered')
    expect(
      failureOf(
        await a.port.commitEntries({ ...input, observation: { ...input.observation, operation } }),
      ),
    ).toEqual({ kind: 'conflict', operation })
    expect(tables(a)).toEqual(before)
  })

  it('a tenant that legal-identity did not mint is invalid and reaches no storage', async () => {
    const { a, input } = await opened()
    const calls = a.provider.calls.length
    const forged = { ...input.observation, tenant: { ...TENANT_A } as typeof TENANT_A }
    expect(failureOf(await a.port.commitEntries({ ...input, observation: forged }))).toMatchObject({
      kind: 'invalid',
      field: 'tenant',
    })
    expect(a.provider.calls.length).toBe(calls)
  })
})
