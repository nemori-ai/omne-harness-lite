// The domain state table of one provider generation (SPEC 5.2) and the control side of DO-1
// (SPEC 5.3). A domain has no entry while it is absent or unopened. The first operation that
// touches it starts the open, and operations that arrive meanwhile wait for the same outcome.
//
// States that this closure keeps: opening, ready, quarantined. `absent` and `unopened` are the
// lack of an entry. `recovering` is not kept: the exit of a Worker is observed at once, so the
// entry is dropped and the next touch runs path A again (write generation plus one). `draining`
// and `closed` are the provider lifecycle, see `Lifecycle`.
import { mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CloseLeasePort, SqlMaterialCatalog, StorageScope } from '@omne-harness/sql-contract'
import { canonicalFile, claimWriter, releaseWriter } from './claims.ts'
import type { ReportLatch } from './close.ts'
import type { SqliteStorageConfig } from './config.ts'
import type { OpenReply, RegistrationSpec, WalState } from './worker/protocol.ts'
import { WriterClient } from './writer-client.ts'

export type Lifecycle = { closing: boolean }

/** What the domain table needs from the close protocol (SPEC 13.4) and the read pool (SPEC 12.3). */
export type CloseHooks = Readonly<{
  latch: ReportLatch
  /** read-paused: no new read starts on the domain. `resume` ends it. */
  readGate: Readonly<{ pause(domain: string): void; resume(domain: string): void }>
  /** The read pool's share of the Worker slots (SPEC 12.2). */
  readers: Readonly<{
    /** Read Workers whose exit was not observed. */
    count(): number
    /** Closes one idle read Worker. Null when none is idle; else settles at its observed exit. */
    retireIdle(): Promise<void> | null
    /** A write Worker's slot went back: reads that wait for a slot may go on. */
    slotFreed(): void
  }>
}>

type LiveWorker = {
  readonly domain: string
  readonly leaseName: string
  readonly client: WriterClient
  /** Known when the registration names it, or after the open reply. */
  scope: StorageScope | null
}

export type ReadyDomain = {
  readonly state: 'ready'
  readonly domain: string
  readonly client: WriterClient
  readonly scope: StorageScope
  /** Participants that the schema check handles as singletons in this generation (SPEC 4.5). */
  readonly singletons: readonly string[]
  readonly leaseName: string
  /** The WAL state that the Worker reports (SPEC 12.3). `write-stopped` refuses new writes. */
  readonly wal: { state: WalState }
}

/**
 * What a read needs of a domain (SPEC 5.2): that this provider generation opened it once, and for
 * which scope. It is a record, not a Worker: it stays when the write Worker yields or ends, and it
 * goes when the domain is quarantined. Reads compare it by identity.
 */
export type VerifiedDomain = Readonly<{ domain: string; scope: StorageScope }>

type OpeningDomain = {
  readonly state: 'opening'
  readonly opening: Promise<OpenOutcome>
}

type QuarantinedDomain = { readonly state: 'quarantined'; readonly diagnostic: string }

type Entry = ReadyDomain | OpeningDomain | QuarantinedDomain

export type OpenOutcome =
  /**
   * `created` is the registration that this open wrote with the binding (path B), else null. A
   * caller with a registration that gets null still runs the Worker-side steps (SPEC 6.2 step 9).
   */
  | Readonly<{ kind: 'ready'; entry: ReadyDomain; created: RegistrationSpec | null }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'quarantined'; diagnostic: string }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'closing' }>

const hex = (text: string): string => Buffer.from(text, 'utf8').toString('hex')

let providerCounter = 0

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

export class Domains {
  private readonly entries = new Map<string, Entry>()
  private readonly config: SqliteStorageConfig
  private readonly catalog: SqlMaterialCatalog
  private readonly leases: CloseLeasePort
  private readonly lifecycle: Lifecycle
  private readonly hooks: CloseHooks
  private readonly providerGeneration: number
  /** Write Workers whose exit was not observed yet, by lease name. */
  private readonly workers = new Map<string, LiveWorker>()
  private workerGeneration = 0
  /** Opens that took a Worker slot and have not started their Worker yet (SPEC 12.2). */
  private reserved = 0
  /** How many operations hold each domain (SPEC 5.2). A held domain does not yield its Worker. */
  private readonly holds = new Map<string, number>()
  /** The order in which the domains were last held: the least recent idle one yields first. */
  private readonly lastHeld = new Map<string, number>()
  private holdClock = 0
  /** Domains that yielded their write Worker, until its exit is observed. */
  private readonly departing = new Map<string, Promise<void>>()
  /** Domains that this generation opened: what reads need, whether a write Worker lives or not. */
  private readonly verified = new Map<string, VerifiedDomain>()

  constructor(
    config: SqliteStorageConfig,
    catalog: SqlMaterialCatalog,
    leases: CloseLeasePort,
    lifecycle: Lifecycle,
    hooks: CloseHooks,
  ) {
    this.hooks = hooks
    this.config = config
    this.catalog = catalog
    this.leases = leases
    this.lifecycle = lifecycle
    providerCounter += 1
    this.providerGeneration = providerCounter
  }

  /** The domain file as a real path, the same form that the writer claim keys (SPEC 13.5). */
  fileOf(domain: string): string {
    return canonicalFile(join(this.config.storageRoot, 'domains', `${hex(domain)}.sqlite`))
  }

  /** Admits the lease of a read Worker (SPEC 13.2). Throws when the assembly stopped admission. */
  admitReader(domain: string, generation: number): { name: string; lease: object } {
    const name = `storage/${String(this.providerGeneration)}/reader/${hex(domain)}.sqlite/${String(generation)}`
    return { name, lease: this.leases.admit(name) }
  }

  /** Returns a lease after the exit of its Worker was observed. */
  releaseLease(lease: object): void {
    this.hooks.latch.release(() => this.leases.release(lease))
  }

  /**
   * Holds a domain for one operation (SPEC 5.2): from before the operation touches the domain until
   * its request has ended. The returned function gives the hold back; a second call does nothing.
   */
  hold(domain: string): () => void {
    this.holds.set(domain, (this.holds.get(domain) ?? 0) + 1)
    this.holdClock += 1
    this.lastHeld.set(domain, this.holdClock)
    let held = true
    return () => {
      if (!held) return
      held = false
      const left = (this.holds.get(domain) ?? 1) - 1
      if (left > 0) this.holds.set(domain, left)
      else this.holds.delete(domain)
    }
  }

  /** Write Workers whose exit was not observed, and opens that hold a slot for theirs (SPEC 12.2). */
  writerSlots(): number {
    return this.workers.size + this.reserved
  }

  /**
   * Makes room for one Worker by a yield (SPEC 5.2). A domain that is yielding already is the room:
   * no other is asked. Else the idle ready domain that was held least recently yields, never
   * `except` (the domain that asks). Null when no domain can yield; else settles when the exit of
   * the yielded Worker was observed and its slot went back.
   */
  yieldIdle(except: string | null): Promise<void> | null {
    const leaving = this.departing.values().next()
    if (leaving.done !== true) return leaving.value
    let victim: ReadyDomain | null = null
    let oldest = Number.POSITIVE_INFINITY
    for (const entry of this.entries.values()) {
      if (entry.state !== 'ready' || entry.domain === except) continue
      if (this.holds.has(entry.domain) || entry.wal.state !== 'normal') continue
      const at = this.lastHeld.get(entry.domain) ?? 0
      if (at < oldest) {
        victim = entry
        oldest = at
      }
    }
    if (victim === null) return null
    const { domain, client } = victim
    // The entry goes first: nothing new is sent to a Worker that closes. The next touch waits for
    // the exit and opens the domain again (path A).
    this.entries.delete(domain)
    this.lastHeld.delete(domain)
    const gone = client.close().then(() => {
      if (this.departing.get(domain) === gone) this.departing.delete(domain)
    })
    this.departing.set(domain, gone)
    return gone
  }

  /**
   * Takes the slot of a write Worker before it starts (SPEC 12.2), making room first: an idle read
   * Worker closes, else an idle domain yields. False when no slot can be had: a transient fault.
   */
  private async takeSlot(domain: string): Promise<boolean> {
    for (;;) {
      if (this.lifecycle.closing) return false
      if (this.writerSlots() + this.hooks.readers.count() < this.config.maxWorkers) {
        this.reserved += 1
        return true
      }
      const room =
        this.departing.values().next().value ??
        this.hooks.readers.retireIdle() ??
        this.yieldIdle(domain)
      if (room === null) return false
      await room
    }
  }

  /**
   * The record of a domain that this generation opened, without waiting and without a write
   * Worker (SPEC 5.2). Null before the first open, after a quarantine, and while the provider closes.
   */
  readable(domain: string): VerifiedDomain | null {
    return this.lifecycle.closing ? null : (this.verified.get(domain) ?? null)
  }

  /** The ready domain right now, without waiting. Operations send at once when it exists. */
  peekReady(domain: string): ReadyDomain | null {
    const entry = this.entries.get(domain)
    return entry?.state === 'ready' && !this.lifecycle.closing ? entry : null
  }

  /**
   * Makes the domain ready, opening it if needed. With `create`, an absent domain is created with
   * that registration (path B). `commit`, `query` and `read` pass null and never create a file.
   */
  async ensure(domain: string, create: RegistrationSpec | null): Promise<OpenOutcome> {
    for (;;) {
      if (this.lifecycle.closing) return { kind: 'closing' }
      let entry = this.entries.get(domain)
      if (entry === undefined) entry = this.startOpening(domain, create)
      if (entry.state === 'ready') return { kind: 'ready', entry, created: null }
      if (entry.state === 'quarantined')
        return { kind: 'quarantined', diagnostic: entry.diagnostic }
      const outcome = await entry.opening
      if (outcome.kind === 'absent' && create !== null) continue
      return outcome
    }
  }

  /** Marks a ready domain quarantined, for example when a Worker finds a material mismatch. */
  quarantine(entry: ReadyDomain, diagnostic: string): void {
    if (this.entries.get(entry.domain) === entry)
      this.entries.set(entry.domain, { state: 'quarantined', diagnostic })
    this.verified.delete(entry.domain)
    void entry.client.close()
  }

  private startOpening(domain: string, create: RegistrationSpec | null): OpeningDomain {
    const opening = this.open(domain, create)
    const entry: OpeningDomain = { state: 'opening', opening }
    this.entries.set(domain, entry)
    return entry
  }

  private async open(domain: string, create: RegistrationSpec | null): Promise<OpenOutcome> {
    // A domain that yielded its Worker opens again only after the exit of that Worker (SPEC 5.2).
    await this.departing.get(domain)
    const file = this.fileOf(domain)
    const existed = await exists(file)
    const forget = (): void => void this.entries.delete(domain)
    if (!existed && create === null) {
      forget()
      return { kind: 'absent' }
    }
    if (this.lifecycle.closing) {
      forget()
      return { kind: 'closing' }
    }
    if (!(await this.takeSlot(domain))) {
      forget()
      return this.lifecycle.closing
        ? { kind: 'closing' }
        : { kind: 'failed', diagnostic: 'no_worker_slot' }
    }
    // The slot is this open's until its Worker is in `workers`, or until the open gives up.
    let slotReserved = true
    const settleSlot = (): void => {
      if (!slotReserved) return
      slotReserved = false
      this.reserved -= 1
    }
    const claim = claimWriter(file, this.providerGeneration)
    if (claim === null) {
      // Another generation still has a write Worker on this file (SPEC 13.5): a transient fault.
      settleSlot()
      forget()
      return { kind: 'failed', diagnostic: 'writer_claim_held' }
    }
    this.workerGeneration += 1
    const leaseName = `storage/${String(this.providerGeneration)}/writer/${hex(domain)}.sqlite/${String(this.workerGeneration)}`
    let lease: object
    try {
      lease = this.leases.admit(leaseName)
    } catch {
      this.lifecycle.closing = true
      settleSlot()
      releaseWriter(claim)
      forget()
      return { kind: 'closing' }
    }
    let client: WriterClient | null = null
    const wal = { state: 'normal' as WalState }
    let reply: OpenReply
    try {
      if (create !== null) await mkdir(dirname(file), { recursive: true })
      const started = new WriterClient(
        {
          file,
          domain,
          catalog: this.catalog,
          lockWaitMs: this.config.lockWaitMs,
          walAutocheckpointPages: this.config.walAutocheckpointPages,
          journalSizeLimitBytes: this.config.journalSizeLimitBytes,
          maxResponseBytes: this.config.maxResponseBytes,
          maxOperationResponseBytes: this.config.maxOperationResponseBytes,
          maxDiagnosticBytes: this.config.maxDiagnosticBytes,
          checkpointIntervalMs: this.config.checkpointIntervalMs,
          checkpointWalBytes: this.config.checkpointWalBytes,
          walReadPauseBytes: this.config.walReadPauseBytes,
          walWriteStopBytes: this.config.walWriteStopBytes,
          groupMaxOperations: this.config.groupMaxOperations,
          groupCollectMs: this.config.groupCollectMs,
          groupMaxInputBytes: this.config.groupMaxInputBytes,
          groupMaxResponseReservationBytes: this.config.groupMaxResponseReservationBytes,
          groupMaxExecutionSliceMs: this.config.groupMaxExecutionSliceMs,
          generation: this.workerGeneration,
        },
        () => {
          // Unexpected exit: the next touch opens the domain again (SPEC 5.2, recovering).
          const current = this.entries.get(domain)
          if (current?.state === 'ready' && current.client === started) this.entries.delete(domain)
        },
        state => {
          const was = wal.state
          wal.state = state
          if (was === 'normal') this.hooks.readGate.pause(domain)
          else if (state === 'normal') this.hooks.readGate.resume(domain)
        },
      )
      client = started
      claim.client = started
      const live: LiveWorker = { domain, leaseName, client: started, scope: create?.scope ?? null }
      this.workers.set(leaseName, live)
      settleSlot()
      void started.exited.then(() => {
        this.workers.delete(leaseName)
        releaseWriter(claim)
        this.hooks.latch.release(() => this.leases.release(lease))
        this.hooks.readers.slotFreed()
      })
      reply = await started.request<OpenReply>({ kind: 'open', create })
    } catch {
      settleSlot()
      forget()
      if (client !== null) await client.close()
      else {
        releaseWriter(claim)
        this.leases.release(lease)
      }
      if (!existed) await this.removeFiles(file)
      return { kind: 'failed', diagnostic: 'worker_unavailable' }
    }
    if (reply.kind === 'ready' && client !== null) {
      const entry: ReadyDomain = {
        state: 'ready',
        domain,
        client,
        scope: reply.scope,
        singletons: reply.singletons,
        leaseName,
        wal,
      }
      const live = this.workers.get(leaseName)
      if (live !== undefined) live.scope = reply.scope
      this.entries.set(domain, entry)
      // The record keeps its identity over a yield and a reopen: readers stay bound to it. The
      // binding of a file does not change (SPEC 5.1), so the scope is the one already recorded.
      if (!this.verified.has(domain)) this.verified.set(domain, { domain, scope: reply.scope })
      // A file that held a binding was opened through path A: the registration was not written.
      return { kind: 'ready', entry, created: reply.created ? create : null }
    }
    await client?.close()
    if (reply.kind === 'quarantined') {
      this.verified.delete(domain)
      this.entries.set(domain, { state: 'quarantined', diagnostic: reply.diagnostic })
      return { kind: 'quarantined', diagnostic: reply.diagnostic }
    }
    forget()
    // A domain that this open created and that holds no binding is absent again.
    if (!existed) await this.removeFiles(file)
    if (reply.kind === 'absent') return { kind: 'absent' }
    if (reply.kind === 'unknown') return { kind: 'unknown', diagnostic: reply.diagnostic }
    if (reply.kind === 'ready') return { kind: 'failed', diagnostic: 'worker_unavailable' }
    return { kind: 'failed', diagnostic: reply.diagnostic }
  }

  private async removeFiles(file: string): Promise<void> {
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      await rm(`${file}${suffix}`, { force: true }).catch(() => undefined)
  }

  /**
   * Closes every Worker. In-flight requests finish first: the close message queues behind them.
   * Resolves when the exit of every write Worker was observed, whatever the state of its domain
   * entry: a quarantined domain or a failed open can leave a Worker that is still ending (SPEC 13.3
   * step 5).
   */
  async closeAll(): Promise<void> {
    const closing: Promise<void>[] = []
    for (const entry of Array.from(this.entries.values())) {
      if (entry.state === 'opening')
        closing.push(
          entry.opening.then(async outcome => {
            if (outcome.kind === 'ready') await outcome.entry.client.close()
          }),
        )
      else if (entry.state === 'ready') closing.push(entry.client.close())
    }
    await Promise.all(closing)
    await Promise.all([...this.workers.values()].map(worker => worker.client.exited))
  }

  /**
   * Write Workers that have not exited, for the residuals of an incomplete close. A Worker that is
   * still opening an existing file has no scope yet, and is not listed.
   */
  residualWorkers(): readonly (LiveWorker & { scope: StorageScope })[] {
    return [...this.workers.values()].filter(
      (worker): worker is LiveWorker & { scope: StorageScope } => worker.scope !== null,
    )
  }
}
