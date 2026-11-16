import { mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CloseLeasePort, SqlMaterialCatalog, StorageScope } from '@omne-harness/sql-contract'
import { canonicalFile, claimWriter, releaseWriter } from './claims.ts'
import type { ReportLatch } from './close.ts'
import type { SqliteStorageConfig } from './config.ts'
import type { OpenReply, RegistrationSpec, WalState } from './worker/protocol.ts'
import { WriterClient } from './writer-client.ts'

export type Lifecycle = { closing: boolean }

export type CloseHooks = Readonly<{
  latch: ReportLatch
  readGate: Readonly<{ pause(domain: string): void; resume(domain: string): void }>
  readers: Readonly<{
    count(): number
    retireIdle(): Promise<void> | null
    slotFreed(): void
  }>
}>

type LiveWorker = {
  readonly domain: string
  readonly leaseName: string
  readonly client: WriterClient
  scope: StorageScope | null
}

export type ReadyDomain = {
  readonly state: 'ready'
  readonly domain: string
  readonly client: WriterClient
  readonly scope: StorageScope
  readonly singletons: readonly string[]
  readonly leaseName: string
  readonly wal: { state: WalState }
}

export type VerifiedDomain = Readonly<{ domain: string; scope: StorageScope }>

type OpeningDomain = {
  readonly state: 'opening'
  readonly opening: Promise<OpenOutcome>
}

type QuarantinedDomain = { readonly state: 'quarantined'; readonly diagnostic: string }

type Entry = ReadyDomain | OpeningDomain | QuarantinedDomain

export type OpenOutcome =
  | Readonly<{ kind: 'ready'; entry: ReadyDomain; created: RegistrationSpec | null }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'quarantined'; diagnostic: string }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'closing' }>

const hex = (text: string): string => Buffer.from(text, 'utf8').toString('hex')

let providerCounter = 0

type Presence = Readonly<{ kind: 'present' | 'missing' | 'unknown'; file: string }>

/** A file that was seen missing before an open began. Only such a file may be removed again. */
type SeenMissing = Presence & Readonly<{ kind: 'missing' }>

async function presence(file: string): Promise<Presence> {
  try {
    await stat(file)
    return { kind: 'present', file }
  } catch (error) {
    const missing = (error as { code?: unknown } | null)?.code === 'ENOENT'
    return { kind: missing ? 'missing' : 'unknown', file }
  }
}

const seenMissing = (seen: Presence): seen is SeenMissing => seen.kind === 'missing'

export class Domains {
  private readonly entries = new Map<string, Entry>()
  private readonly config: SqliteStorageConfig
  private readonly catalog: SqlMaterialCatalog
  private readonly leases: CloseLeasePort
  private readonly lifecycle: Lifecycle
  private readonly hooks: CloseHooks
  private readonly providerGeneration: number
  private readonly workers = new Map<string, LiveWorker>()
  private workerGeneration = 0
  private reserved = 0
  private readonly holds = new Map<string, number>()
  private readonly lastHeld = new Map<string, number>()
  private holdClock = 0
  private readonly departing = new Map<string, Promise<void>>()
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

  fileOf(domain: string): string {
    return canonicalFile(join(this.config.storageRoot, 'domains', `${hex(domain)}.sqlite`))
  }

  admitReader(domain: string, generation: number): { name: string; lease: object } {
    const name = `storage/${String(this.providerGeneration)}/reader/${hex(domain)}.sqlite/${String(generation)}`
    return { name, lease: this.leases.admit(name) }
  }

  releaseLease(lease: object): void {
    this.hooks.latch.release(() => this.leases.release(lease))
  }

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

  writerSlots(): number {
    return this.workers.size + this.reserved
  }

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
    this.entries.delete(domain)
    this.lastHeld.delete(domain)
    const gone = client.close().then(() => {
      if (this.departing.get(domain) === gone) this.departing.delete(domain)
    })
    this.departing.set(domain, gone)
    return gone
  }

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

  readable(domain: string): VerifiedDomain | null {
    return this.lifecycle.closing ? null : (this.verified.get(domain) ?? null)
  }

  peekReady(domain: string): ReadyDomain | null {
    const entry = this.entries.get(domain)
    return entry?.state === 'ready' && !this.lifecycle.closing ? entry : null
  }

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
    await this.departing.get(domain)
    const file = this.fileOf(domain)
    const before = await presence(file)
    const forget = (): void => void this.entries.delete(domain)
    if (before.kind === 'unknown') {
      forget()
      return { kind: 'failed', diagnostic: 'domain_presence_unknown' }
    }
    if (before.kind === 'missing' && create === null) {
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
    let slotReserved = true
    const settleSlot = (): void => {
      if (!slotReserved) return
      slotReserved = false
      this.reserved -= 1
    }
    const claim = claimWriter(file, this.providerGeneration)
    if (claim === null) {
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
      if (seenMissing(before)) await this.removeCreated(before)
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
      if (!this.verified.has(domain)) this.verified.set(domain, { domain, scope: reply.scope })
      return { kind: 'ready', entry, created: reply.created ? create : null }
    }
    await client?.close()
    if (reply.kind === 'quarantined') {
      this.verified.delete(domain)
      this.entries.set(domain, { state: 'quarantined', diagnostic: reply.diagnostic })
      return { kind: 'quarantined', diagnostic: reply.diagnostic }
    }
    forget()
    if (seenMissing(before)) await this.removeCreated(before)
    if (reply.kind === 'absent') return { kind: 'absent' }
    if (reply.kind === 'unknown') return { kind: 'unknown', diagnostic: reply.diagnostic }
    if (reply.kind === 'ready') return { kind: 'failed', diagnostic: 'worker_unavailable' }
    return { kind: 'failed', diagnostic: reply.diagnostic }
  }

  private async removeCreated({ file }: SeenMissing): Promise<void> {
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      await rm(`${file}${suffix}`, { force: true }).catch(() => undefined)
  }

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

  residualWorkers(): readonly (LiveWorker & { scope: StorageScope })[] {
    return [...this.workers.values()].filter(
      (worker): worker is LiveWorker & { scope: StorageScope } => worker.scope !== null,
    )
  }
}
