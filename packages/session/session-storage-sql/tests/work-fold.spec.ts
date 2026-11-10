// The commit path of this process folds its batch into the work cache (SPEC RT-04, C-TOPOLOGY §2.9):
// the participant replies with the version, the positions, and the input range and focus of the
// history read of the batch; the port reads the batch rows, reproduces that index and those reads
// with `session.work-reads` at the position before the batch (H2), runs the same `reduce` on the
// held snapshot and reads the new index with `session.work-index`. What it registers must be the answer a whole read gives (F-1); it folds only
// a fresh commit onto the version just below (F-2); a publication in between (F-3), a quarantine
// (F-4) or a basis over the bound (F-6) registers nothing and the next read is whole; readers of the
// new version wait for the fold instead of reading whole (F-5). Each case counts the handler reads
// the storage served and the fold counts of this process.
import type {
  SessionEntriesObservation,
  SessionInputScope,
  SessionLogCommitObservation,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  guard,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { describe, expect, it } from 'vitest'
import { canonicalText, encodeValue } from '../src/codec.ts'
import { createSessionStorage } from '../src/index.ts'
import { workFoldCounts, type WorkCacheBounds, type WorkFoldCounts } from '../src/work-cache.ts'
import { NO_FOCUS, readHistory } from '../src/worker/history-index.ts'
import { PROTOCOL } from '../src/worker/schema.ts'
import { app, textOf, TENANT_A, type App } from './fixtures/app.ts'
import { packText, unpacked } from './fixtures/packed.ts'
import {
  activeRun,
  agentEventOf,
  agentPublisher,
  cancelRun,
  eventOf,
  registrationOf,
  startRun,
} from './fixtures/real-provider.ts'

type Port = App['port']

const WHOLE = 'session.work'
const SESSION = sessionId('session-1')
const base = { tenant: TENANT_A, session: SESSION }

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

/** The reads of `handler` the storage served since `from` (an index into the call log). */
const readsOf = (a: App, handler: string, from: number): number =>
  a.provider.calls.slice(from).filter(call => call.kind === 'read' && call.handler === handler)
    .length

/** The change of the fold counts of the database behind `storage` since `before`. */
function since(storage: SqlStorage, before: WorkFoldCounts): WorkFoldCounts {
  const now = workFoldCounts(storage)
  return {
    folded: now.folded - before.folded,
    indexed: now.indexed - before.indexed,
    skipped: now.skipped - before.skipped,
    quarantined: now.quarantined - before.quarantined,
    stale: now.stale - before.stale,
    republished: now.republished - before.republished,
  }
}
const none: WorkFoldCounts = {
  folded: 0,
  indexed: 0,
  skipped: 0,
  quarantined: 0,
  stale: 0,
  republished: 0,
}

/**
 * A port over a storage object of its own (a work cache of its own). `hooks` run once, before the
 * read of their handler goes to the storage.
 */
function portOver(a: App, workCache?: WorkCacheBounds) {
  const hooks = new Map<string, () => Promise<void> | void>()
  /** Changes the next answer of a handler, once. */
  const rewrites = new Map<string, (output: Record<string, unknown>) => Record<string, unknown>>()
  const storage: SqlStorage = {
    registerCombination: input => a.provider.storage.registerCombination(input),
    commit: request => a.provider.storage.commit(request),
    query: identity => a.provider.storage.query(identity),
    read: async (request, options) => {
      const hook = hooks.get(request.handler)
      if (hook !== undefined) {
        hooks.delete(request.handler)
        await hook()
      }
      const answer = await a.provider.storage.read(request, options)
      const rewrite = rewrites.get(request.handler)
      if (rewrite === undefined || answer.kind !== 'read') return answer
      rewrites.delete(request.handler)
      return { ...answer, output: rewrite(answer.output as Record<string, unknown>) as never }
    },
  } as SqlStorage
  return {
    port: createSessionStorage<string>({
      ...a.storageOptions,
      storage,
      ...(workCache === undefined ? {} : { workCache }),
    }),
    storage,
    hooks,
    rewrites,
  }
}

/** `a` with its port replaced, for the scene commands of the fixtures. */
const portLike = (a: App, port: Port): App => ({ ...a, port })

const readWork = async (port: Port, a: App): Promise<WorkSnapshot> =>
  ok<WorkSnapshot>(await port.readWork(a.access(TENANT_A)))

/** The answer of a whole read: a new port instance has an empty cache. */
const wholeRead = (a: App): Promise<WorkSnapshot> => readWork(portOver(a).port, a)

const accept = (a: App, port: Port, name: string) =>
  port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'accept',
      input: { ...base, operation: operationId(`accept-${name}`), value: ordinaryInput(name) },
    },
    guards: [guard('login', 'login-entry', 'present')],
  })

/**
 * One commit of this process onto a held snapshot: it folds, the next read of the port reads no
 * whole snapshot, and its answer is byte for byte the answer of a whole read.
 */
async function folds(a: App, commit: () => Promise<unknown>) {
  await readWork(a.port, a)
  const before = workFoldCounts(a.provider.storage)
  ok(await commit())
  expect(since(a.provider.storage, before)).toEqual({ ...none, folded: 1 })
  const from = a.provider.calls.length
  const held = await readWork(a.port, a)
  expect(readsOf(a, WHOLE, from)).toBe(0)
  const whole = await wholeRead(a)
  expect(held.historyIndex).toBeDefined()
  expect(canonicalText(encodeValue(held))).toBe(canonicalText(encodeValue(whole)))
}

describe('T-F1: a folded snapshot is the answer of a whole read', () => {
  it('commit: accept, startRun and a cancel-run control', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await folds(a, () => a.accept(TENANT_A, 'session-1', 'input-1'))
    await folds(a, () => a.accept(TENANT_A, 'session-1', 'input-2'))
    await folds(a, () => startRun(a, 'start-run-1'))
    await folds(a, () => a.accept(TENANT_A, 'session-1', 'input-3'))
    const run = activeRun(await readWork(a.port, a)).run
    await folds(a, () => cancelRun(a, run, 'cancel-1'))
  })

  it('commitEntries: an entries batch reduced on the stored snapshot alone', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    ok(await startRun(a, 'start-run-1'))
    const snapshot = await readWork(a.port, a)
    if (snapshot.run.kind !== 'active') throw new Error('the Run is not active')
    const call = 'entries-call-1'
    await folds(a, () =>
      a.port.commit({
        access: a.access(TENANT_A),
        command: {
          kind: 'bindExternalCall',
          input: {
            ...base,
            operation: operationId('entries-bind'),
            expected: snapshot.revision,
            qualification: evidence('entries/qualified'),
            binding: {
              producer: { kind: 'tool', call },
              action: 'action',
              consumer: {
                owner: 'session',
                work: 'work',
                position: 'entries-at',
                purpose: 'action',
              },
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
      ...base,
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
            { kind: 'execution', producer: { kind: 'tool', call }, source: evidence('t/f') },
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
    const commitEntries = a.port.commitEntries
    if (commitEntries === undefined) throw new Error('the SQL port offers no commitEntries')
    await folds(a, () => commitEntries({ observation, start: { kind: 'initial' } }))
  })

  it('commitLog: an observation reduced on the index and reads of its scope and focus', async () => {
    const a = await app()
    const agent = agentPublisher({
      storage: a.provider.storage,
      combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
      domainOf: () => 'dom_0',
    })
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    ok(await startRun(a, 'start-run-1'))
    const scene = activeRun(await readWork(a.port, a))
    const observation: SessionLogCommitObservation = eventOf(
      scene,
      1,
      [registrationOf(scene.attempt, 1)],
      'log-1',
    )
    await agent.publish(agentEventOf(observation))
    const commitLog = a.port.commitLog
    if (commitLog === undefined) throw new Error('the SQL port offers no commitLog')
    await folds(a, () => commitLog({ observation }))
  })
})

describe('T-F1: a batch whose reduction reads the history reads', () => {
  it('startRun on an input handed to an ended execution with an observed tail folds as a whole read', async () => {
    const a = await app()
    const agent = agentPublisher({
      storage: a.provider.storage,
      combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
      domainOf: () => 'dom_0',
    })
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    ok(await startRun(a, 'start-run-1'))
    const run = activeRun(await readWork(a.port, a))
    const first = eventOf(run, 1, [registrationOf(run.attempt, 'first')], 'log-first')
    await agent.publish(agentEventOf(first))
    const commitLog = a.port.commitLog
    if (commitLog === undefined) throw new Error('the SQL port offers no commitLog')
    ok(await commitLog({ observation: first }))
    ok(await a.accept(TENANT_A, 'session-1', 'input-2'))
    const second = (await readWork(a.port, a)).pending[0]
    if (second === undefined) throw new Error('input-2 is not pending')
    await agent.admit({
      tenant: TENANT_A,
      session: 'session-1',
      execution: run.execution,
      input: second,
      operation: 'aop-submit-2',
      accepted: evidence('agent/accepted/2'),
      grant: evidence('agent/grant/2'),
      attachment: 'attachment-1',
    })
    ok(
      await a.port.commit({
        access: a.access(TENANT_A),
        command: {
          kind: 'receive',
          input: {
            ...base,
            operation: operationId('handover-2'),
            fact: {
              kind: 'input-handover',
              execution: run.execution,
              input: second,
              result: { kind: 'accepted', receipt: evidence('agent/accepted/2') },
            },
          },
        } as never,
        guards: [],
      }),
    )
    // Events 2 and 3 of the execution are observed only: the next Run needs that tail (prefixes).
    for (const n of [2, 3])
      await agent.publish(agentEventOf(eventOf(run, n, [], 'unused'), ['observed']))
    ok(await cancelRun(a, run.run, 'cancel-1'))
    await folds(a, () => startRun(a, 'start-run-2'))
  })
})

describe('T-F1 (H2): the basis of a batch is read again as it was before the batch', () => {
  it('session.work-reads at the position before a startRun answers the index and reads read then', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    ok(await a.accept(TENANT_A, 'session-1', 'input-2'))
    const held = await wholeRead(a)
    const { historyIndex: _index, ...stored } = held
    const scope = { kind: 'pending', inputs: held.pending } as SessionInputScope
    const port = {
      execute: (sql: string, params: readonly unknown[]) =>
        a.provider.select('dom_0', sql, params as never) as never,
    }
    const then = readHistory(port, textOf(TENANT_A), 'session-1', stored as WorkSnapshot, scope)
    if (then === 'too-many') throw new Error('too many rows')
    const [[upto]] = a.provider.select(
      'dom_0',
      'SELECT MAX(position) FROM sl_entry WHERE tenant = ? AND session = ?',
      [textOf(TENANT_A), 'session-1'],
    ).rows as unknown as [[bigint]]
    // The batch adds a Run start, an attempt and the taken input after that position.
    ok(await startRun(a, 'start-run-1'))
    const read = await a.provider.storage.read({
      domain: { scope: { kind: 'tenant', tenant: textOf(TENANT_A) }, transactionDomain: 'dom_0' },
      handler: 'session.work-reads',
      protocol: PROTOCOL,
      requestKey: 'work-reads-1',
      input: {
        tenant: textOf(TENANT_A),
        session: 'session-1',
        revision: held.revision,
        published: '0',
        upto: String(upto),
        inputs: encodeValue(scope),
        focus: encodeValue(NO_FOCUS),
        snapshot: encodeValue(stored),
      },
    })
    if (read.kind !== 'read') throw new Error(`the read failed: ${read.kind}`)
    const output = read.output as Record<string, unknown>
    expect(output['kind']).toBe('basis')
    expect(canonicalText(output['basis'])).toBe(
      canonicalText(encodeValue({ index: then.index, reads: then.reads })),
    )
  })
})

describe('T-F2: only a fresh commit onto the version just below folds', () => {
  it('no held snapshot: nothing folds, and the next read is whole', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const before = workFoldCounts(a.provider.storage)
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    expect(since(a.provider.storage, before)).toEqual({ ...none, skipped: 1 })
    const from = a.provider.calls.length
    await readWork(a.port, a)
    expect(readsOf(a, WHOLE, from)).toBe(1)
  })

  it('a recall of a committed operation folds nothing', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await folds(a, () => a.accept(TENANT_A, 'session-1', 'input-1'))
    const before = workFoldCounts(a.provider.storage)
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    expect(since(a.provider.storage, before)).toEqual(none)
  })

  it('a commit the participant stops folds nothing', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await readWork(a.port, a)
    const before = workFoldCounts(a.provider.storage)
    const refused = await a.port.commit({
      access: a.access(TENANT_A),
      command: {
        kind: 'bindExternalCall',
        input: {
          ...base,
          operation: operationId('stale-bind'),
          expected: '999' as never,
          qualification: evidence('q'),
          binding: {
            producer: { kind: 'tool', call: 'c' },
            action: 'action',
            consumer: { owner: 'session', work: 'w', position: 'p', purpose: 'action' },
            request: evidence('r'),
            initiatingAttempt: null,
          },
        },
      },
      guards: [],
    })
    expect(refused).toHaveProperty('failure')
    expect(since(a.provider.storage, before)).toEqual(none)
  })

  it('the version below differs in the publication count: nothing folds', async () => {
    const a = await app()
    const agent = agentPublisher({
      storage: a.provider.storage,
      combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
      domainOf: () => 'dom_0',
    })
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    ok(await startRun(a, 'start-run-1'))
    const scene = activeRun(await readWork(a.port, a))
    // A publication that this cache did not see: the held version has the older count.
    await agent.publish(
      agentEventOf(eventOf(scene, 1, [registrationOf(scene.attempt, 1)], 'log-1')),
    )
    const before = workFoldCounts(a.provider.storage)
    ok(await a.accept(TENANT_A, 'session-1', 'input-2'))
    expect(since(a.provider.storage, before)).toEqual({ ...none, skipped: 1 })
  })
})

describe('the fold counts are those of one database', () => {
  it('a fold into the cache of one database counts there only, never in another one', async () => {
    const a = await app()
    const b = await app()
    ok(await a.create(TENANT_A))
    ok(await b.create(TENANT_A))
    await readWork(a.port, a)
    await readWork(b.port, b)
    const beforeA = workFoldCounts(a.provider.storage)
    const beforeB = workFoldCounts(b.provider.storage)
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    expect(since(a.provider.storage, beforeA)).toEqual({ ...none, folded: 1 })
    expect(since(b.provider.storage, beforeB)).toEqual(none)
    ok(await b.accept(TENANT_A, 'session-1', 'input-1'))
    ok(await b.accept(TENANT_A, 'session-1', 'input-2'))
    expect(since(b.provider.storage, beforeB)).toEqual({ ...none, folded: 2 })
    expect(since(a.provider.storage, beforeA)).toEqual({ ...none, folded: 1 })
  })
})

describe('a fold that the cache does not keep', () => {
  it('is not counted as folded: the new snapshot is over the byte bound of the cache', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const [[stored]] = a.provider.select(
      'dom_0',
      'SELECT snapshot FROM sl_state WHERE tenant = ? AND session = ?',
      [textOf(TENANT_A), 'session-1'],
    ).rows as unknown as [[string]]
    const chunks = a.provider.select(
      'dom_0',
      'SELECT value FROM sl_state_item WHERE tenant = ? AND session = ?',
      [textOf(TENANT_A), 'session-1'],
    ).rows as unknown as [Uint8Array][]
    // The stored size is the head text and the chunk texts (R2-D292).
    const bytes = chunks.reduce((sum, [value]) => sum + unpacked(value).length, stored.length)
    // The bound holds the snapshot read now, and not the larger one of the next commit.
    const { port, storage } = portOver(a, { bytes })
    await readWork(port, a)
    const before = workFoldCounts(storage)
    ok(await accept(a, port, 'input-1'))
    expect(since(storage, before)).toEqual(none)
  })
})

describe('T-F3: a publication between the commit and its fold', () => {
  it('the index read at the folded tail finds a newer count: the fold registers at that count with its index (P-4)', async () => {
    const a = await app()
    const agent = agentPublisher({
      storage: a.provider.storage,
      combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
      domainOf: () => 'dom_0',
    })
    const { port, storage, hooks } = portOver(a)
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    ok(await startRun(a, 'start-run-1'))
    ok(await a.accept(TENANT_A, 'session-1', 'input-2'))
    const run = activeRun(await readWork(port, a))
    hooks.set('session.work-index', () =>
      agent.admit({
        tenant: TENANT_A,
        session: 'session-1',
        execution: run.execution,
        input: 'input-2',
        operation: 'aop-submit-2',
        accepted: evidence('agent/accepted/2'),
        grant: evidence('agent/receipt/2'),
        attachment: 'attachment-1',
        attempt: run.attempt,
      }),
    )
    const before = workFoldCounts(storage)
    ok(await accept(a, port, 'input-3'))
    expect(since(storage, before)).toEqual({ ...none, folded: 1, republished: 1 })
    const from = a.provider.calls.length
    const after = await readWork(port, a)
    expect(readsOf(a, WHOLE, from)).toBe(0)
    const members = after.historyIndex?.inputs.find(item => item.input === 'input-2')?.members
    expect(members?.map(item => item.attempt)).toEqual([run.attempt])
    expect(canonicalText(encodeValue(after))).toBe(canonicalText(encodeValue(await wholeRead(a))))
  })

  it('a newer tail at the index read: nothing is registered, and the next read is whole', async () => {
    const a = await app()
    const { port, storage, hooks } = portOver(a)
    const other = portOver(a)
    ok(await a.create(TENANT_A))
    await readWork(port, a)
    hooks.set('session.work-index', async () => {
      ok(await accept(a, other.port, 'input-other'))
    })
    const before = workFoldCounts(storage)
    const otherBefore = workFoldCounts(other.storage)
    ok(await accept(a, port, 'input-1'))
    expect(since(storage, before)).toEqual({ ...none, stale: 1 })
    // The other port holds nothing, so its own commit skips its fold, in its own counts.
    expect(since(other.storage, otherBefore)).toEqual({ ...none, skipped: 1 })
    const from = a.provider.calls.length
    const after = await readWork(port, a)
    expect(readsOf(a, WHOLE, from)).toBe(1)
    expect(after.pending.length).toBe(2)
  })
})

describe('T-F3: a publication takes the index of the folded tail over the row bound', () => {
  it('the fold registers at the answered count; readers that waited for it answer as a whole read', async () => {
    const a = await app()
    const { port, storage, hooks } = portOver(a)
    ok(await a.create(TENANT_A))
    const held = await readWork(port, a)
    let readers: Promise<WorkSnapshot>[] = []
    hooks.set('session.work-index', async () => {
      readers = Array.from({ length: 3 }, () => readWork(port, a))
      // The readers read the folded version, the count before the publication, and wait.
      await new Promise(resolve => setTimeout(resolve, 20))
      // One publication: the count moves on, and the pending input gets more admission rows than
      // the index of a work answer may read (`WORK_INDEX_ROWS`), so the index read is `too-many`.
      a.provider.seed(
        'dom_0',
        `INSERT INTO er_admission_idx
           (tenant, session, input, ordinal, execution, operation, accepted, grant_ref, attachment)
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1001)
         SELECT ?, ?, 'input-1', i, 'execution-x', 'aop-' || i, '{}', '{}', 'attachment-x' FROM n`,
        [textOf(TENANT_A), 'session-1'],
      )
      a.provider.seed(
        'dom_0',
        `INSERT INTO er_root (tenant, session, published) VALUES (?, ?, 1)
           ON CONFLICT (tenant, session) DO UPDATE SET published = published + 1`,
        [textOf(TENANT_A), 'session-1'],
      )
    })
    const before = workFoldCounts(storage)
    ok(await accept(a, port, 'input-1'))
    expect(since(storage, before)).toEqual({ ...none, folded: 1, republished: 1 })
    const answers = await Promise.all(readers)
    expect(answers.length).toBe(3)
    const whole = await wholeRead(a)
    expect(whole.revision).toBe(String(BigInt(held.revision) + 1n))
    expect(whole.historyIndex).toBeUndefined()
    for (const answer of answers)
      expect(canonicalText(encodeValue(answer))).toBe(canonicalText(encodeValue(whole)))
    // The cache holds the version the store is at: the next read reads no whole snapshot.
    const from = a.provider.calls.length
    const after = await readWork(port, a)
    expect(readsOf(a, WHOLE, from)).toBe(0)
    expect(canonicalText(encodeValue(after))).toBe(canonicalText(encodeValue(whole)))
  })
})

describe('T-F3 (H2): a publication before the basis of the batch is read again', () => {
  it('the basis read finds another count: nothing is registered, and the next read is whole', async () => {
    const a = await app()
    const agent = agentPublisher({
      storage: a.provider.storage,
      combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
      domainOf: () => 'dom_0',
    })
    const { port, storage, hooks } = portOver(a)
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    ok(await startRun(a, 'start-run-1'))
    ok(await a.accept(TENANT_A, 'session-1', 'input-2'))
    const run = activeRun(await readWork(port, a))
    hooks.set('session.work-reads', () =>
      agent.admit({
        tenant: TENANT_A,
        session: 'session-1',
        execution: run.execution,
        input: 'input-2',
        operation: 'aop-submit-2',
        accepted: evidence('agent/accepted/2'),
        grant: evidence('agent/receipt/2'),
        attachment: 'attachment-1',
        attempt: run.attempt,
      }),
    )
    const before = workFoldCounts(storage)
    const committing = a.provider.calls.length
    ok(await accept(a, port, 'input-3'))
    expect(since(storage, before)).toEqual({ ...none, stale: 1 })
    // The fold stops at the basis read: it reads no index for a version it cannot prove.
    expect(readsOf(a, 'session.work-index', committing)).toBe(0)
    const from = a.provider.calls.length
    await readWork(port, a)
    expect(readsOf(a, WHOLE, from)).toBe(1)
  })
})

describe('T-F3 (H2): the index of this Worker went past the position before the batch', () => {
  it('the basis read is stale, nothing is registered, and the next read is whole', async () => {
    const a = await app()
    const { port, storage, hooks } = portOver(a)
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    await readWork(port, a)
    // An unbounded whole read in the same Worker moves its kept index past the batch.
    hooks.set('session.work-reads', async () => {
      await wholeRead(a)
    })
    const before = workFoldCounts(storage)
    ok(await startRun(portLike(a, port), 'start-run-1'))
    expect(since(storage, before)).toEqual({ ...none, stale: 1 })
    const from = a.provider.calls.length
    await readWork(port, a)
    expect(readsOf(a, WHOLE, from)).toBe(1)
  })
})

describe('T-F7: a fold that throws', () => {
  it('a reader waiting for it reads whole and answers the new tail', async () => {
    const a = await app()
    const { port, storage, hooks, rewrites } = portOver(a)
    ok(await a.create(TENANT_A))
    const held = await readWork(port, a)
    const readers: Promise<WorkSnapshot>[] = []
    hooks.set('session.history', async () => {
      readers.push(readWork(port, a))
      // The reader reads the new version while the fold waits for its batch.
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    // The batch read answers entries without their ids: the fold throws on them.
    rewrites.set('session.history', output => ({
      ...output,
      entries: (output['entries'] as string[]).map(text => {
        const { id: _id, ...rest } = JSON.parse(text) as Record<string, unknown>
        return JSON.stringify(rest)
      }),
    }))
    const before = workFoldCounts(storage)
    const from = a.provider.calls.length
    ok(await accept(a, port, 'input-1'))
    expect(readers.length).toBe(1)
    const answers = await Promise.all(readers)
    expect(answers[0]?.revision).toBe(String(BigInt(held.revision) + 1n))
    expect(readsOf(a, WHOLE, from)).toBe(1)
    expect(since(storage, before)).toEqual({ ...none, stale: 1 })
  })
})

describe('T-F4: a batch that reduce quarantines on the held snapshot', () => {
  it('is not registered; the quarantine is counted and the next read is whole', async () => {
    const a = await app()
    const { port, storage, hooks } = portOver(a)
    ok(await a.create(TENANT_A))
    await readWork(port, a)
    hooks.set('session.history', () => {
      const [[position, entry]] = a.provider.select(
        'dom_0',
        'SELECT position, entry FROM sl_entry WHERE tenant = ? AND session = ? ORDER BY position DESC LIMIT 1',
        [textOf(TENANT_A), 'session-1'],
      ).rows as unknown as [[bigint, Uint8Array]]
      const changed = JSON.parse(unpacked(entry)) as Record<string, unknown>
      changed['kind'] = 'x.unknown'
      a.provider.seed(
        'dom_0',
        'UPDATE sl_entry SET entry = ? WHERE tenant = ? AND session = ? AND position = ?',
        [packText(JSON.stringify(changed)), textOf(TENANT_A), 'session-1', position],
      )
    })
    const before = workFoldCounts(storage)
    ok(await accept(a, port, 'input-1'))
    expect(since(storage, before)).toEqual({ ...none, quarantined: 1 })
    const from = a.provider.calls.length
    const after = await readWork(port, a)
    expect(readsOf(a, WHOLE, from)).toBe(1)
    expect(after).toEqual(await wholeRead(a))
  })
})

describe('T-F5: reads of the new version while the fold runs', () => {
  it('wait for the fold: no whole read, and every answer is at the new tail', async () => {
    const a = await app()
    const { port, hooks } = portOver(a)
    ok(await a.create(TENANT_A))
    const held = await readWork(port, a)
    let readers: Promise<WorkSnapshot>[] = []
    hooks.set('session.work-index', async () => {
      readers = Array.from({ length: 10 }, () => readWork(port, a))
      // The readers read the version while the fold still waits for its index.
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    const from = a.provider.calls.length
    ok(await accept(a, port, 'input-1'))
    const answers = await Promise.all(readers)
    expect(readers.length).toBe(10)
    expect(readsOf(a, WHOLE, from)).toBe(0)
    const tail = String(BigInt(held.revision) + 1n)
    for (const answer of answers) expect(answer.revision).toBe(tail)
  })
})

describe('T-F6: a decision over the bound of the reply', () => {
  it('is left out of the reply: nothing folds, and the next read is whole', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    // Pending inputs with long names: the input range of the decision passes 16 KiB.
    for (let n = 0; n < 12; n += 1)
      ok(await a.accept(TENANT_A, 'session-1', `input-${String(n)}-${'x'.repeat(2000)}`))
    await readWork(a.port, a)
    const before = workFoldCounts(a.provider.storage)
    ok(await a.accept(TENANT_A, 'session-1', 'input-last'))
    expect(since(a.provider.storage, before)).toEqual({ ...none, skipped: 1 })
    const from = a.provider.calls.length
    await readWork(a.port, a)
    expect(readsOf(a, WHOLE, from)).toBe(1)
  })
})
