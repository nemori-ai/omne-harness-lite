// Path P of C-WORKCACHE (design §5): the fact bodies written beside the fact rows, and the read
// handler `execution-record.execution-facts`, which reads the head row of one execution and its
// facts after a sequence. Over one migrated database, so that two tenants share the tables and only
// the predicates keep them apart; the participant module writes the rows as a publication does.
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import { describe, expect, it } from 'vitest'
import { evidence, sessionId } from '@omne-harness/session-contract/testing'
import { executionRecordFacts, type ExecutionFactRecord } from '../src/participants.ts'
import executionRecord from '../src/worker/execution-record.ts'
import readExecutionFacts from '../src/worker/read-execution-facts.ts'
import { TENANT_A, TENANT_B, textOf } from './fixtures/app.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

type Port = ReturnType<typeof migratedPort>['port']

const EXECUTION = 'run_1/x'
const CONSEQUENCES = [{ kind: 'observed' }] as const satisfies JsonValue
const CONTROL = { records: [{ command: 'cancel' }] } as const satisfies JsonValue

/** One publication of `facts` for execution `EXECUTION` of `session-1`, at publication `published`. */
function publish(
  port: Port,
  tenant: typeof TENANT_A,
  published: number,
  facts: readonly ExecutionFactRecord[],
): void {
  const last = facts.at(-1)?.sequence ?? '0'
  const command = executionRecordFacts({
    tenant,
    session: sessionId('session-1'),
    execution: EXECUTION,
    published: String(published),
    expected: published === 0 ? null : String(published),
    revision: String(published + 1),
    operation: `aop-${String(published)}`,
    digest: `sha256:${String(published)}`,
    answer: { published },
    state: null,
    boundaries: [
      {
        execution: EXECUTION,
        revision: String(published + 1),
        receipt: evidence(`head-${String(published)}`),
        emittedThrough: last,
        ended: null,
      },
    ],
    facts,
    batches: [],
    admissions: [],
  } as never)
  const reply = executionRecord.execute(structuredClone(command.facts) as never, port as never)
  expect(reply.kind).toBe('participated')
}

const fact = (sequence: number, body?: Partial<ExecutionFactRecord>): ExecutionFactRecord => ({
  execution: EXECUTION,
  sequence: String(sequence),
  source: evidence(`event-${String(sequence)}`),
  kinds: [],
  ...body,
})

/** The handler's answer for `tenant`, with the rows each of its statements returned. */
function read(port: Port, tenant: typeof TENANT_A, after: string, session = 'session-1') {
  const rows: number[] = []
  const outcome = readExecutionFacts.read(
    { tenant: textOf(tenant), session, execution: EXECUTION, after },
    {
      execute: (sql: string, params: readonly SqlValue[]) => {
        const result = port.execute(sql, params)
        rows.push(result.rows.length)
        return result
      },
    } as never,
  )
  if (outcome.kind !== 'read') throw new Error('the handler did not read')
  return { output: outcome.output as Readonly<Record<string, JsonValue>>, rows }
}

describe('the fact bodies of a publication', () => {
  it('are read back beside their facts; a fact written without a body reads as absent', () => {
    const { port } = migratedPort()
    publish(port, TENANT_A, 0, [
      fact(1, { consequences: CONSEQUENCES, control: null }),
      fact(2, { consequences: null, control: CONTROL }),
      fact(3),
    ])
    const { output } = read(port, TENANT_A, '0')
    expect(output['facts'] as unknown).toEqual([
      expect.objectContaining({ sequence: '1', consequences: CONSEQUENCES, control: null }),
      expect.objectContaining({ sequence: '2', consequences: null, control: CONTROL }),
      expect.objectContaining({ sequence: '3', consequences: 'absent', control: 'absent' }),
    ])
    expect(output).toMatchObject({ kind: 'facts', revision: '1', emittedThrough: '3', next: null })
  })
})

describe('execution-record.execution-facts', () => {
  it('reads only the facts after the sequence, and its rows do not grow with the facts before it', () => {
    const { port } = migratedPort()
    const before = 50
    publish(
      port,
      TENANT_A,
      0,
      Array.from({ length: before }, (_, index) => fact(index + 1, { consequences: CONSEQUENCES })),
    )
    publish(port, TENANT_A, 1, [fact(before + 1, { consequences: CONSEQUENCES })])
    const late = read(port, TENANT_A, String(before))
    expect(
      (late.output['facts'] as JsonValue[]).map(item => (item as { sequence: string }).sequence),
    ).toEqual([String(before + 1)])
    // One head row and one fact row, whatever came before.
    expect(late.rows).toEqual([1, 1])
    expect(read(port, TENANT_A, '0').rows).toEqual([1, before + 1])
  })

  it('another tenant with the same session and execution reads nothing of it', () => {
    const { port } = migratedPort()
    publish(port, TENANT_A, 0, [fact(1, { consequences: CONSEQUENCES })])
    expect(read(port, TENANT_A, '0').output['kind']).toBe('facts')
    expect(read(port, TENANT_B, '0').output).toEqual({ kind: 'absent' })
  })

  it('an execution of another session of the tenant reads as absent', () => {
    const { port } = migratedPort()
    publish(port, TENANT_A, 0, [fact(1, { consequences: CONSEQUENCES })])
    expect(read(port, TENANT_A, '0', 'session-2').output).toEqual({ kind: 'absent' })
  })

  it('a malformed sequence is refused, not read as the start', () => {
    const { port } = migratedPort()
    expect(() => read(port, TENANT_A, '-1')).toThrow('invalid input')
  })
})
