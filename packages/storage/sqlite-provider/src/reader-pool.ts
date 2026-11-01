// The read pool (SPEC 9.5, 12.2): the control side of all read Workers of one provider generation.
// It owns the read reservations, the per-domain read queue, the readers and their connections, and
// the result of every read. A reader is one read Worker with one connection. The pool opens one
// only after its domain is ready, hands a reader to one request at a time, and never reuses a
// connection whose tag no longer fits (scope, domain, binding row, schema generation, Worker
// generation). A cancelled or timed-out request stops being observed, but its reader stays busy
// until the Worker has answered or exited.
import type {
  JsonValue,
  ReadHandlerDescriptor,
  ReadUnavailableReason,
  StorageScope,
} from '@omne-harness/sql-contract'
import type { SqliteStorageConfig } from './config.ts'
import type { Domains, Lifecycle, ReadyDomain } from './domains.ts'
import { decodeScope, scopeKey } from './fields.ts'
import { ReaderClient } from './reader-client.ts'
import type { WriteBarrier } from './write-barrier.ts'
import type { HandlerSpec, ReaderReply } from './worker/reader-protocol.ts'
import { WorkerExited } from './writer-client.ts'

export type ReadOutcome =
  | Readonly<{ kind: 'read'; output: JsonValue }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{
      kind: 'unavailable'
      reason: Exclude<ReadUnavailableReason, 'invalid'>
      diagnostic: string
    }>

export type ReadJob = Readonly<{
  domain: string
  scope: StorageScope
  handler: ReadHandlerDescriptor
  input: JsonValue
  signal: AbortSignal | undefined
}>

/** A reader that has not exited yet, for the residuals of an incomplete close. */
export type LiveReader = Readonly<{
  domain: string
  scope: StorageScope
  workerGeneration: number
  leaseName: string
  busy: boolean
}>

const unavailable = (
  reason: Exclude<ReadUnavailableReason, 'invalid'>,
  diagnostic: string = reason,
): ReadOutcome => ({ kind: 'unavailable', reason, diagnostic })

type Phase = 'queued' | 'assigned' | 'dispatched'

/** One read request from its reservation to the release of that reservation. */
class Task {
  readonly job: ReadJob
  phase: Phase = 'queued'
  settled = false
  /** Takes the task out of the queue it waits in, if any. */
  leaveQueue: (() => void) | null = null
  private timer: NodeJS.Timeout | null = null
  private finished = false
  private readonly onSettled: (outcome: ReadOutcome) => void
  private readonly giveBack: () => void
  private readonly signal: AbortSignal | undefined
  private readonly onAbort: () => void

  constructor(
    job: ReadJob,
    onSettled: (outcome: ReadOutcome) => void,
    giveBack: () => void,
    onAbort: () => void,
  ) {
    this.job = job
    this.onSettled = onSettled
    this.giveBack = giveBack
    this.signal = job.signal
    this.onAbort = onAbort
    this.signal?.addEventListener('abort', onAbort, { once: true })
  }

  /** Gives the caller the result. The first call wins. Nothing else is released here. */
  settle(outcome: ReadOutcome): void {
    if (this.settled) return
    this.settled = true
    this.stopTimer()
    this.signal?.removeEventListener('abort', this.onAbort)
    this.onSettled(outcome)
  }

  /** Returns the reservation, once. Called when the owner of the work is done with it. */
  finish(): void {
    if (this.finished) return
    this.finished = true
    this.stopTimer()
    this.giveBack()
  }

  startTimer(ms: number, fire: () => void): void {
    this.stopTimer()
    this.timer = setTimeout(fire, ms)
  }

  stopTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }
}

type PoolReader = {
  client: ReaderClient
  readonly domain: string
  readonly entry: ReadyDomain
  readonly generation: number
  readonly leaseName: string
  readonly lease: object
  /** Schema generation of the domain when the connection was opened. */
  readonly schema: number
  /** Scope of the binding row that the connection read when it opened. Set when ready. */
  boundScope: string | null
  state: 'starting' | 'idle' | 'busy' | 'closing'
  idleTimer: NodeJS.Timeout | null
}

type DomainReaders = {
  readonly queue: Task[]
  readonly readers: PoolReader[]
  /** Counts the migrations that changed the schema of the domain (SPEC 9.5, last item). */
  schema: number
  /** While above zero a migration runs or waits: no new read is dispatched. */
  pauses: number
}

export class ReaderPool {
  private readonly config: SqliteStorageConfig
  private readonly domains: Domains
  private readonly lifecycle: Lifecycle
  private readonly barrier: WriteBarrier
  private readonly byDomain = new Map<string, DomainReaders>()
  private readonly perDomainReserved = new Map<string, number>()
  private reserved = 0
  private reservedBytes = 0
  private readerCount = 0
  private readerGeneration = 0
  private tokenCounter = 0
  private closing = false

  constructor(
    config: SqliteStorageConfig,
    domains: Domains,
    lifecycle: Lifecycle,
    barrier: WriteBarrier,
  ) {
    this.barrier = barrier
    this.config = config
    this.domains = domains
    this.lifecycle = lifecycle
  }

  /** Reads of one request: reserve, wait for the domain, queue, run. Resolves exactly once. */
  read(job: ReadJob): Promise<ReadOutcome> {
    if (this.closing || this.lifecycle.closing) return Promise.resolve(unavailable('closing'))
    const give = this.reserve(job.domain, job.handler.maxOutputBytes)
    if (give === null) return Promise.resolve(unavailable('queue_full'))
    return new Promise<ReadOutcome>(resolve => {
      const task: Task = new Task(job, resolve, give, () => this.aborted(task))
      task.startTimer(this.config.readQueueTimeoutMs, () => this.queueExpired(task))
      void this.enqueue(task)
    })
  }

  /** Stops the pool and closes every reader. Queued reads end as `closing`. */
  async closeAll(): Promise<void> {
    this.closing = true
    const closing: Promise<void>[] = []
    for (const d of this.byDomain.values()) {
      this.drain(d, unavailable('closing'))
      for (const reader of d.readers) closing.push(this.retire(reader))
    }
    await Promise.all(closing)
  }

  /** Readers whose exit has not been observed. */
  liveReaders(): readonly LiveReader[] {
    const live: LiveReader[] = []
    for (const [domain, d] of this.byDomain)
      for (const reader of d.readers)
        live.push({
          domain,
          scope: reader.entry.scope,
          workerGeneration: reader.generation,
          leaseName: reader.leaseName,
          busy: reader.state === 'busy' || reader.state === 'starting',
        })
    return live
  }

  /**
   * A migration of the domain is about to run (SPEC 9.5, last item): stop dispatch, let the reads
   * in flight end, close every connection and wait for the exits. The schema generation moves on,
   * so no old connection or result serves a new read. The returned function ends the pause.
   */
  async pauseForMigration(domain: string): Promise<() => void> {
    const d = this.domainState(domain)
    d.pauses += 1
    await Promise.all(d.readers.map(reader => this.retire(reader)))
    d.schema += 1
    let resumed = false
    return () => {
      if (resumed) return
      resumed = true
      d.pauses -= 1
      this.pump(domain)
    }
  }

  // --- reservations (SPEC 9.2 step 6) -------------------------------------------------------

  private reserve(domain: string, bytes: number): (() => void) | null {
    const { readQueuePerDomain, readQueueGlobal, globalReadResultBytes } = this.config
    if (
      (this.perDomainReserved.get(domain) ?? 0) >= readQueuePerDomain ||
      this.reserved >= readQueueGlobal ||
      this.reservedBytes + bytes > globalReadResultBytes
    )
      return null
    this.perDomainReserved.set(domain, (this.perDomainReserved.get(domain) ?? 0) + 1)
    this.reserved += 1
    this.reservedBytes += bytes
    return () => {
      const left = (this.perDomainReserved.get(domain) ?? 1) - 1
      if (left <= 0) this.perDomainReserved.delete(domain)
      else this.perDomainReserved.set(domain, left)
      this.reserved -= 1
      this.reservedBytes -= bytes
    }
  }

  // --- waiting: domain, queue, expiry, abort -------------------------------------------------

  private domainState(domain: string): DomainReaders {
    let d = this.byDomain.get(domain)
    if (d === undefined) {
      d = { queue: [], readers: [], schema: 0, pauses: 0 }
      this.byDomain.set(domain, d)
    }
    return d
  }

  private async enqueue(task: Task): Promise<void> {
    const { job } = task
    let outcome: Awaited<ReturnType<Domains['ensure']>>
    try {
      outcome = await this.domains.ensure(job.domain, null)
    } catch {
      this.endQueued(task, unavailable('read_failed', 'provider_error'))
      return
    }
    // The request may have ended while the domain opened (expiry, abort). Then it is done.
    if (task.settled) return task.finish()
    if (outcome.kind === 'closing') return this.endQueued(task, unavailable('closing'))
    if (outcome.kind !== 'ready' || scopeKey(outcome.entry.scope) !== scopeKey(job.scope))
      return this.endQueued(task, unavailable('domain_unavailable'))
    this.park(this.domainState(job.domain), task, false)
    this.pump(job.domain)
  }

  private park(d: DomainReaders, task: Task, front: boolean): void {
    task.phase = 'queued'
    if (front) d.queue.unshift(task)
    else d.queue.push(task)
    task.leaveQueue = () => {
      const at = d.queue.indexOf(task)
      if (at >= 0) d.queue.splice(at, 1)
    }
  }

  /** Ends a task that no Worker has seen. */
  private endQueued(task: Task, outcome: ReadOutcome): void {
    task.leaveQueue?.()
    task.settle(outcome)
    task.finish()
  }

  private queueExpired(task: Task): void {
    if (task.phase === 'dispatched') return
    if (task.phase === 'queued') this.endQueued(task, unavailable('queue_timeout'))
    else task.settle(unavailable('queue_timeout'))
  }

  private aborted(task: Task): void {
    // Queued: the control side takes it out. Running: only the observation ends (SPEC 9.2).
    if (task.phase === 'queued') this.endQueued(task, { kind: 'cancelled' })
    else task.settle({ kind: 'cancelled' })
  }

  private drain(d: DomainReaders, outcome: ReadOutcome): void {
    for (const task of d.queue.splice(0)) {
      task.settle(outcome)
      task.finish()
    }
  }

  // --- dispatch -----------------------------------------------------------------------------

  private pump(domain: string): void {
    const d = this.domainState(domain)
    for (;;) {
      const task = d.queue[0]
      if (task === undefined || d.pauses > 0) return
      if (this.closing || this.lifecycle.closing) return this.drain(d, unavailable('closing'))
      const entry = this.domains.peekReady(domain)
      if (entry === null || scopeKey(entry.scope) !== scopeKey(task.job.scope)) {
        d.queue.shift()
        task.settle(unavailable('domain_unavailable'))
        task.finish()
        continue
      }
      const reader = this.acquire(d, entry)
      if (reader === null) return
      d.queue.shift()
      task.leaveQueue = null
      task.phase = 'assigned'
      void this.run(d, task, reader)
    }
  }

  private pumpAll(): void {
    for (const [domain, d] of this.byDomain) if (d.queue.length > 0) this.pump(domain)
  }

  /** A reader that fits the tag and is idle, or a new one, or null when the request must wait. */
  private acquire(d: DomainReaders, entry: ReadyDomain): PoolReader | null {
    const scope = scopeKey(entry.scope)
    for (const reader of d.readers) {
      if (reader.state !== 'idle') continue
      // A tag that no longer fits isolates the connection. It is closed, never relabelled.
      if (reader.entry !== entry || reader.schema !== d.schema || reader.boundScope !== scope) {
        void this.retire(reader)
        continue
      }
      this.stopIdle(reader)
      reader.state = 'busy'
      return reader
    }
    if (d.readers.length >= this.config.maxReadWorkersPerDomain) return null
    if (!this.hasSlot()) {
      this.freeSlot()
      return null
    }
    return this.spawn(d, entry)
  }

  private hasSlot(): boolean {
    const { maxWorkers, reservedWriterSlots } = this.config
    return (
      this.readerCount < maxWorkers - reservedWriterSlots &&
      this.domains.liveWorkers().length + this.readerCount < maxWorkers
    )
  }

  /** Closes one idle reader of any domain, so that the slot is free once its exit is observed. */
  private freeSlot(): void {
    for (const d of this.byDomain.values())
      for (const reader of d.readers)
        if (reader.state === 'idle') return void this.retire(reader)
  }

  private spawn(d: DomainReaders, entry: ReadyDomain): PoolReader | null {
    this.readerGeneration += 1
    const generation = this.readerGeneration
    let leased: { name: string; lease: object }
    try {
      leased = this.domains.admitReader(entry.domain, generation)
    } catch {
      // The assembly stopped admission: the provider stops its own admission (SPEC 13.2).
      this.lifecycle.closing = true
      return null
    }
    const reader: PoolReader = {
      client: undefined as unknown as ReaderClient,
      domain: entry.domain,
      entry,
      generation,
      leaseName: leased.name,
      lease: leased.lease,
      schema: d.schema,
      boundScope: null,
      state: 'starting',
      idleTimer: null,
    }
    reader.client = new ReaderClient(
      {
        file: this.domains.fileOf(entry.domain),
        domain: entry.domain,
        lockWaitMs: this.config.lockWaitMs,
        generation,
      },
      () => this.exited(d, reader),
    )
    d.readers.push(reader)
    this.readerCount += 1
    return reader
  }

  /** The exit of a Worker is observed. Only now the slot, the lease and the tag are gone. */
  private exited(d: DomainReaders, reader: PoolReader): void {
    this.stopIdle(reader)
    const at = d.readers.indexOf(reader)
    if (at >= 0) d.readers.splice(at, 1)
    this.readerCount -= 1
    this.domains.releaseLease(reader.lease)
    this.pumpAll()
  }

  private async run(d: DomainReaders, task: Task, reader: PoolReader): Promise<void> {
    const { job } = task
    if (reader.state === 'starting' && !(await this.openConnection(reader))) {
      void this.retire(reader)
      task.settle(unavailable(this.closing ? 'closing' : 'domain_unavailable'))
      task.finish()
      return
    }
    if (reader.state === 'closing' && !task.settled) {
      // A migration closed the connection while the request waited for it. It waits again.
      this.park(d, task, true)
      this.pump(job.domain)
      return
    }
    // domain-serial: the connection first, then the barrier (SPEC 9.3).
    const leave = job.handler.ordering === 'domain-serial' ? await this.barrier.acquire(job.domain) : null
    if (task.settled || reader.state === 'closing') {
      leave?.()
      if (task.settled) {
        // Withdrawn before anything was sent: the connection is clean and goes back.
        this.release(reader)
        task.finish()
      } else {
        this.park(d, task, true)
        this.pump(job.domain)
      }
      return
    }
    task.phase = 'dispatched'
    task.startTimer(this.config.readObservationMs, () => task.settle(unavailable('read_timeout')))
    const spec: HandlerSpec = {
      moduleUrl: job.handler.moduleUrl,
      codeDigest: job.handler.codeDigest,
      readTables: job.handler.readTables,
      requiresMigrations: job.handler.requiresMigrations,
      maxOutputBytes: job.handler.maxOutputBytes,
      maxRowsRead: job.handler.maxRowsRead,
    }
    this.tokenCounter += 1
    const token = `${String(reader.generation)}:${String(this.tokenCounter)}`
    let outcome: ReadOutcome
    let reusable = true
    try {
      const reply = await reader.client.call({ kind: 'read', handler: spec, input: job.input }, token)
      if (reply.kind === 'read_failed' && reply.fatal === true) reusable = false
      outcome = this.outcomeOf(reply)
    } catch (error) {
      reusable = false
      outcome = unavailable(error instanceof WorkerExited ? 'worker_exited' : 'read_failed')
    }
    // The transaction has ended, or the exit of the Worker is observed: the barrier goes.
    leave?.()
    if (reusable) this.release(reader)
    else void this.retire(reader)
    task.settle(outcome)
    task.finish()
    this.pump(job.domain)
  }

  private outcomeOf(reply: ReaderReply): ReadOutcome {
    switch (reply.kind) {
      case 'read':
        return { kind: 'read', output: reply.output }
      case 'schema_unavailable':
        return unavailable('schema_unavailable')
      case 'read_limit':
        return unavailable('read_limit')
      case 'read_failed':
        return unavailable('read_failed', reply.diagnostic)
      default:
        return unavailable('read_failed', 'provider_error')
    }
  }

  // --- connections --------------------------------------------------------------------------

  private async openConnection(reader: PoolReader): Promise<boolean> {
    this.tokenCounter += 1
    let reply: ReaderReply
    try {
      reply = await reader.client.call({ kind: 'open' }, `${String(reader.generation)}:${String(this.tokenCounter)}`)
    } catch {
      return false
    }
    if (reply.kind !== 'ready') return false
    // The binding row decides: another scope means the connection does not belong to this domain.
    let bound: StorageScope | null = null
    try {
      bound = decodeScope(JSON.parse(reply.scope))
    } catch {
      bound = null
    }
    if (bound === null || scopeKey(bound) !== scopeKey(reader.entry.scope)) return false
    reader.boundScope = scopeKey(bound)
    if (reader.state !== 'closing') reader.state = 'busy'
    return true
  }

  /** The reader is clean: statement ended, result handed over, transaction ended, no message open. */
  private release(reader: PoolReader): void {
    if (reader.state === 'closing') return
    if (this.closing || this.lifecycle.closing) return void this.retire(reader)
    reader.state = 'idle'
    reader.idleTimer = setTimeout(() => void this.retire(reader), this.config.readerIdleMs)
    reader.idleTimer.unref()
    this.pump(reader.domain)
  }

  private stopIdle(reader: PoolReader): void {
    if (reader.idleTimer !== null) clearTimeout(reader.idleTimer)
    reader.idleTimer = null
  }

  /** Closes the connection and the Worker. The slot comes back when the exit is observed. */
  private retire(reader: PoolReader): Promise<void> {
    this.stopIdle(reader)
    reader.state = 'closing'
    return reader.client.close()
  }
}
