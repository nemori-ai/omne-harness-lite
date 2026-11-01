// Group commit G2-P inside the write Worker (SPEC 7.3, 7.5, 7.7). The scheduler collects adjacent,
// reserved, groupable commits. The group runs in one BEGIN IMMEDIATE transaction, one savepoint
// per original operation, and one COMMIT saves the receipts of all of them. A result leaves the
// Worker only after the physical commit that holds it. The first local failure ends the group:
// the prefix commits, the failed operation gets its rollback receipt in a second short
// transaction, and the suffix goes back to the front of the queue for a new group.
import type { DatabaseSync } from 'node:sqlite'
import type { ParticipantDescriptor, ReceiptV2 } from '@omne-harness/sql-contract'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { canonicalJson, utf8Length } from '../json.ts'
import { readWriteGeneration, rollbackQuietly, transact, type WorkerState } from './domain.ts'
import { describeError } from './errors.ts'
import {
  checkRegistration,
  executionOrder,
  insertReceipt,
  readReceipt,
  receiptOf,
  runParticipants,
  type Outcome,
} from './execute.ts'
import { MaterialMismatch } from './modules.ts'
import type { CommitReply, WorkerEnv, WorkerRequest } from './protocol.ts'
import { findSingletons } from './schema.ts'

/** A message with the time it reached the Worker. */
export type Queued = { id: number; request: WorkerRequest; arrivedAt: number }
export type CommitJob = Queued & { request: Extract<WorkerRequest, { kind: 'commit' }> }

export const isCommitJob = (item: Queued): item is CommitJob => item.request.kind === 'commit'

type Post = (id: number, reply: CommitReply) => void
export type GroupResult = Readonly<{
  /** Jobs that did not start. They go back to the front of the queue in this order. */
  unstarted: CommitJob[]
  /** The connection state is unclear: the Worker must end after the replies. */
  fatal: boolean
}>

type Entry = {
  readonly job: CommitJob
  /** Later calls of the same identity in this group (SPEC 7.7.3). */
  readonly waiters: CommitJob[]
  readonly order: string[]
  readonly modules: Map<string, ParticipantModule>
}

type Stop =
  | Readonly<{ kind: 'failed'; entry: Entry; savepoint: string; outcome: StoppedOutcome }>
  | Readonly<{ kind: 'environment'; entry: Entry; savepoint: string; error: unknown }>
  | Readonly<{ kind: 'broken'; entry: Entry; error: unknown }>

type StoppedOutcome = Extract<Outcome, { kind: 'stopped' }>

const jobBytes = (job: CommitJob): number => utf8Length(canonicalJson(job.request.request))

/**
 * ROLLBACK TO and RELEASE of one savepoint. `ended`: a statement already ended the whole
 * transaction (OR ROLLBACK), so nothing is left to undo (SPEC 7.7.5). `unclear`: the transaction
 * was alive and the rollback failed. The connection is not used again (SPEC 7.7.6 item 1).
 */
function clearSavepoint(db: DatabaseSync, savepoint: string): 'cleared' | 'ended' | 'unclear' {
  if (!db.isTransaction) return 'ended'
  try {
    db.exec(`ROLLBACK TO ${savepoint}`)
    db.exec(`RELEASE ${savepoint}`)
    return 'cleared'
  } catch {
    return 'unclear'
  }
}

export class GroupRunner {
  private readonly env: WorkerEnv
  private readonly state: WorkerState
  private readonly descriptors: ReadonlyMap<string, ParticipantDescriptor>
  private singletons: ReadonlySet<string> | null = null
  private readonly closing: () => boolean

  /** `closing` is true once the provider closes: the group starts no further operation (SPEC 13.3 step 3). */
  constructor(env: WorkerEnv, state: WorkerState, closing: () => boolean = () => false) {
    this.closing = closing
    this.env = env
    this.state = state
    this.descriptors = new Map(env.catalog.participants.map(item => [item.participant, item]))
  }

  /** The schema gate (SPEC 4.5) reads the file again after an open or a registration. */
  invalidate(): void {
    this.singletons = null
  }

  private groupable(job: CommitJob): boolean {
    const db = this.state.db
    if (db === null) return false
    this.singletons ??= new Set(findSingletons(db, this.env.catalog.participants))
    const singletons = this.singletons
    return job.request.request.commands.every(command => {
      const descriptor = this.descriptors.get(command.participant)
      return (
        descriptor !== undefined &&
        descriptor.grouping === 'groupable' &&
        !singletons.has(command.participant)
      )
    })
  }

  /**
   * The group that starts with `first`: the commits at the front of `inbox` that are groupable,
   * until a limit, the end of the collection window, a barrier or a non-groupable commit.
   * `wait` resolves when a message arrives or the given time passed.
   */
  async collect(
    first: CommitJob,
    inbox: Queued[],
    wait: (ms: number) => Promise<void>,
  ): Promise<CommitJob[]> {
    const group = [first]
    if (!this.groupable(first)) return group
    const { groupMaxOperations, groupMaxInputBytes, groupMaxResponseReservationBytes } = this.env
    let bytes = jobBytes(first)
    const deadline = first.arrivedAt + this.env.groupCollectMs
    while (group.length < groupMaxOperations) {
      const next = inbox[0]
      if (next === undefined) {
        const left =
          deadline -
          /* wall-clock: operation-timing -- Group collection window and execution slice (SPEC 7.3). */ performance.now()
        if (left <= 0) break
        await wait(left)
        continue
      }
      if (!isCommitJob(next) || !this.groupable(next)) break
      const size = jobBytes(next)
      if (
        bytes + size > groupMaxInputBytes ||
        (group.length + 1) * this.env.maxOperationResponseBytes > groupMaxResponseReservationBytes
      )
        break
      bytes += size
      group.push(next)
      inbox.shift()
    }
    return group
  }

  /** Runs one group to its end. Every job is answered, or returned in `unstarted`. */
  async run(jobs: readonly CommitJob[], post: Post): Promise<GroupResult> {
    const db = this.state.db as DatabaseSync
    const sent = new Set<CommitJob>()
    const send = (job: CommitJob, reply: CommitReply): void => {
      sent.add(job)
      post(job.id, reply)
    }
    const settle = (entry: Entry, make: (job: CommitJob) => CommitReply): void => {
      for (const job of [entry.job, ...entry.waiters]) send(job, make(job))
    }
    const settleReceipt = (entry: Entry, receipt: ReceiptV2): void =>
      settle(entry, job =>
        job.request.inputDigest === entry.job.request.inputDigest
          ? { kind: 'receipt', receipt }
          : { kind: 'conflict', existing: receipt },
      )
    const settleUnknown = (entry: Entry, diagnostic: string): void =>
      settle(entry, () => ({ kind: 'unknown', diagnostic }))
    const rest = (): CommitJob[] => jobs.filter(job => !sent.has(job))

    const entries = this.admit(db, jobs, send)
    if (entries.length === 0) return { unstarted: rest(), fatal: false }
    try {
      for (const entry of entries)
        for (const name of entry.order) {
          const descriptor = this.descriptors.get(name) as ParticipantDescriptor
          entry.modules.set(
            name,
            await this.state.modules.load<ParticipantModule>(
              descriptor.moduleUrl,
              descriptor.codeDigest,
            ),
          )
        }
    } catch (error) {
      const diagnostic =
        error instanceof MaterialMismatch ? 'material_digest_mismatch' : 'module_load_failed'
      for (const entry of entries) settle(entry, () => ({ kind: 'quarantine', diagnostic }))
      return { unstarted: rest(), fatal: false }
    }

    try {
      db.exec('BEGIN IMMEDIATE')
    } catch (error) {
      for (const entry of entries) settleUnknown(entry, describeError('begin', error))
      return { unstarted: rest(), fatal: false }
    }
    // Another opener advanced the write generation: this Worker is not the writer of the file any
    // more. Nothing runs, and the Worker ends (SPEC 7.5 step 1, 13.5).
    let generation: number | null = null
    try {
      generation = readWriteGeneration(db)
    } catch {
      // The diagnostic below says that the value could not be read.
    }
    if (generation === null || generation !== this.state.writeGeneration) {
      rollbackQuietly(db)
      const diagnostic =
        generation === null ? 'write_generation_unreadable' : 'write_generation_changed'
      for (const entry of entries) settleUnknown(entry, diagnostic)
      return { unstarted: rest(), fatal: true }
    }

    const staged: { entry: Entry; receipt: ReceiptV2 }[] = []
    const started =
      /* wall-clock: operation-timing -- Group collection window and execution slice (SPEC 7.3). */ performance.now()
    let stop: Stop | null = null
    for (const [index, entry] of entries.entries()) {
      if (
        index > 0 &&
        (this.closing() ||
          /* wall-clock: operation-timing -- Group collection window and execution slice (SPEC 7.3). */ performance.now() -
            started >
            this.env.groupMaxExecutionSliceMs)
      )
        break
      const savepoint = `op_${String(index + 1)}`
      const request = entry.job.request.request
      let outcome: Outcome
      try {
        db.exec(`SAVEPOINT ${savepoint}`)
        outcome = runParticipants(
          db,
          this.env,
          entry.order,
          this.descriptors,
          entry.modules,
          request,
        )
      } catch (error) {
        stop = { kind: 'broken', entry, error }
        break
      }
      if (outcome.kind === 'participated') {
        const receipt = receiptOf(
          'committed',
          request,
          entry.job.request.inputDigest,
          outcome.entries,
        )
        try {
          insertReceipt(db, receipt)
          db.exec(`RELEASE ${savepoint}`)
        } catch (error) {
          stop = { kind: 'environment', entry, savepoint, error }
          break
        }
        staged.push({ entry, receipt })
        continue
      }
      stop =
        outcome.kind === 'stopped'
          ? { kind: 'failed', entry, savepoint, outcome }
          : { kind: 'environment', entry, savepoint, error: outcome.error }
      break
    }

    const commitOuter = (): unknown => {
      try {
        db.exec('COMMIT')
        return null
      } catch (error) {
        rollbackQuietly(db)
        return error
      }
    }
    const unknownStaged = (diagnostic: string): void => {
      for (const item of staged) settleUnknown(item.entry, diagnostic)
    }
    const settleStaged = (): void => {
      for (const item of staged) settleReceipt(item.entry, item.receipt)
    }
    // The second short transaction: only the rollback receipt of the failed operation (SPEC 7.7.1).
    const writeRollback = (failed: Extract<Stop, { kind: 'failed' }>): boolean => {
      const request = failed.entry.job.request.request
      const receipt = receiptOf(
        'rolled_back',
        request,
        failed.entry.job.request.inputDigest,
        failed.outcome.entries,
      )
      try {
        transact(db, () => insertReceipt(db, receipt))
        settleReceipt(failed.entry, receipt)
      } catch (error) {
        settleUnknown(failed.entry, describeError('rollback_receipt', error))
      }
      return db.isTransaction
    }

    if (stop === null) {
      const error = commitOuter()
      if (error === null) settleStaged()
      else unknownStaged(describeError('commit', error))
      return { unstarted: rest(), fatal: db.isTransaction }
    }
    if (stop.kind === 'broken') {
      rollbackQuietly(db)
      unknownStaged('group_aborted')
      settleUnknown(stop.entry, describeError('execute', stop.error))
      return { unstarted: rest(), fatal: db.isTransaction }
    }

    const cleared = clearSavepoint(db, stop.savepoint)
    if (cleared === 'unclear') {
      unknownStaged('rollback_state_unclear')
      settleUnknown(stop.entry, 'rollback_state_unclear')
      return { unstarted: rest(), fatal: true }
    }
    if (cleared === 'ended') {
      // The whole outer transaction is gone, and with it every staged write (SPEC 7.7.2).
      unknownStaged('transaction_ended')
      if (stop.kind === 'failed' && staged.length === 0) {
        const fatal = writeRollback(stop)
        return { unstarted: rest(), fatal }
      }
      settleUnknown(stop.entry, 'transaction_ended')
      return { unstarted: rest(), fatal: false }
    }

    // The outer transaction is alive and the failed operation left no trace in it.
    if (staged.length > 0) {
      const error = commitOuter()
      if (error !== null) {
        const diagnostic = describeError('commit', error)
        unknownStaged(diagnostic)
        settleUnknown(stop.entry, diagnostic)
        return { unstarted: rest(), fatal: db.isTransaction }
      }
      settleStaged()
    } else {
      try {
        db.exec('ROLLBACK')
      } catch {
        rollbackQuietly(db)
      }
      if (db.isTransaction) {
        settleUnknown(stop.entry, 'rollback_state_unclear')
        return { unstarted: rest(), fatal: true }
      }
    }
    if (stop.kind === 'environment') {
      settleUnknown(stop.entry, describeError('environment', stop.error))
      return { unstarted: rest(), fatal: false }
    }
    const fatal = writeRollback(stop)
    return { unstarted: rest(), fatal }
  }

  /**
   * Steps 9 to 15 of SPEC 7.2 and the recognition of an earlier receipt answer at once: they do
   * not depend on what the group has staged. The others become entries, in arrival order.
   */
  private admit(
    db: DatabaseSync,
    jobs: readonly CommitJob[],
    send: (job: CommitJob, reply: CommitReply) => void,
  ): Entry[] {
    const entries: Entry[] = []
    const byIdentity = new Map<string, Entry>()
    for (const job of jobs) {
      const request = job.request.request
      const rejected = checkRegistration(db, this.env, request, this.descriptors)
      if (rejected !== null) {
        send(job, { kind: 'rejected', reason: rejected })
        continue
      }
      const existing = readReceipt(db, request.identity)
      if (existing !== null) {
        send(
          job,
          existing.inputDigest === job.request.inputDigest
            ? { kind: 'receipt', receipt: existing }
            : { kind: 'conflict', existing },
        )
        continue
      }
      const key = JSON.stringify([request.identity.operation, request.identity.operationKey])
      const owner = byIdentity.get(key)
      if (owner !== undefined) {
        owner.waiters.push(job)
        continue
      }
      const entry: Entry = {
        job,
        waiters: [],
        order: executionOrder(
          request.commands.map(command => command.participant),
          this.descriptors,
        ),
        modules: new Map(),
      }
      entries.push(entry)
      byIdentity.set(key, entry)
    }
    return entries
  }
}
