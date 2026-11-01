import { randomUUID } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  EnvironmentLease,
  FacilityResult,
  FileSystemFacility,
  LeaseInvalidation,
  ManagedResource,
  OriginalAcquisition,
  ProviderQuota,
} from '@omne-harness/execution-environment-contract'
import type { HostCommands } from './host-command.ts'
import { hostFilesLimits } from './host-file-tree.ts'
import {
  createHostFilesEngine,
  type HostFileDiagnostic,
  type HostFilesEngine,
  type HostFilesEngineOptions,
  type HostFilesLimits,
} from './host-files.ts'

/** The per-tenant quota policy of a host files domain. Its values are configuration, not contract. */
export type HostFilesQuotaPolicy = (tenant: TenantId) => Readonly<{
  perTenant: number
  global: number | null
}>

export type HostFilesDomainOptions = Readonly<{
  /** The trusted capacity domain. Every provider of this domain shares it. Default `host-files`. */
  quotaDomain?: string
  /** The quota policy, read at each admission. Default: 64 per tenant, no global bound. */
  quota?: HostFilesQuotaPolicy
}>

/**
 * The responsibility domain of host file use. The single owner of the process host creates and
 * keeps it; it outlives every provider generation and every environment registry, so a new
 * generation sees the original quota use and the original acquisitions. Records live in this
 * process only: after the process ends, nothing here proves that the old capacity was settled.
 */
export interface HostFilesDomain {
  readonly quotaDomain: string
  /** The process instance this domain belongs to; a new process makes a new domain. */
  readonly instance: string
  readonly durability: 'process'
  /**
   * Retries the failed closes and the unconfirmed process stops of every acquisition still
   * releasing; answers how many remain.
   */
  maintain(): Promise<Readonly<{ pending: number }>>
}

const defaultPerTenant = 64

export type RecordState = 'open' | 'releasing' | 'settled'

/** One acquisition of the domain: its original description, its facades and its owner tag. */
export type DomainRecord = {
  readonly owner: string
  readonly tenant: string
  readonly original: OriginalAcquisition
  readonly fingerprint: string
  readonly generation: string
  /** The engine behind the facade; it holds the descriptors and handles of this acquisition. */
  readonly engine: HostFilesEngine
  readonly facade: TrackedFacade
  /** The command side of this acquisition: its admission and the processes it started. */
  readonly commands: HostCommands
  state: RecordState
  lease: EnvironmentLease | null
  invalidate: (value: LeaseInvalidation) => void
}

/** The facility of one acquisition, with its own admission and in-flight set. */
export type TrackedFacade = Readonly<{
  facility: FileSystemFacility<unknown>
  /**
   * Admits no new operation from now on, and seals the engine for this owner at the same moment.
   * The facade's seal is the answer to callers: a new operation answers `closed`. The engine's seal
   * is only the signal that stops a running batch before its next publication.
   */
  seal(): void
  sealed(): boolean
  inFlight(): number
  settled(): Promise<void>
}>

export type AdmitResult =
  | Readonly<{ kind: 'admitted'; record: DomainRecord }>
  | Readonly<{ kind: 'existing'; record: DomainRecord }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'quotaExceeded' | 'globalCapacityExceeded' }>
  | Readonly<{ kind: 'unknown' }>

/** `pending` lists the processes whose stop is not confirmed; in-flight work and open descriptors are not resources. */
export type DrainResult =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'pending'; resources: readonly ManagedResource[] }>

/** The configuration of the files engine a provider asks the domain for. */
export type HostFilesSettings = Readonly<{
  root?: string | undefined
  stateDirectory?: string | undefined
  limits?: Partial<HostFilesLimits> | undefined
}>

/** A provider's place in a shared engine: the engine, and the end of its diagnostic subscription. */
export type EngineMembership = Readonly<{
  engine: HostFilesEngine
  /** Stops delivering the engine's diagnostics to this member; the engine stays. */
  leave(): void
}>

/** The domain's internal surface for its providers. It is not part of the package's public entry. */
export type DomainInternals = Readonly<{
  /**
   * The engine for `settings`: the first request makes it, every later request with the same
   * settings shares it, so their acquisitions keep handle generations unique across providers.
   * Throws when the settings are not valid. `diagnose` receives the diagnostics of the engine
   * until `leave` is called.
   */
  joinEngine(
    settings: HostFilesSettings,
    diagnose: ((diagnostic: HostFileDiagnostic) => void) | undefined,
  ): EngineMembership
  quota(tenant: TenantId): ProviderQuota | undefined
  registerGeneration(generation: string): void
  knowsGeneration(generation: string): boolean
  /**
   * `engine` serves the new acquisition. `commands` makes its command side; a repeat never calls
   * it.
   */
  admit(
    original: OriginalAcquisition,
    fingerprint: string,
    generation: string,
    engine: HostFilesEngine,
    commands: () => HostCommands,
  ): AdmitResult
  find(original: OriginalAcquisition): DomainRecord | undefined
  records(): Iterable<DomainRecord>
  /**
   * Seals, waits up to `boundMs`, retries closes, force-stops the processes; settles exactly once
   * when nothing is left.
   */
  drain(record: DomainRecord, boundMs: number): Promise<DrainResult>
}>

const internals = new WeakMap<HostFilesDomain, DomainInternals>()

/** The domain internals for a provider of this package; undefined for a foreign object. */
export function domainInternals(domain: HostFilesDomain): DomainInternals | undefined {
  return internals.get(domain)
}

function retiredResult(requestId: string): FacilityResult<never> {
  return { kind: 'rejected', requestId, reason: 'closed' }
}

/**
 * Counts the file operations of one acquisition. An operation is registered before its first await;
 * after `seal()` a new operation answers `closed` without touching the file system. `sealEngine`
 * runs in the same step as the facade's own seal.
 */
function trackedFacade(files: FileSystemFacility<unknown>, sealEngine: () => void): TrackedFacade {
  const inFlight = new Set<Promise<unknown>>()
  let sealed = false
  const track =
    <Q extends { readonly requestId: string }, T>(
      run: (request: Q) => Promise<FacilityResult<T>>,
    ) =>
    async (request: Q): Promise<FacilityResult<T>> => {
      if (sealed) return retiredResult(request.requestId)
      const running = run(request)
      inFlight.add(running)
      try {
        return await running
      } finally {
        inFlight.delete(running)
      }
    }
  const facility: FileSystemFacility<unknown> = {
    read: track(request => files.read(request)),
    stat: track(request => files.stat(request)),
    write: track(request => files.write(request)),
    close: track(request => files.close(request)),
    list: track(request => files.list(request)),
    search: track(request => files.search(request)),
    mkdir: track(request => files.mkdir(request)),
    remove: track(request => files.remove(request)),
    move: track(request => files.move(request)),
    copy: track(request => files.copy(request)),
    commitBatch: track(request => files.commitBatch(request)),
    recoverBatch: track(request => files.recoverBatch(request)),
  }
  return Object.freeze({
    facility,
    seal() {
      sealed = true
      sealEngine()
    },
    sealed: () => sealed,
    inFlight: () => inFlight.size,
    settled: () => Promise.allSettled(inFlight).then(() => undefined),
  })
}

/** Waits for `settled` at most `boundMs`; answers whether it settled in time. */
export async function within(settled: Promise<void>, boundMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<false>(resolve => {
    timer = setTimeout(resolve, boundMs, false)
  })
  try {
    return await Promise.race([settled.then(() => true), expired])
  } finally {
    clearTimeout(timer)
  }
}

function isBound(value: unknown, nullable: boolean): boolean {
  return (
    (nullable && value === null) ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
  )
}

function tenantText(tenant: TenantId): string | undefined {
  const text = tenantCodec.encode(tenant)
  return text.ok ? text.value : undefined
}

function slotKey(tenant: TenantId, acquisition: string): string | undefined {
  const text = tenantText(tenant)
  return text === undefined ? undefined : JSON.stringify([text, acquisition])
}

function scopeChain(scope: ScopeRef | undefined): readonly string[] {
  const refs: string[] = []
  const seen = new Set<object>()
  for (let s = scope; s && !seen.has(s); s = s.parent) {
    seen.add(s)
    refs.push(s.ref)
  }
  return refs
}

/** The fingerprint of an original description, without the tenant the slot key already names. */
export function fingerprintOf(original: OriginalAcquisition): string {
  const p = original.placement
  const binding = (b: OriginalAcquisition['placement']['binding']) => {
    switch (b.kind) {
      case 'host_machine':
        return [b.kind]
      case 'stateless_sandbox':
        return [b.kind, b.origin, scopeChain(b.scope)]
      case 'session_sandbox':
        return [b.kind, scopeChain(b.scope)]
      case 'tenant_sandbox':
        return [b.kind, tenantText(b.tenant) ?? null]
      default: {
        const exhaustive: never = b
        return exhaustive
      }
    }
  }
  return JSON.stringify([
    p.quotaDomain,
    original.origin,
    scopeChain(original.scope),
    binding(p.binding),
    [p.provider.name, p.provider.generation, p.provider.version],
    p.continuity,
    [...new Set(p.requirement.facilities)].sort(),
    [...new Set(p.requirement.isolation)].sort(),
    p.requirement.allowedBindings.map(binding),
  ])
}

type DiagnosticSink = (diagnostic: HostFileDiagnostic) => void

type SharedEngine = Readonly<{ engine: HostFilesEngine; sinks: Set<DiagnosticSink> }>

function engineOptions(
  settings: HostFilesSettings,
  diagnose: DiagnosticSink,
): HostFilesEngineOptions {
  return {
    ...(settings.root === undefined ? {} : { root: settings.root }),
    ...(settings.stateDirectory === undefined ? {} : { stateDirectory: settings.stateDirectory }),
    diagnose,
  }
}

/** Gives every diagnostic to each sink; a sink that throws changes nothing for the others. */
function deliver(sinks: ReadonlySet<DiagnosticSink>, diagnostic: HostFileDiagnostic): void {
  for (const sink of sinks)
    try {
      sink(diagnostic)
    } catch {
      /* A diagnostic sink never changes the result. */
    }
}

/**
 * The engines of one domain, one per files configuration: root, state directory and bounds. An
 * engine keeps the handles and the descriptors of every acquisition made with it, so the
 * acquisitions of one configuration, across provider generations, share it.
 */
function createEngineRegistry(): DomainInternals['joinEngine'] {
  const engines = new Map<string, SharedEngine>()
  return (settings, diagnose) => {
    const limits = hostFilesLimits(settings.limits)
    const key = JSON.stringify([settings.root ?? null, settings.stateDirectory ?? null, limits])
    let shared = engines.get(key)
    if (shared === undefined) {
      const sinks = new Set<DiagnosticSink>()
      const engine = createHostFilesEngine(
        engineOptions(settings, diagnostic => deliver(sinks, diagnostic)),
        limits,
      )
      shared = { engine, sinks }
      engines.set(key, shared)
    }
    // Each member has a sink of its own, so one member leaving does not take another's away.
    const sink: DiagnosticSink = diagnostic => diagnose?.(diagnostic)
    shared.sinks.add(sink)
    const sinks = shared.sinks
    return { engine: shared.engine, leave: () => void sinks.delete(sink) }
  }
}

/** Creates a host files domain. Create one per process host and pass it to every provider. */
export function createHostFilesDomain(options: HostFilesDomainOptions = {}): HostFilesDomain {
  const quotaDomain = options.quotaDomain ?? 'host-files'
  if (quotaDomain === '') throw new RangeError('quotaDomain must not be empty')
  const policy: HostFilesQuotaPolicy =
    options.quota ?? (() => ({ perTenant: defaultPerTenant, global: null }))
  const generations = new Set<string>()
  const records = new Map<string, DomainRecord>()
  let nextOwner = 1

  const unsettled = (tenant?: string) => {
    let count = 0
    for (const record of records.values())
      if (record.state !== 'settled' && (tenant === undefined || record.tenant === tenant)) count++
    return count
  }

  const quota = (tenant: TenantId): ProviderQuota | undefined => {
    let answer: ReturnType<HostFilesQuotaPolicy>
    try {
      answer = policy(tenant)
    } catch {
      return undefined
    }
    if (typeof answer !== 'object' || answer === null) return undefined
    if (!isBound(answer.perTenant, false) || !isBound(answer.global, true)) return undefined
    return { unit: 'unsettled-acquisition', perTenant: answer.perTenant, global: answer.global }
  }

  const drain = async (record: DomainRecord, boundMs: number): Promise<DrainResult> => {
    const settled: DrainResult = { kind: 'settled' }
    if (record.state === 'settled') return settled
    record.facade.seal()
    record.commands.seal()
    record.invalidate({ source: 'provider', reason: 'released' })
    if (record.state === 'open') record.state = 'releasing'
    const quiet = await within(
      Promise.all([record.facade.settled(), record.commands.settled()]).then(() => undefined),
      boundMs,
    )
    const open = await record.engine.closeOwned(record.owner)
    // A process still running is stopped by force: draining never leaves it to a later generation.
    const resources = await record.commands.stopAll()
    const busy = record.facade.inFlight() + record.commands.inFlight()
    const pending: DrainResult = { kind: 'pending', resources }
    if (!quiet || open > 0 || busy > 0 || resources.length > 0) return pending
    // Exactly one return of the slot: only the first drain that finds nothing left settles.
    if (record.state !== 'releasing') return record.state === 'settled' ? settled : pending
    record.state = 'settled'
    record.lease = null
    return settled
  }

  const domain: HostFilesDomain = {
    quotaDomain,
    instance: randomUUID(),
    durability: 'process',
    async maintain() {
      let pending = 0
      for (const record of records.values())
        if (record.state === 'releasing' && (await drain(record, 0)).kind === 'pending') pending++
      return { pending }
    },
  }

  internals.set(domain, {
    joinEngine: createEngineRegistry(),
    quota,
    registerGeneration: generation => {
      generations.add(generation)
    },
    knowsGeneration: generation => generations.has(generation),
    admit(original, fingerprint, generation, engine, commands) {
      const key = slotKey(original.tenant, original.acquisition)
      if (key === undefined) return { kind: 'unknown' }
      const existing = records.get(key)
      if (existing !== undefined)
        return existing.fingerprint === fingerprint
          ? { kind: 'existing', record: existing }
          : { kind: 'conflict' }
      const tenant = tenantText(original.tenant)
      const declared = quota(original.tenant)
      if (declared === undefined || tenant === undefined) return { kind: 'unknown' }
      // The tenant bound first, then the global one; one synchronous step admits and reserves.
      if (unsettled(tenant) >= declared.perTenant) return { kind: 'quotaExceeded' }
      if (declared.global !== null && unsettled() >= declared.global)
        return { kind: 'globalCapacityExceeded' }
      const owner = `acquisition-${nextOwner++}`
      const record: DomainRecord = {
        owner,
        tenant,
        original,
        fingerprint,
        generation,
        engine,
        facade: trackedFacade(engine.facilityFor(owner), () => engine.seal(owner)),
        commands: commands(),
        state: 'open',
        lease: null,
        invalidate: () => undefined,
      }
      records.set(key, record)
      return { kind: 'admitted', record }
    },
    find(original) {
      const key = slotKey(original.tenant, original.acquisition)
      return key === undefined ? undefined : records.get(key)
    },
    records: () => records.values(),
    drain,
  })
  return Object.freeze(domain)
}
