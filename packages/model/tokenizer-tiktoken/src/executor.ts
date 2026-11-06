import type { TokenizerDefinition } from '@omne-harness/model-contract'
import type {
  TokenizationFailure,
  TokenizationSegment,
} from '@omne-harness/model-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { definitionKey, frozenDefinition } from './definition.ts'
import type { ExecutorInput, TiktokenExecutor, TiktokenLease } from './executor-types.ts'
import type { CacheStats } from './piece-cache.ts'
import {
  parseReply,
  validInput,
  type CountResult,
  type WorkerCommand,
  type WorkerReply,
} from './worker-protocol.ts'
import { spawnWorker, type SpawnWorker, type WorkerPort } from './worker-port.ts'

type Cleanup = Outcome<undefined, TokenizationFailure>
const unavailable = (diagnostic: string): Outcome<never, TokenizationFailure> =>
  fail({ kind: 'unavailable', diagnostic })
const emptyStats = (): CacheStats => ({
  cacheBytes: 0,
  cacheEntries: 0,
  pieceHits: 0,
  pieceMisses: 0,
})
type Job = {
  id: number
  lease: Lease
  input: readonly TokenizationSegment[]
  bytes: number
  queuedAt: number
  startedAt: number
  cancellation: Int32Array<SharedArrayBuffer>
  result: ReturnType<typeof Promise.withResolvers<CountResult>>
  answered: boolean
  timer: ReturnType<typeof setTimeout>
}
type Lease = {
  id: number
  resource: number
  slot: Slot
  phase: 'active' | 'releasing' | 'released'
  jobs: Job[]
  release: ReturnType<typeof Promise.withResolvers<Cleanup>>
  detach(): void
}
type SlotPhase =
  | { kind: 'starting'; timer: ReturnType<typeof setTimeout> }
  | { kind: 'idle' }
  | { kind: 'counting'; job: Job }
  | { kind: 'clearing'; lease: Lease; timer: ReturnType<typeof setTimeout> }
  | { kind: 'stopping'; previous: Exclude<SlotPhase, { kind: 'stopping' } | { kind: 'dead' }> }
  | { kind: 'dead' }
type Slot = {
  generation: number
  port: WorkerPort | undefined
  phase: SlotPhase
  ready: Lease[]
  stats: CacheStats
  replacements: number[]
  initialized: ReturnType<typeof Promise.withResolvers<Cleanup>>
  exited: ReturnType<typeof Promise.withResolvers<void>>
}

// A sliced string can otherwise retain its caller's entire backing text while queued.
function ownedText(text: string): string {
  return Buffer.from(text, 'utf16le').toString('utf16le')
}

class Executor implements TiktokenExecutor {
  private phase: 'open' | 'closing' | 'closed' = 'open'
  private readonly slots: Slot[] = []
  private readonly leases = new Map<number, Lease>()
  private readonly resources: ReadonlyMap<string, number>
  private sequence = 0
  private queuedJobs = 0
  private queuedBytes = 0
  private readonly totals = {
    pieceHits: 0,
    pieceMisses: 0,
    completedJobs: 0,
    failedJobs: 0,
    rejectedJobs: 0,
    replacements: 0,
    queueMs: 0,
    serviceMs: 0,
  }
  private closing: Promise<Cleanup> | undefined

  private readonly input: ExecutorInput
  private readonly spawn: SpawnWorker

  constructor(input: ExecutorInput, spawn: SpawnWorker) {
    this.input = input
    this.spawn = spawn
    this.resources = new Map(
      input.resources.map((resource, index) => [definitionKey(resource.definition), index]),
    )
  }

  async initialize(): Promise<Cleanup> {
    for (let index = 0; index < this.input.limits.workers; index++) {
      const slot: Slot = {
        generation: 0,
        port: undefined,
        phase: { kind: 'dead' },
        ready: [],
        stats: emptyStats(),
        replacements: [],
        initialized: Promise.withResolvers(),
        exited: Promise.withResolvers(),
      }
      this.slots.push(slot)
      this.start(slot)
    }
    const results = await Promise.all(this.slots.map(slot => slot.initialized.promise))
    const failed = results.find(result => 'failure' in result)
    if (failed !== undefined) {
      await this.close()
      return failed
    }
    return succeed(undefined)
  }

  acquire(
    definition: TokenizerDefinition,
    signal: AbortSignal,
  ): Outcome<TiktokenLease, TokenizationFailure> {
    if (this.phase !== 'open' || signal.aborted)
      return unavailable('tokenizer executor or acquisition signal is closed')
    if (this.leases.size >= this.input.limits.maxLeases)
      return unavailable('tokenizer live lease limit exceeded')
    const resource = this.resources.get(definitionKey(definition))
    if (resource === undefined)
      return unavailable('tokenizer definition is not an exact initialized resource')
    const slot = this.availableSlot()
    if (slot === undefined) return unavailable('tokenizer has no available workers')
    const lease: Lease = {
      id: ++this.sequence,
      resource,
      slot,
      phase: 'active',
      jobs: [],
      release: Promise.withResolvers(),
      detach: () => signal.removeEventListener('abort', abort),
    }
    const abort = () => {
      this.releaseLease(lease)
    }
    this.leases.set(lease.id, lease)
    signal.addEventListener('abort', abort, { once: true })
    return succeed(
      Object.freeze({
        tokenizer: Object.freeze({
          definition: frozenDefinition(definition),
          count: (segments: readonly TokenizationSegment[]) => this.count(lease, segments),
        }),
        release: () => this.releaseLease(lease),
      }),
    )
  }

  close(): Promise<Cleanup> {
    if (this.closing !== undefined) return this.closing
    this.phase = 'closing'
    const completion = Promise.withResolvers<Cleanup>()
    this.closing = completion.promise
    for (const lease of this.leases.values()) this.releaseLease(lease)
    for (const slot of this.slots) this.stop(slot, 'tokenizer executor closed')
    void Promise.all(this.slots.map(slot => slot.exited.promise)).then(() => {
      this.phase = 'closed'
      completion.resolve(succeed(undefined))
    })
    return this.closing
  }

  snapshot(): ReturnType<TiktokenExecutor['snapshot']> {
    return Object.freeze({
      workers: this.slots.filter(slot => slot.phase.kind !== 'dead').length,
      leases: this.leases.size,
      queuedJobs: this.queuedJobs,
      queuedBytes: this.queuedBytes,
      runningJobs: this.slots.filter(
        slot =>
          slot.phase.kind === 'counting' ||
          (slot.phase.kind === 'stopping' && slot.phase.previous.kind === 'counting'),
      ).length,
      cacheBytes: this.slots.reduce((sum, slot) => sum + slot.stats.cacheBytes, 0),
      cacheEntries: this.slots.reduce((sum, slot) => sum + slot.stats.cacheEntries, 0),
      ...this.totals,
    })
  }

  private availableSlot(): Slot | undefined {
    const eligible = this.slots.filter(
      slot => slot.phase.kind !== 'dead' && slot.phase.kind !== 'stopping',
    )
    const assigned = (slot: Slot) =>
      [...this.leases.values()].filter(lease => lease.slot === slot).length
    return eligible.reduce<Slot | undefined>(
      (best, slot) => (best === undefined || assigned(slot) < assigned(best) ? slot : best),
      undefined,
    )
  }

  private count(lease: Lease, input: readonly TokenizationSegment[]): Promise<CountResult> {
    const reject = (diagnostic: string) => {
      this.totals.rejectedJobs++
      return Promise.resolve(unavailable(diagnostic))
    }
    if (this.phase !== 'open' || lease.phase !== 'active')
      return reject('tokenizer lease is released')
    if (lease.slot.phase.kind === 'dead') return reject('tokenizer worker is unavailable')
    const bytes = this.retainedInputBytes(input)
    if (bytes > this.input.limits.maxInputBytes)
      return reject('tokenizer retained input limit exceeded')
    if (!this.hasCapacity(lease, bytes)) return reject('tokenizer queue limit exceeded')
    const job: Job = {
      id: ++this.sequence,
      lease,
      input: input.map(segment =>
        segment.kind === 'text'
          ? { kind: segment.kind, text: ownedText(segment.text) }
          : { kind: segment.kind, name: ownedText(segment.name) },
      ),
      bytes,
      queuedAt: /* wall-clock: operation-timing -- Measure local queue wait. */ performance.now(),
      startedAt: 0,
      cancellation: new Int32Array(new SharedArrayBuffer(4)),
      result: Promise.withResolvers(),
      answered: false,
      timer: setTimeout(() => this.expire(job), this.input.limits.jobTimeoutMs),
    }
    lease.jobs.push(job)
    this.queuedJobs++
    this.queuedBytes += bytes
    this.enqueue(lease)
    this.dispatch(lease.slot)
    return job.result.promise
  }

  private retainedInputBytes(input: readonly TokenizationSegment[]): number {
    let bytes = 32
    for (const segment of input) {
      bytes += 128 + 2 * (segment.kind === 'text' ? segment.text.length : segment.name.length)
      if (bytes > this.input.limits.maxInputBytes) break
    }
    return bytes
  }

  private hasCapacity(lease: Lease, bytes: number): boolean {
    if (lease.slot.phase.kind === 'idle' && lease.slot.ready.length === 0) return true
    return (
      lease.jobs.length < this.input.limits.maxLeaseQueuedJobs &&
      this.queuedJobs < this.input.limits.maxQueuedJobs &&
      bytes <= this.input.limits.maxQueuedBytes - this.queuedBytes
    )
  }

  private enqueue(lease: Lease): void {
    const slot = lease.slot
    if (slot.phase.kind === 'counting' && slot.phase.job.lease === lease) return
    if (!slot.ready.includes(lease)) slot.ready.push(lease)
  }

  private dispatch(slot: Slot): void {
    if (slot.phase.kind !== 'idle' || this.phase !== 'open') return
    const lease = slot.ready.shift()
    if (lease === undefined) return
    if (lease.phase === 'releasing') {
      slot.phase = {
        kind: 'clearing',
        lease,
        timer: setTimeout(
          () => this.stop(slot, 'tokenizer cache clear deadline exceeded'),
          this.input.limits.jobTimeoutMs,
        ),
      }
      this.send(slot, { kind: 'clear', generation: slot.generation, lease: lease.id })
      return
    }
    const job = lease.jobs.shift()
    if (job === undefined) {
      this.dispatch(slot)
      return
    }
    this.queuedJobs--
    this.queuedBytes -= job.bytes
    job.startedAt =
      /* wall-clock: operation-timing -- Measure worker service duration. */ performance.now()
    this.totals.queueMs += job.startedAt - job.queuedAt
    slot.phase = { kind: 'counting', job }
    this.send(slot, {
      kind: 'count',
      generation: slot.generation,
      job: job.id,
      lease: lease.id,
      resource: lease.resource,
      segments: job.input,
      cancellation: job.cancellation.buffer,
    })
    job.input = []
  }

  private answer(job: Job, result: CountResult): void {
    if (job.answered) return
    job.answered = true
    if ('ok' in result) this.totals.completedJobs++
    else this.totals.failedJobs++
    job.result.resolve(result)
  }

  private expire(job: Job): void {
    this.answer(job, unavailable('tokenizer count deadline exceeded'))
    const slot = job.lease.slot
    if (slot.phase.kind === 'counting' && slot.phase.job === job) this.cancelRunning(slot, job)
    else this.removeQueued(job)
  }

  private failQueued(lease: Lease, diagnostic: string): void {
    let job = lease.jobs[0]
    while (job !== undefined) {
      this.answer(job, unavailable(diagnostic))
      this.removeQueued(job)
      job = lease.jobs[0]
    }
  }

  private removeQueued(job: Job): void {
    const index = job.lease.jobs.indexOf(job)
    if (index === -1) return
    job.lease.jobs.splice(index, 1)
    this.queuedJobs--
    this.queuedBytes -= job.bytes
    job.input = []
    clearTimeout(job.timer)
  }

  private cancelRunning(slot: Slot, job: Job): void {
    Atomics.store(job.cancellation, 0, 1)
    clearTimeout(job.timer)
    // A regex or reference fallback can block between cooperative cancellation checks.
    job.timer = setTimeout(() => this.stop(slot, 'tokenizer cancellation did not settle'), 25)
  }

  private releaseLease(lease: Lease): Promise<Cleanup> {
    if (lease.phase !== 'active') return lease.release.promise
    lease.phase = 'releasing'
    lease.detach()
    this.failQueued(lease, 'tokenizer lease released')
    const slot = lease.slot
    if (slot.phase.kind === 'counting' && slot.phase.job.lease === lease) {
      this.answer(slot.phase.job, unavailable('tokenizer lease released'))
      this.cancelRunning(slot, slot.phase.job)
    }
    if (slot.phase.kind === 'dead') this.finishRelease(lease)
    else {
      this.enqueue(lease)
      this.dispatch(slot)
    }
    return lease.release.promise
  }

  private finishRelease(lease: Lease): void {
    lease.phase = 'released'
    this.leases.delete(lease.id)
    lease.slot.ready = lease.slot.ready.filter(item => item !== lease)
    lease.release.resolve(succeed(undefined))
  }

  private start(slot: Slot): void {
    slot.generation++
    slot.exited = Promise.withResolvers()
    const generation = slot.generation
    slot.phase = {
      kind: 'starting',
      timer: setTimeout(
        () => this.stop(slot, 'tokenizer worker initialization deadline exceeded'),
        this.input.limits.jobTimeoutMs,
      ),
    }
    try {
      slot.port = this.spawn(
        {
          message: value => {
            if (generation === slot.generation) this.receive(slot, value)
          },
          error: error => {
            if (generation === slot.generation) this.stop(slot, error.message)
          },
          exit: () => {
            if (generation === slot.generation) this.exited(slot)
          },
        },
        this.input.limits,
      )
      this.send(slot, {
        kind: 'initialize',
        generation,
        input: {
          resources: this.input.resources,
          limits: {
            ...this.input.limits,
            maxCacheBytes: Math.floor(this.input.limits.maxCacheBytes / this.input.limits.workers),
            maxCacheEntries: Math.floor(
              this.input.limits.maxCacheEntries / this.input.limits.workers,
            ),
          },
        },
      })
    } catch (error) {
      this.stop(slot, error instanceof Error ? error.message : 'tokenizer worker creation failed')
      if (slot.port === undefined) this.exited(slot)
    }
  }

  private send(slot: Slot, command: WorkerCommand): void {
    try {
      slot.port?.send(command)
    } catch (error) {
      this.stop(slot, error instanceof Error ? error.message : 'tokenizer worker message failed')
    }
  }

  private receive(slot: Slot, value: unknown): void {
    if (slot.phase.kind === 'stopping' || slot.phase.kind === 'dead') return
    try {
      const reply = parseReply(value)
      if (reply.generation !== slot.generation) return
      this.receiveCurrent(slot, reply)
    } catch (error) {
      this.stop(slot, error instanceof Error ? error.message : 'tokenizer worker protocol failed')
    }
  }

  private receiveCurrent(slot: Slot, reply: WorkerReply): void {
    switch (reply.kind) {
      case 'initialization-failed':
        this.stop(slot, reply.diagnostic)
        return
      case 'ready':
        if (slot.phase.kind !== 'starting') throw new Error('tokenizer worker was not initializing')
        clearTimeout(slot.phase.timer)
        slot.phase = { kind: 'idle' }
        slot.initialized.resolve(succeed(undefined))
        this.dispatch(slot)
        return
      case 'counted':
        this.receivedCount(slot, reply)
        return
      case 'cleared':
        this.receivedClear(slot, reply)
        return
    }
  }

  private receivedCount(slot: Slot, reply: Extract<WorkerReply, { kind: 'counted' }>): void {
    if (
      slot.phase.kind !== 'counting' ||
      reply.job !== slot.phase.job.id ||
      reply.lease !== slot.phase.job.lease.id
    )
      throw new Error('tokenizer worker reply does not match the active task')
    const job = slot.phase.job
    clearTimeout(job.timer)
    this.totals.serviceMs +=
      /* wall-clock: operation-timing -- Record physical count completion. */ performance.now() -
      job.startedAt
    this.updateStats(slot, reply.stats)
    this.answer(
      job,
      job.lease.phase === 'active' ? reply.result : unavailable('tokenizer lease released'),
    )
    slot.phase = { kind: 'idle' }
    if (job.lease.phase === 'releasing' || job.lease.jobs.length > 0) this.enqueue(job.lease)
    this.dispatch(slot)
  }

  private receivedClear(slot: Slot, reply: Extract<WorkerReply, { kind: 'cleared' }>): void {
    if (slot.phase.kind !== 'clearing' || reply.lease !== slot.phase.lease.id)
      throw new Error('tokenizer cache reply does not match the releasing lease')
    clearTimeout(slot.phase.timer)
    this.updateStats(slot, reply.stats)
    this.finishRelease(slot.phase.lease)
    slot.phase = { kind: 'idle' }
    this.dispatch(slot)
  }

  private updateStats(slot: Slot, stats: CacheStats): void {
    this.totals.pieceHits += stats.pieceHits - slot.stats.pieceHits
    this.totals.pieceMisses += stats.pieceMisses - slot.stats.pieceMisses
    slot.stats = stats
  }

  private stop(slot: Slot, diagnostic: string): void {
    if (slot.phase.kind === 'stopping' || slot.phase.kind === 'dead') return
    const previous = slot.phase
    if (previous.kind === 'counting') {
      this.answer(previous.job, unavailable(diagnostic))
      clearTimeout(previous.job.timer)
    }
    if (previous.kind === 'clearing' || previous.kind === 'starting') clearTimeout(previous.timer)
    if (previous.kind === 'starting') slot.initialized.resolve(unavailable(diagnostic))
    slot.phase = { kind: 'stopping', previous }
    slot.port?.terminate()
  }

  private settleExitedWork(slot: Slot, previous: SlotPhase): void {
    if (previous.kind === 'counting') {
      clearTimeout(previous.job.timer)
      this.totals.serviceMs +=
        /* wall-clock: operation-timing -- Record physical count exit. */ performance.now() -
        previous.job.startedAt
      this.answer(previous.job, unavailable('tokenizer worker exited'))
      if (previous.job.lease.jobs.length > 0) this.enqueue(previous.job.lease)
    }
    if (previous.kind === 'starting' || previous.kind === 'clearing') clearTimeout(previous.timer)
    slot.initialized.resolve(unavailable('tokenizer worker exited before initialization'))
    for (const lease of this.leases.values())
      if (lease.slot === slot && lease.phase === 'releasing') this.finishRelease(lease)
  }

  private replace(slot: Slot, previous: SlotPhase): boolean {
    if (this.phase !== 'open') return false
    if (previous.kind === 'starting' && slot.generation === 1) return false
    const now =
      /* wall-clock: operation-timing -- Bound worker replacements in a rolling minute. */ performance.now()
    slot.replacements = slot.replacements.filter(time => time > now - 60000)
    if (slot.replacements.length >= this.input.limits.maxReplacementsPerMinute) return false
    slot.replacements.push(now)
    this.totals.replacements++
    this.start(slot)
    return true
  }

  private exited(slot: Slot): void {
    if (slot.phase.kind === 'dead') return
    const previous = slot.phase.kind === 'stopping' ? slot.phase.previous : slot.phase
    slot.phase = { kind: 'dead' }
    slot.port = undefined
    slot.stats = emptyStats()
    slot.exited.resolve()
    this.settleExitedWork(slot, previous)
    if (this.replace(slot, previous)) return
    for (const lease of this.leases.values()) {
      if (lease.slot !== slot) continue
      this.failQueued(lease, 'tokenizer worker unavailable and replacement budget exhausted')
    }
    slot.ready = []
  }
}

export async function createExecutor(
  input: ExecutorInput,
  spawn: SpawnWorker,
): Promise<Outcome<TiktokenExecutor, TokenizationFailure>> {
  if (!validInput(input))
    return unavailable('tokenizer limits and resources must have valid explicit values')
  const snapshot = {
    resources: input.resources.map(resource => ({
      definition: frozenDefinition(resource.definition),
      ranks: { ...resource.ranks, specialTokens: { ...resource.ranks.specialTokens } },
      specialTokens: { ...resource.specialTokens },
    })),
    limits: Object.freeze({ ...input.limits }),
  }
  const keys = snapshot.resources.map(resource => definitionKey(resource.definition))
  if (new Set(keys).size !== keys.length)
    return unavailable('tokenizer resources contain duplicate definitions')
  const executor = new Executor(snapshot, spawn)
  const initialized = await executor.initialize()
  if ('failure' in initialized) return initialized
  return succeed(
    Object.freeze({
      acquire: (definition: TokenizerDefinition, signal: AbortSignal) =>
        executor.acquire(definition, signal),
      close: () => executor.close(),
      snapshot: () => executor.snapshot(),
    }),
  )
}

export function createTiktokenExecutor(
  input: ExecutorInput,
): Promise<Outcome<TiktokenExecutor, TokenizationFailure>> {
  return createExecutor(input, spawnWorker)
}
