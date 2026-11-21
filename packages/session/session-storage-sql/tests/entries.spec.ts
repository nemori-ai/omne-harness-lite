import { describe, expect, it } from 'vitest'
import { backgroundInputId } from '@omne-harness/session-contract'
import type {
  RoutedInput,
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
type Message = Extract<RoutedInput, { kind: 'ordinary' }>['message']

const failureOf = (value: unknown): SessionFailure => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: SessionFailure }).failure
}

async function work(a: App): Promise<WorkSnapshot> {
  return ok<WorkSnapshot>(await a.port.readWork(a.access(TENANT_A)))
}

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
    position: '2',
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
      expect(refused.kind).toBe('commit-unknown')
      expect(tables(a)).toEqual(before)
      expect((await work(a)).entriesProgress).toEqual(progress)
      expect(
        ok(
          await a.port.queryOperation({
            ...a.access(TENANT_A),
            operation: input.observation.operation,
          }),
        ),
      ).toEqual({ kind: 'unknown' })
      a.provider.failWrite(null)
      ok<SessionEntriesReceipt>(await a.port.commitEntries(input))
      expect(tables(a).entries).toBe(before.entries + 2)
    },
  )

  it('a lost reply is commit-unknown; the original is then committed, recalled and written once', async () => {
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

describe('commitEntries accepts the outcome of a backgrounded call as an input', () => {
  const producer = { kind: 'tool', call: CALL } as const
  const reminder = {
    id: 'msg_bgreminder0000000000000',
    role: 'system_reminder',
    blocks: [
      {
        kind: 'text',
        id: 'blk_bgreminder',
        visibility: { toHuman: true, toModel: true },
        text: 'background done',
      },
    ],
  } as unknown as Message

  async function backgrounded() {
    const { a, input } = await opened()
    const { observation } = input
    const placed: SessionEntriesObservation = {
      ...observation,
      operation: operationId('entries-placeholder'),
      through: '1',
      position: '1',
      boundary: { ...observation.boundary, count: '1' },
      items: [
        {
          ordinal: '1',
          key: 'key-placeholder',
          fact: evidence('agent/entry/placeholder'),
          interpretation: [
            {
              kind: 'backgrounded',
              producer,
              source: evidence('t/placeholder'),
              label: { intent: 'build', tool: 'Shell', command: 'execute', preview: 'pnpm build' },
              how: 'launched',
            },
          ],
        },
      ],
    }
    ok<SessionEntriesReceipt>(
      await a.port.commitEntries({ observation: placed, start: input.start }),
    )
    const saved = (await work(a)).entriesProgress?.[0]
    if (saved === undefined) throw new Error('no saved progress')
    const outcome: SessionEntriesObservation = {
      ...observation,
      operation: operationId('entries-outcome'),
      after: '1',
      through: '2',
      position: '2',
      boundary: { ...observation.boundary, revision: '2', count: '2' },
      items: [
        {
          ordinal: '2',
          key: 'key-outcome',
          fact: evidence('agent/entry/outcome'),
          interpretation: [
            { kind: 'execution', producer, source: evidence('t/result') },
            {
              kind: 'background-outcome',
              producer,
              result: 'rv-1',
              reminder,
              source: evidence('t/result'),
            },
          ],
        },
      ],
    }
    return {
      a,
      outcome: { observation: outcome, start: { kind: 'saved' as const, progress: saved } },
    }
  }

  const inputs = (a: App) =>
    Number(a.provider.select('dom_0', 'SELECT COUNT(*) FROM sl_input').rows[0]?.[0] ?? -1)

  it('writes the settlement, the reminder and its input row in one transaction', async () => {
    const { a, outcome } = await backgrounded()
    const before = { ...tables(a), inputs: inputs(a) }
    ok<SessionEntriesReceipt>(await a.port.commitEntries(outcome))
    expect({ ...tables(a), inputs: inputs(a) }).toEqual({
      entries: before.entries + 5,
      operations: before.operations + 1,
      covered: before.covered + 1,
      tail: before.tail + 1,
      inputs: before.inputs + 1,
    })
    const input = backgroundInputId(producer, 'rv-1')
    const snapshot = await work(a)
    expect(snapshot.pending).toContain(input)
    expect(snapshot.backgroundPlaceholders).toEqual([])
    const read = ok<{ message: Message }>(
      await a.port.readInput({ ...a.access(TENANT_A), session: base.session, input }),
    )
    expect(read.message).toEqual(reminder)
  })

  it('a failed input row leaves every table, and the same outcome then commits once', async () => {
    const { a, outcome } = await backgrounded()
    const before = { ...tables(a), inputs: inputs(a) }
    a.provider.failWrite(/INSERT OR REPLACE INTO sl_input/u, 1)
    expect(failureOf(await a.port.commitEntries(outcome)).kind).toBe('commit-unknown')
    expect({ ...tables(a), inputs: inputs(a) }).toEqual(before)
    a.provider.failWrite(null)
    ok<SessionEntriesReceipt>(await a.port.commitEntries(outcome))
    ok<SessionEntriesReceipt>(await a.port.commitEntries(outcome))
    expect(inputs(a)).toBe(before.inputs + 1)
    expect(tables(a).entries).toBe(before.entries + 5)
  })
})
