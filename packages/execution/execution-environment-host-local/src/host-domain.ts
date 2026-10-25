import { randomUUID } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  EnvironmentLease,
  FacilityResult,
  FileSystemFacility,
  LeaseInvalidation,
  OriginalAcquisition,
  ProviderQuota,
} from '@omne-harness/execution-environment-contract'
import { createHostFilesEngine, type HostFilesEngine } from './host-files.ts'

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
  /** Retries the failed closes of every acquisition still releasing; answers how many remain. */
  maintain(): Promise<Readonly<{ pending: number }>>
}

const defaultPerTenant = 64

export type RecordState = 'open' | 'releasing' | 'settled'

/** One acquisition of the domain: its original description, its facade and its owner tag. */
export type DomainRecord = {
  readonly owner: string
  readonly tenant: string
  readonly original: OriginalAcquisition
  readonly fingerprint: string
  readonly generation: string
  readonly facade: TrackedFacade
  state: RecordState
  lease: EnvironmentLease | null
  invalidate: (value: LeaseInvalidation) => void
}

/** The facility of one acquisition, with its own admission and in-flight set. */
export type TrackedFacade = Readonly<{
  facility: FileSystemFacility<unknown>
  /** Admits no new operation from now on. */
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

/** The domain's internal surface for its providers. It is not part of the package's public entry. */
export type DomainInternals = Readonly<{
  engine: HostFilesEngine
  quota(tenant: TenantId): ProviderQuota | undefined
  registerGeneration(generation: string): void
  knowsGeneration(generation: string): boolean
  admit(original: OriginalAcquisition, fingerprint: string, generation: string): AdmitResult
  find(original: OriginalAcquisition): DomainRecord | undefined
  records(): Iterable<DomainRecord>
  /** Seals, waits up to `boundMs`, retries closes; settles exactly once when nothing is left. */
  drain(record: DomainRecord, boundMs: number): Promise<'settled' | 'pending'>
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
 * after `seal()` a new operation answers `closed` without touching the file system.
 */
function trackedFacade(files: FileSystemFacility<unknown>): TrackedFacade {
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

/** Creates a host files domain. Create one per process host and pass it to every provider. */
export function createHostFilesDomain(options: HostFilesDomainOptions = {}): HostFilesDomain {
  const quotaDomain = options.quotaDomain ?? 'host-files'
  if (quotaDomain === '') throw new RangeError('quotaDomain must not be empty')
  const policy: HostFilesQuotaPolicy =
    options.quota ?? (() => ({ perTenant: defaultPerTenant, global: null }))
  const engine = createHostFilesEngine()
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

  const drain = async (record: DomainRecord, boundMs: number): Promise<'settled' | 'pending'> => {
    if (record.state === 'settled') return 'settled'
    record.facade.seal()
    record.invalidate({ source: 'provider', reason: 'released' })
    if (record.state === 'open') record.state = 'releasing'
    const quiet = await within(record.facade.settled(), boundMs)
    const open = await engine.closeOwned(record.owner)
    if (!quiet || open > 0 || record.facade.inFlight() > 0) return 'pending'
    // Exactly one return of the slot: only the first drain that finds nothing left settles.
    if (record.state !== 'releasing') return record.state === 'settled' ? 'settled' : 'pending'
    record.state = 'settled'
    record.lease = null
    return 'settled'
  }

  const domain: HostFilesDomain = {
    quotaDomain,
    instance: randomUUID(),
    durability: 'process',
    async maintain() {
      let pending = 0
      for (const record of records.values())
        if (record.state === 'releasing' && (await drain(record, 0)) === 'pending') pending++
      return { pending }
    },
  }

  internals.set(domain, {
    engine,
    quota,
    registerGeneration: generation => {
      generations.add(generation)
    },
    knowsGeneration: generation => generations.has(generation),
    admit(original, fingerprint, generation) {
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
        facade: trackedFacade(engine.facilityFor(owner)),
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
