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
    void entry.client.close()
  }

  private startOpening(domain: string, create: RegistrationSpec | null): OpeningDomain {
    const opening = this.open(domain, create)
    const entry: OpeningDomain = { state: 'opening', opening }
    this.entries.set(domain, entry)
    return entry
  }

  private async open(domain: string, create: RegistrationSpec | null): Promise<OpenOutcome> {
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
    const claim = claimWriter(file, this.providerGeneration)
    if (claim === null) {
      // Another generation still has a write Worker on this file (SPEC 13.5): a transient fault.
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
      void started.exited.then(() => {
        this.workers.delete(leaseName)
        releaseWriter(claim)
        this.hooks.latch.release(() => this.leases.release(lease))
      })
      reply = await started.request<OpenReply>({ kind: 'open', create })
    } catch {
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
      // A file that held a binding was opened through path A: the registration was not written.
      return { kind: 'ready', entry, created: reply.created ? create : null }
    }
    await client?.close()
    if (reply.kind === 'quarantined') {
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

  /** Write Workers whose exit was not observed yet: they still hold a Worker slot (SPEC 12.2). */
  liveWriterCount(): number {
    return this.workers.size
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
