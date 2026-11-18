import { describe, expect, it } from 'vitest'
import type { AgentExecutionId, AgentOperationId } from '@omne-harness/agent-contract'
import type { OperationRecord } from '../src/testing/journal.ts'
import { OperationTable } from '../src/testing/operation-table.ts'

const EXECUTIONS = ['e1', 'e2', 'e3'] as AgentExecutionId[]

function random(seed: number) {
  let state = seed
  return (bound: number) => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state % bound
  }
}

function recordOf(next: (bound: number) => number, key: string): OperationRecord {
  const execution = EXECUTIONS[next(EXECUTIONS.length)]!
  const operation = `op-${key}` as AgentOperationId
  switch (next(3)) {
    case 0:
      return { kind: 'pending', key, execution, operation, run: () => undefined } as never
    case 1:
      return { kind: 'excluded', key, execution, operation, reason: 'fence' } as never
    default:
      return { kind: 'committed', key, value: null } as never
  }
}

const scanned = (table: Map<string, OperationRecord>, kind: string, execution: string) =>
  [...table]
    .filter(
      ([, record]) =>
        record.kind === kind && 'execution' in record && record.execution === execution,
    )
    .map(([key]) => key)
    .sort()

const indexed = (
  table: OperationTable,
  kind: 'pending' | 'excluded',
  execution: AgentExecutionId,
) =>
  [...(kind === 'pending' ? table.pendingOf(execution) : table.excludedOf(execution))]
    .map(([key]) => key)
    .sort()

describe('OperationTable', () => {
  it('answers each execution pending and excluded records as a full scan would, after any writes', () => {
    for (const seed of [3, 11, 99]) {
      const next = random(seed)
      const table = new OperationTable()
      const plain = new Map<string, OperationRecord>()
      for (let step = 0; step < 300; step += 1) {
        const key = `k${String(next(40))}`
        if (next(5) === 0) expect(table.delete(key)).toBe(plain.delete(key))
        else {
          const record = recordOf(next, key)
          table.set(key, record)
          plain.set(key, record)
        }
      }
      expect([...table]).toEqual([...plain])
      for (const execution of EXECUTIONS)
        for (const kind of ['pending', 'excluded'] as const)
          expect(indexed(table, kind, execution)).toEqual(scanned(plain, kind, execution))
    }
  })

  it('a fork keeps its own index: writes on either side do not reach the other', () => {
    const origin = new OperationTable()
    const pending = (key: string) =>
      ({
        kind: 'pending',
        key,
        execution: 'e1',
        operation: key,
        run: () => undefined,
      }) as never as OperationRecord
    origin.set('a', pending('a'))
    const fork = origin.fork()
    fork.set('b', pending('b'))
    fork.set('a', { kind: 'committed', key: 'a', value: null } as never)
    expect(indexed(origin, 'pending', EXECUTIONS[0]!)).toEqual(['a'])
    expect(indexed(fork, 'pending', EXECUTIONS[0]!)).toEqual(['b'])
  })
})
