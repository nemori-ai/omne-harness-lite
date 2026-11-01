// Group execution with injected SQLite faults (SPEC 7.7.1, 7.7.2, scenarios C03, C04, C09, C13).
// The group runner works on a real domain file and a real connection. A wrapper around the
// connection throws for chosen statements, the way an I/O error would. This is a fault injection
// with a wrapped connection, not a proof about a failing disk.
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inputDigestV2, type CommitRequestV2 } from '@omne-harness/sql-contract'
import { GroupRunner, type CommitJob } from '../src/worker/group.ts'
import { ModuleCache } from '../src/worker/modules.ts'
import type { CommitReply, WorkerEnv } from '../src/worker/protocol.ts'
import {
  createProvider,
  defaultConfig,
  makeWorkspace,
  type Built,
  type Workspace,
} from './support.ts'
import {
  buildGroupMaterials,
  domainFile,
  groupRegistration,
  op,
  readRows,
  seqCommand,
} from './group-support.ts'
import { DOMAIN } from './support.ts'

let workspace: Workspace
let built: Built
let real: DatabaseSync | null = null

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildGroupMaterials(workspace)
  const provider = await createProvider(workspace, built)
  const registered = await provider.storage.registerCombination(groupRegistration(built))
  if (registered.kind !== 'registered') throw new Error(registered.kind)
  await provider.control.close({ initiator: 'disposal' })
})

afterEach(async () => {
  try {
    real?.exec('rollback')
  } catch {
    // No transaction was open.
  }
  real?.close()
  real = null
  await workspace.remove()
})

type Log = string[]

/** Wraps the connection: every exec is logged, and `fail` can make one throw an I/O error. */
function wrap(
  db: DatabaseSync,
  log: Log,
  fail: (sql: string, count: number) => boolean,
): DatabaseSync {
  const counts = new Map<string, number>()
  return new Proxy(db, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target)
      if (property === 'exec')
        return (sql: string) => {
          const count = (counts.get(sql) ?? 0) + 1
          counts.set(sql, count)
          if (fail(sql, count)) {
            log.push(`fail:${sql}`)
            throw Object.assign(new Error('injected'), { errcode: 10 })
          }
          log.push(`exec:${sql}`)
          return target.exec(sql)
        }
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value
    },
  })
}

function runner(log: Log, fail: (sql: string, count: number) => boolean): GroupRunner {
  real = new DatabaseSync(domainFile(workspace))
  real.exec('PRAGMA foreign_keys = ON')
  const config = defaultConfig(workspace.storageRoot)
  const env: WorkerEnv = {
    file: domainFile(workspace),
    domain: DOMAIN,
    catalog: built.catalog,
    lockWaitMs: config.lockWaitMs,
    walAutocheckpointPages: config.walAutocheckpointPages,
    journalSizeLimitBytes: config.journalSizeLimitBytes,
    maxResponseBytes: config.maxResponseBytes,
    maxOperationResponseBytes: config.maxOperationResponseBytes,
    maxDiagnosticBytes: config.maxDiagnosticBytes,
    groupMaxOperations: config.groupMaxOperations,
    groupCollectMs: 0,
    groupMaxInputBytes: config.groupMaxInputBytes,
    groupMaxResponseReservationBytes: config.groupMaxResponseReservationBytes,
    groupMaxExecutionSliceMs: 1000,
    generation: 1,
    checkpointIntervalMs: 1000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closingFlag: new SharedArrayBuffer(4),
  }
  return new GroupRunner(env, { db: wrap(real, log, fail), modules: new ModuleCache() })
}

const job = (id: number, request: CommitRequestV2): CommitJob => ({
  id,
  arrivedAt: 0,
  request: { kind: 'commit', request, inputDigest: inputDigestV2(request) },
})

const insert = (key: string): CommitRequestV2 => op(built, key, [seqCommand({ tag: key })])
const failing = (key: string): CommitRequestV2 =>
  op(built, key, [seqCommand({ mode: 'fail', tag: key })])

type Outcome = Readonly<{ replies: Map<number, CommitReply>; fatal: boolean; unstarted: number[] }>

async function run(
  group: GroupRunner,
  log: Log,
  requests: readonly CommitRequestV2[],
): Promise<Outcome> {
  const replies = new Map<number, CommitReply>()
  const result = await group.run(
    requests.map((request, index) => job(index + 1, request)),
    (id, reply) => {
      log.push(`post:${String(id)}:${reply.kind}`)
      replies.set(id, reply)
    },
  )
  return { replies, fatal: result.fatal, unstarted: result.unstarted.map(item => item.id) }
}

const kinds = (outcome: Outcome): string[] =>
  [...outcome.replies.entries()].sort(([a], [b]) => a - b).map(([, reply]) => reply.kind)

const receipts = (): unknown[] =>
  readRows(workspace, 'select operation_key, kind from _sql_receipt order by rowid')

describe('C03, C18: a result is posted only after the physical commit that holds it', () => {
  it('posts the group results after the outer COMMIT', async () => {
    const log: Log = []
    const group = runner(log, () => false)
    const outcome = await run(group, log, [insert('a'), insert('b')])
    expect(kinds(outcome)).toEqual(['receipt', 'receipt'])
    const commit = log.indexOf('exec:COMMIT')
    expect(commit).toBeGreaterThan(-1)
    expect(log.findIndex(entry => entry.startsWith('post:'))).toBeGreaterThan(commit)
    expect(log.filter(entry => entry === 'exec:COMMIT')).toHaveLength(1)
    expect(log).toContain('exec:SAVEPOINT op_1')
    expect(log).toContain('exec:SAVEPOINT op_2')
  })

  it('posts the failed operation only after the second short transaction commits', async () => {
    const log: Log = []
    const group = runner(log, () => false)
    const outcome = await run(group, log, [insert('a'), failing('b'), insert('c')])
    expect(kinds(outcome).slice(0, 2)).toEqual(['receipt', 'receipt'])
    expect(outcome.unstarted).toEqual([3])
    const commits = log.flatMap((entry, index) => (entry === 'exec:COMMIT' ? [index] : []))
    expect(commits).toHaveLength(2)
    expect(log.indexOf('post:1:receipt')).toBeGreaterThan(commits[0] as number)
    expect(log.indexOf('post:2:receipt')).toBeGreaterThan(commits[1] as number)
    expect(log.indexOf('post:1:receipt')).toBeLessThan(commits[1] as number)
    expect(log).toContain('exec:ROLLBACK TO op_2')
  })
})

describe('C04: faults in the two physical phases (SPEC 7.7.2)', () => {
  it('prefix COMMIT fails: the prefix and the failed operation are unknown, and the failed one is not saved', async () => {
    const log: Log = []
    const group = runner(log, (sql, count) => sql === 'COMMIT' && count === 1)
    const outcome = await run(group, log, [insert('a'), failing('b')])
    expect(kinds(outcome)).toEqual(['unknown', 'unknown'])
    expect(receipts()).toEqual([])
    expect(log.filter(entry => entry === 'exec:BEGIN IMMEDIATE')).toHaveLength(1)
  })

  it('second short transaction fails: the prefix stays committed, the failed operation is unknown', async () => {
    const log: Log = []
    const group = runner(log, (sql, count) => sql === 'BEGIN IMMEDIATE' && count === 2)
    const outcome = await run(group, log, [insert('a'), failing('b')])
    expect(kinds(outcome)).toEqual(['receipt', 'unknown'])
    expect(receipts()).toEqual([{ operation_key: 'a', kind: 'committed' }])
  })

  it('second short transaction COMMIT fails: the failed operation is unknown and nothing of it is durable', async () => {
    const log: Log = []
    const group = runner(log, (sql, count) => sql === 'COMMIT' && count === 2)
    const outcome = await run(group, log, [insert('a'), failing('b')])
    expect(kinds(outcome)).toEqual(['receipt', 'unknown'])
    expect(receipts()).toEqual([{ operation_key: 'a', kind: 'committed' }])
  })

  it('a COMMIT that fails with no failed operation leaves the whole group unknown', async () => {
    const log: Log = []
    const group = runner(log, (sql, count) => sql === 'COMMIT' && count === 1)
    const outcome = await run(group, log, [insert('a'), insert('b')])
    expect(kinds(outcome)).toEqual(['unknown', 'unknown'])
    expect(outcome.fatal).toBe(false)
    expect(receipts()).toEqual([])
  })
})

describe('C09: ROLLBACK TO that cannot be confirmed (SPEC 7.7.2, state unclear)', () => {
  it('ROLLBACK TO and ROLLBACK both fail: prefix and failed operation are unknown, the group stops, the Worker must end', async () => {
    const log: Log = []
    const group = runner(log, sql => sql.startsWith('ROLLBACK'))
    const outcome = await run(group, log, [insert('a'), failing('b'), insert('c')])
    expect(kinds(outcome)).toEqual(['unknown', 'unknown'])
    expect(outcome.fatal).toBe(true)
    expect(log.some(entry => entry === 'exec:COMMIT')).toBe(false)
  })

  it('ROLLBACK TO fails but the transaction can be rolled back: nothing is durable and nothing is claimed', async () => {
    const log: Log = []
    const group = runner(log, sql => sql.startsWith('ROLLBACK TO'))
    const outcome = await run(group, log, [insert('a'), failing('b')])
    expect(kinds(outcome)).toEqual(['unknown', 'unknown'])
    expect(outcome.fatal).toBe(true)
    expect(receipts()).toEqual([])
  })

  // SPEC 7.7.6 item 1: the outer transaction was alive when ROLLBACK TO failed. The connection is
  // not used again, so no second short transaction and no suffix runs on it.
  it('ROLLBACK TO fails with no prefix: the failed operation is unknown, no rolled_back receipt, the Worker must end', async () => {
    const log: Log = []
    const group = runner(log, sql => sql.startsWith('ROLLBACK TO'))
    const outcome = await run(group, log, [failing('b')])
    expect([...outcome.replies.values()]).toEqual([
      { kind: 'unknown', diagnostic: 'rollback_state_unclear' },
    ])
    expect(outcome.fatal).toBe(true)
    expect(receipts()).toEqual([])
    expect(log.filter(entry => entry === 'exec:BEGIN IMMEDIATE')).toHaveLength(1)
  })

  it('ROLLBACK TO fails after a staged prefix: prefix and failed operation are unknown, the suffix does not run', async () => {
    const log: Log = []
    const group = runner(log, sql => sql.startsWith('ROLLBACK TO'))
    const outcome = await run(group, log, [insert('a'), failing('b'), insert('c')])
    expect(kinds(outcome)).toEqual(['unknown', 'unknown'])
    expect(outcome.replies.get(1)).toEqual({ kind: 'unknown', diagnostic: 'rollback_state_unclear' })
    expect(outcome.fatal).toBe(true)
    expect(outcome.unstarted).toEqual([3])
    expect(receipts()).toEqual([])
    expect(log).not.toContain('exec:SAVEPOINT op_3')
    expect(log.filter(entry => entry === 'exec:BEGIN IMMEDIATE')).toHaveLength(1)
  })
})
