// The snapshot a ledger keeps between its transactions (SPEC, 账本事务的快照; model SnapshotCache):
// a write is decided on the snapshot of the last read or commit without a read of the store, and
// the store applies it only at that revision; a pure read asks the store for the revision of the
// domain and reads the whole domain only when it moved.
import { expect, it } from 'vitest'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { createLedgerTransactions } from '../src/ledger-transactions.ts'
import type {
  LedgerDomain,
  LedgerRecord,
  LedgerWrite,
  ToolLedgerStore,
} from '../src/ledger-store.ts'
import { callId, ok, operationId, tenantA } from './runtime-values.ts'

const DOMAIN: LedgerDomain = { kind: 'call', tenant: tenantA, call: callId('snapshot') }
const unknown = {
  failure: { kind: 'unavailable' as const, dependency: 'x', diagnostic: 'unknown' },
}

/** A task record under its own key: enough for a snapshot to show what the domain holds. */
function note(name: string): LedgerRecord {
  return {
    kind: 'task',
    task: { kind: 'clock', operation: operationId(name), state: 'blocked' },
  } as unknown as LedgerRecord
}
const put = (name: string): LedgerWrite => ({ kind: 'put', record: note(name) })

/** The memory store with its reads counted, and the ledger transactions over it. */
function scene() {
  const memory = createMemoryToolLedgerStore()
  const counts = { read: 0, readRecord: 0, commit: 0 }
  const store: Pick<ToolLedgerStore, 'read' | 'readRecord' | 'commit'> = {
    read: domain => {
      counts.read += 1
      return memory.read(domain)
    },
    readRecord: (domain, key) => {
      counts.readRecord += 1
      return memory.readRecord(domain, key)
    },
    commit: input => {
      counts.commit += 1
      return memory.commit(input)
    },
  }
  const ledger = createLedgerTransactions(store, 4)
  const write = (name: string) =>
    ledger.transact(
      DOMAIN,
      null,
      () => ({ kind: 'commit', value: name, writes: [put(name)] }),
      unknown,
    )
  const names = async (via = ledger) =>
    ok(await via.read(DOMAIN))
      .tasks.map(task => task.operation)
      .sort()
  return { memory, counts, ledger, write, names, store }
}

it('decides the next write on the snapshot of the last commit: one whole read, then none', async () => {
  const s = scene()
  expect(ok(await s.write('a'))).toBe('a')
  expect(ok(await s.write('b'))).toBe('b')
  expect(ok(await s.write('c'))).toBe('c')
  expect(s.counts).toEqual({ read: 1, readRecord: 0, commit: 3 })
})

it('a pure read asks the store for the revision and answers from the snapshot when it did not move', async () => {
  const s = scene()
  ok(await s.write('a'))
  ok(await s.write('b'))
  const before = { ...s.counts }
  expect(await s.names()).toEqual(['a', 'b'].map(name => operationId(name)))
  expect(s.counts).toEqual({ ...before, readRecord: before.readRecord + 1 })
})

it('the snapshot after commits is what a cold read of the store gives, record for record', async () => {
  const s = scene()
  ok(await s.write('a'))
  ok(await s.write('b'))
  ok(
    await s.ledger.transact(
      DOMAIN,
      null,
      snapshot => ({
        kind: 'commit',
        value: null,
        writes: [
          { kind: 'delete', key: `task:clock:${operationId('a')}` },
          put('c'),
          { kind: 'schedule', key: 'call', dueAt: '2026-11-10T00:00:00.000Z' as never },
        ],
        seen: snapshot.revision,
      }),
      unknown,
    ),
  )
  const cold = createLedgerTransactions(s.memory, 4)
  expect(ok(await s.ledger.read(DOMAIN))).toEqual(ok(await cold.read(DOMAIN)))
})

it('another writer moves the domain: the write on the stale snapshot is refused once, then decided on a new read', async () => {
  const s = scene()
  ok(await s.write('a'))
  const other = createLedgerTransactions(s.memory, 4)
  ok(
    await other.transact(
      DOMAIN,
      null,
      () => ({ kind: 'commit', value: null, writes: [put('x')] }),
      unknown,
    ),
  )
  const seen: string[] = []
  ok(
    await s.ledger.transact(
      DOMAIN,
      null,
      snapshot => {
        seen.push(
          snapshot.tasks
            .map(task => task.operation)
            .sort()
            .join(','),
        )
        return { kind: 'commit', value: null, writes: [put('b')] }
      },
      unknown,
    ),
  )
  expect(seen).toEqual([operationId('a'), [operationId('a'), operationId('x')].sort().join(',')])
  expect(await s.names()).toEqual(['a', 'b', 'x'].map(name => operationId(name)).sort())
})

it('another writer moves the domain: a pure read sees the new revision and reads the whole domain', async () => {
  const s = scene()
  ok(await s.write('a'))
  const other = createLedgerTransactions(s.memory, 4)
  ok(
    await other.transact(
      DOMAIN,
      null,
      () => ({ kind: 'commit', value: null, writes: [put('x')] }),
      unknown,
    ),
  )
  const before = s.counts.read
  expect(await s.names()).toEqual([operationId('a'), operationId('x')].sort())
  expect(s.counts.read).toBe(before + 1)
})

it('an unknown commit answer drops the snapshot, whether or not the write landed', async () => {
  for (const fault of ['unknown-applied', 'unknown-dropped'] as const) {
    const s = scene()
    ok(await s.write('a'))
    s.memory.injectCommit(fault)
    expect(await s.write('b')).toEqual(unknown)
    const before = s.counts.read
    const landed = fault === 'unknown-applied' ? ['a', 'b'] : ['a']
    expect(await s.names()).toEqual(landed.map(name => operationId(name)))
    ok(await s.write('c'))
    expect(s.counts.read).toBeGreaterThan(before)
    expect(await s.names()).toEqual([...landed, 'c'].map(name => operationId(name)))
  }
})

it('a dropped domain reads as never committed', async () => {
  const s = scene()
  ok(await s.write('a'))
  const kept = ok(await s.ledger.read(DOMAIN))
  expect(
    (await s.ledger.commit(DOMAIN, kept.revision, '0' as never, [{ kind: 'drop' }])).kind,
  ).toBe('committed')
  expect(ok(await s.ledger.read(DOMAIN))).toMatchObject({ revision: '0', tasks: [] })
  const cold = createLedgerTransactions(s.memory, 4)
  expect(ok(await s.ledger.read(DOMAIN))).toEqual(ok(await cold.read(DOMAIN)))
})

it('an answer without a commit is a pure read: the store confirms the revision of the snapshot first', async () => {
  const s = scene()
  ok(await s.write('a'))
  const answer = () =>
    s.ledger.transact(
      DOMAIN,
      null,
      snapshot => ({ kind: 'reply', outcome: { ok: snapshot.tasks.length } }),
      unknown as never,
    )
  const before = { ...s.counts }
  expect(ok(await answer())).toBe(1)
  expect(s.counts).toEqual({ ...before, readRecord: before.readRecord + 1 })
  // Another writer moved the domain: the answer is decided again on a whole read.
  const other = createLedgerTransactions(s.memory, 4)
  ok(
    await other.transact(
      DOMAIN,
      null,
      () => ({ kind: 'commit', value: null, writes: [put('x')] }),
      unknown,
    ),
  )
  expect(ok(await answer())).toBe(2)
  // A store that cannot answer the revision gives no answer from the snapshot.
  s.memory.injectRead('unavailable')
  expect(await answer()).toMatchObject({ failure: { kind: 'unavailable' } })
})
