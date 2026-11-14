import type {
  JsonValue,
  ReadHandlerDescriptor,
  ReadUnavailableReason,
  StorageScope,
} from '@omne-harness/sql-contract'
import type { SqliteStorageConfig } from './config.ts'
import type { Domains, Lifecycle, VerifiedDomain } from './domains.ts'
import { decodeScope, scopeKey } from './fields.ts'
import { ReaderClient } from './reader-client.ts'
import type { WriteBarrier } from './write-barrier.ts'
import type { HandlerSpec, ReaderReply } from './worker/reader-protocol.ts'
import { WaitingQueue, type Acquired, type Fit } from './waiting.ts'
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

const READ_REFUSAL = {
  full: unavailable('queue_full'),
  expired: unavailable('queue_timeout'),
  aborted: { kind: 'cancelled' },
  closing: unavailable('closing'),
} as const satisfies Record<Exclude<Acquired['kind'], 'granted'>, ReadOutcome>

type Phase = 'queued' | 'assigned' | 'dispatched'

class Task {
  readonly job: ReadJob
  phase: Phase = 'queued'
  settled = false
  leaveQueue: (() => void) | null = null
  readonly withdraw = new AbortController()
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

  settle(outcome: ReadOutcome): void {
    if (this.settled) return
    this.settled = true
    this.stopTimer()
    this.signal?.removeEventListener('abort', this.onAbort)
    this.withdraw.abort()
    this.onSettled(outcome)
  }

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
  readonly entry: VerifiedDomain
  readonly generation: number
  readonly leaseName: string
  readonly lease: object
  readonly schema: number
  boundScope: string | null
  state: 'starting' | 'idle' | 'busy' | 'closing'
  idleTimer: NodeJS.Timeout | null
}

type ReaderAcquisition = PoolReader | 'start-failed' | null

type DomainReaders = {
  readonly queue: Task[]
  readonly readers: PoolReader[]
  schema: number
  pauses: number
  walPaused: boolean
}

export class ReaderPool {
  private readonly config: SqliteStorageConfig
  private readonly domains: Domains
  private readonly lifecycle: Lifecycle
  private readonly barrier: WriteBarrier
  private readonly byDomain = new Map<string, DomainReaders>()
  private readonly waiting: WaitingQueue<Readonly<{ domain: string; bytes: number }>>
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
    this.waiting = new WaitingQueue(
      {
        fit: need => this.fit(need.domain, need.bytes),
        take: need => this.reserve(need.domain, need.bytes),
      },
      { perDomain: config.readQueuePerDomain, global: config.readQueueGlobal },
    )
    this.domains = domains
    this.lifecycle = lifecycle
  }

  read(job: ReadJob): Promise<ReadOutcome> {
    if (this.closing || this.lifecycle.closing) return Promise.resolve(unavailable('closing'))
    const started =
      /* wall-clock: operation-timing -- The read deadline is a monotonic duration from the call (SPEC 9.2 step 9). */ performance.now()
    const { readQueueTimeoutMs } = this.config
    const acquired = this.waiting.acquire(
      { domain: job.domain, bytes: job.handler.maxOutputBytes },
      readQueueTimeoutMs,
      job.signal,
    )
    const answer = (acquired: Acquired): ReadOutcome | Promise<ReadOutcome> => {
      if (acquired.kind !== 'granted') return READ_REFUSAL[acquired.kind]
      return new Promise<ReadOutcome>(resolve => {
        const task: Task = new Task(job, resolve, acquired.release, () => this.aborted(task))
        const elapsed =
          /* wall-clock: operation-timing -- What is left of the read deadline after the wait for a reservation (SPEC 9.2 step 9). */ performance.now() -
          started
        const left = Math.max(0, readQueueTimeoutMs - elapsed)
        task.startTimer(left, () => this.queueExpired(task))
        void this.enqueue(task)
      })
    }
    if (acquired instanceof Promise) return acquired.then(answer)
    return Promise.resolve(answer(acquired))
  }

  async closeAll(): Promise<void> {
    this.closing = true
    this.waiting.close()
    const closing: Promise<void>[] = []
    for (const d of this.byDomain.values()) {
      this.drain(d, unavailable('closing'))
      for (const reader of d.readers) closing.push(this.retire(reader))
    }
    await Promise.all(closing)
  }

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

  pauseDispatch(domain: string): void {
    const d = this.domainState(domain)
    if (d.walPaused) return
    d.walPaused = true
    d.pauses += 1
  }

  resumeDispatch(domain: string): void {
    const d = this.domainState(domain)
    if (!d.walPaused) return
    d.walPaused = false
    d.pauses -= 1
    this.pump(domain)
  }

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

  private fit(domain: string, bytes: number): Fit {
    const { readQueuePerDomain, readQueueGlobal, globalReadResultBytes } = this.config
    if ((this.perDomainReserved.get(domain) ?? 0) >= readQueuePerDomain) return 'domain'
    return this.reserved < readQueueGlobal && this.reservedBytes + bytes <= globalReadResultBytes
      ? 'fits'
      : 'global'
  }

  private reserve(domain: string, bytes: number): () => void {
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

  private domainState(domain: string): DomainReaders {
    let d = this.byDomain.get(domain)
    if (d === undefined) {
      d = { queue: [], readers: [], schema: 0, pauses: 0, walPaused: false }
      this.byDomain.set(domain, d)
    }
    return d
  }

  private async enqueue(task: Task): Promise<void> {
    const { job } = task
    if (this.domains.readable(job.domain) === null) {
      let outcome: Awaited<ReturnType<Domains['ensure']>>
      try {
        outcome = await this.domains.ensure(job.domain, null)
      } catch {
        this.endQueued(task, unavailable('read_failed', 'provider_error'))
        return
      }
      if (task.settled) return task.finish()
      if (outcome.kind === 'closing') return this.endQueued(task, unavailable('closing'))
      if (outcome.kind !== 'ready') return this.endQueued(task, unavailable('domain_unavailable'))
    }
    const verified = this.domains.readable(job.domain)
    if (verified === null || scopeKey(verified.scope) !== scopeKey(job.scope))
      return this.endQueued(
        task,
        unavailable(this.closing || this.lifecycle.closing ? 'closing' : 'domain_unavailable'),
      )
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
    if (task.phase === 'queued') this.endQueued(task, { kind: 'cancelled' })
    else task.settle({ kind: 'cancelled' })
  }

  private drain(d: DomainReaders, outcome: ReadOutcome): void {
    for (const task of d.queue.splice(0)) {
      task.settle(outcome)
      task.finish()
    }
  }

  private pump(domain: string): void {
    const d = this.domainState(domain)
    for (;;) {
      const task = d.queue[0]
      if (task === undefined || d.pauses > 0) return
      if (this.closing || this.lifecycle.closing) return this.drain(d, unavailable('closing'))
      const entry = this.domains.readable(domain)
      if (entry === null || scopeKey(entry.scope) !== scopeKey(task.job.scope)) {
        d.queue.shift()
        task.settle(unavailable('domain_unavailable'))
        task.finish()
        continue
      }
      const reader = this.acquire(d, entry)
      if (reader === null) return
      if (reader === 'start-failed') {
        this.endQueued(task, unavailable('read_failed', 'worker_start_failed'))
        continue
      }
      d.queue.shift()
      task.leaveQueue = null
      task.phase = 'assigned'
      void this.run(d, task, reader)
    }
  }

  private pumpAll(): void {
    for (const [domain, d] of this.byDomain) if (d.queue.length > 0) this.pump(domain)
  }

  private acquire(d: DomainReaders, entry: VerifiedDomain): ReaderAcquisition {
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
      this.freeSlot(entry.domain)
      return null
    }
    return this.spawn(d, entry)
  }

  private hasSlot(): boolean {
    const { maxWorkers, reservedWriterSlots } = this.config
    return (
      this.readerCount < maxWorkers - reservedWriterSlots &&
      this.domains.writerSlots() + this.readerCount < maxWorkers
    )
  }

  private freeSlot(domain: string): void {
    if (this.retireIdle() === null) void this.domains.yieldIdle(domain)
  }

  count(): number {
    return this.readerCount
  }

  retireIdle(): Promise<void> | null {
    for (const d of this.byDomain.values())
      for (const reader of d.readers) if (reader.state === 'idle') return this.retire(reader)
    return null
  }

  slotFreed(): void {
    this.pumpAll()
  }

  private spawn(d: DomainReaders, entry: VerifiedDomain): ReaderAcquisition {
    this.readerGeneration += 1
    const generation = this.readerGeneration
    let leased: { name: string; lease: object }
    try {
      leased = this.domains.admitReader(entry.domain, generation)
    } catch {
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
    try {
      reader.client = new ReaderClient(
        {
          file: this.domains.fileOf(entry.domain),
          domain: entry.domain,
          lockWaitMs: this.config.lockWaitMs,
          generation,
        },
        () => this.exited(d, reader),
      )
    } catch {
      this.domains.releaseLease(leased.lease)
      return 'start-failed'
    }
    d.readers.push(reader)
    this.readerCount += 1
    return reader
  }

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
      this.park(d, task, true)
      this.pump(job.domain)
      return
    }
    const release = await this.holdBarrier(task)
    if (task.settled || reader.state === 'closing') {
      release?.()
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
    const releaseBarrier = this.boundedHold(release)
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
      const reply = await reader.client.call(
        { kind: 'read', handler: spec, input: job.input },
        token,
      )
      if (reply.kind === 'read_failed' && reply.fatal === true) reusable = false
      outcome = this.outcomeOf(reply)
    } catch (error) {
      reusable = false
      outcome = unavailable(error instanceof WorkerExited ? 'worker_exited' : 'read_failed')
    }
    releaseBarrier()
    if (reusable) this.release(reader)
    else void this.retire(reader)
    task.settle(outcome)
    task.finish()
    this.pump(job.domain)
  }

  private async holdBarrier(task: Task): Promise<(() => void) | null> {
    if (task.job.handler.ordering !== 'domain-serial') return null
    const hold = await this.barrier.acquire(task.job.domain, { signal: task.withdraw.signal })
    return hold.kind === 'granted' ? hold.release : null
  }

  private boundedHold(release: (() => void) | null): () => void {
    if (release === null) return () => undefined
    const deadline = setTimeout(release, this.config.readObservationMs)
    return () => {
      clearTimeout(deadline)
      release()
    }
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

  private async openConnection(reader: PoolReader): Promise<boolean> {
    this.tokenCounter += 1
    let reply: ReaderReply
    try {
      reply = await reader.client.call(
        { kind: 'open' },
        `${String(reader.generation)}:${String(this.tokenCounter)}`,
      )
    } catch {
      return false
    }
    if (reply.kind !== 'ready') return false
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

  private release(reader: PoolReader): void {
    if (reader.state === 'closing') return
    if (this.closing || this.lifecycle.closing) return void this.retire(reader)
    reader.state = 'idle'
    reader.idleTimer = setTimeout(() => void this.retire(reader), this.config.readerIdleMs)
    reader.idleTimer.unref()
    this.pump(reader.domain)
    this.pumpAll()
  }

  private stopIdle(reader: PoolReader): void {
    if (reader.idleTimer !== null) clearTimeout(reader.idleTimer)
    reader.idleTimer = null
  }

  private retire(reader: PoolReader): Promise<void> {
    this.stopIdle(reader)
    reader.state = 'closing'
    return reader.client.close()
  }
}
