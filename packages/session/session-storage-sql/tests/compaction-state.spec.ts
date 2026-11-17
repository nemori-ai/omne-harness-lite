import { expect, it } from 'vitest'
import type { RunExecution, WorkSnapshot } from '@omne-harness/session-contract'
import { evidence, succeeded } from '@omne-harness/session-contract/testing'
import {
  CHUNK_BYTES,
  readCompactionState,
  readState,
  writeCompactionState,
  writeState,
} from '../src/worker/state-rows.ts'
import { app, TENANT_A, textOf } from './fixtures/app.ts'
import { startRun, workOf } from './fixtures/real-provider.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

async function snapshotWithPast(count: number): Promise<WorkSnapshot> {
  const a = await app()
  succeeded(await a.create(TENANT_A), 'create')
  succeeded(await a.accept(TENANT_A, 'session-1', 'first'), 'accept')
  succeeded(await startRun(a, 'current'), 'start')
  const snapshot = await workOf(a)
  const past: RunExecution[] = Array.from({ length: count }, (_, index) => {
    const run = `past-${index}` as RunExecution['run']
    return {
      run,
      execution: {
        execution: `past-${index}`,
        revision: '2',
        evidence: evidence(`past-${index}`),
        readThrough: '1',
      },
      terminal: { run, outcome: 'completed', evidence: evidence(`terminal-${index}`) },
    }
  })
  return { ...snapshot, executions: [...past, ...snapshot.executions!] }
}

it.each([0, 2000, 20000])(
  'reads and changes only the current execution chunk with %i old executions',
  async count => {
    const snapshot = await snapshotWithPast(count)
    const { port, db } = migratedPort()
    const tenant = textOf(snapshot.tenant)
    const { session } = snapshot
    try {
      const stored = writeState(
        port,
        { tenant, session, covered: BigInt(snapshot.revision) },
        null,
        snapshot,
      )
      let rows = 0
      const current = readCompactionState(
        {
          execute(sql, values) {
            const result = port.execute(sql, values)
            rows += result.rows.length
            return result
          },
        },
        tenant,
        session,
        BigInt(snapshot.revision),
      )
      if (current === 'behind' || current.execution === null)
        throw new Error('current state required')
      expect(rows).toBeLessThanOrEqual(4)
      expect(JSON.stringify(current.execution.values).length).toBeLessThanOrEqual(CHUNK_BYTES)
      const original = current.execution.values.at(-1)!
      const nextRevision = String(BigInt(snapshot.revision) + 1n) as WorkSnapshot['revision']
      if (current.state.run.kind !== 'active') throw new Error('active Run required')
      const updated = { ...original.execution, revision: '10', evidence: evidence('adopted') }
      const next = {
        state: {
          ...current.state,
          revision: nextRevision,
          source: evidence('batch'),
          run: { ...current.state.run, execution: updated },
        },
        execution: { ...original, execution: updated },
      }
      writeCompactionState(port, { tenant, session, covered: BigInt(nextRevision) }, current, next)
      const after = readState(port, tenant, session, BigInt(nextRevision))
      if (after === 'behind') throw new Error('written state required')
      expect(after.layout.head).not.toEqual(stored.layout.head)
      expect(after.snapshot).toEqual({
        ...snapshot,
        ...next.state,
        executions: [...snapshot.executions!.slice(0, -1), next.execution],
      })
      expect(readCompactionState(port, tenant, session, BigInt(snapshot.revision))).toBe('behind')
    } finally {
      db.close()
    }
  },
)

it('repackages a growing current execution and removes member rows when it shrinks', async () => {
  const snapshot = await snapshotWithPast(70)
  const { port, db } = migratedPort()
  const tenant = textOf(snapshot.tenant)
  const { session } = snapshot
  let expected = snapshot
  try {
    writeState(port, { tenant, session, covered: BigInt(snapshot.revision) }, null, snapshot)
    for (const size of [18000, 1]) {
      const current = readCompactionState(port, tenant, session, BigInt(expected.revision))
      if (current === 'behind' || current.execution === null)
        throw new Error('current state required')
      const original = current.execution.values.at(-1)!
      const revision = String(BigInt(expected.revision) + 1n) as WorkSnapshot['revision']
      if (current.state.run.kind !== 'active') throw new Error('active Run required')
      const updated = {
        ...original.execution,
        revision,
        evidence: { ...evidence('adopted'), record: 'x'.repeat(size) },
      }
      const next = {
        state: {
          ...current.state,
          revision,
          source: evidence('batch'),
          run: { ...current.state.run, execution: updated },
        },
        execution: { ...original, execution: updated },
      }
      writeCompactionState(port, { tenant, session, covered: BigInt(revision) }, current, next)
      expected = {
        ...expected,
        ...next.state,
        executions: [...expected.executions!.slice(0, -1), next.execution],
      }
      const after = readState(port, tenant, session, BigInt(revision))
      expect(after === 'behind' ? after : after.snapshot).toEqual(expected)
    }
  } finally {
    db.close()
  }
})
