import { randomUUID } from 'node:crypto'
import {
  createWindowsTerminalCapacity,
  type WindowsTerminalCapacity,
} from './windows-execution/terminal-output.ts'
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
import type { HostTerminals } from './host-terminal.ts'
import {
  createRetainedTerminalIndex,
  type RetainedTerminalIndex,
} from './host-retained-terminals.ts'
import type { RetainedProcessIndex } from './host-retained-processes.ts'
import { hostFilesLimits } from './host-file-tree.ts'
import {
  createHostFilesEngine,
  type HostFileDiagnostic,
  type HostFilesEngine,
  type HostFilesEngineOptions,
  type HostFilesLimits,
} from './host-files.ts'

export type HostFilesQuotaPolicy = (tenant: TenantId) => Readonly<{
  perTenant: number
  global: number | null
}>

export type HostFilesDomainOptions = Readonly<{
  quotaDomain?: string
  quota?: HostFilesQuotaPolicy
}>

export interface HostFilesDomain {
  readonly quotaDomain: string
  readonly instance: string
  readonly durability: 'process'
  maintain(): Promise<Readonly<{ pending: number }>>
}

const defaultPerTenant = 64

export type RecordState = 'open' | 'releasing' | 'settled'

export type DomainRecord = {
  readonly owner: string
  readonly tenant: string
  readonly original: OriginalAcquisition
  readonly fingerprint: string
  readonly generation: string
  readonly engine: HostFilesEngine
  readonly facade: TrackedFacade
  readonly commands: HostCommands
  readonly terminals: HostTerminals
  state: RecordState
  lease: EnvironmentLease | null
  invalidate: (value: LeaseInvalidation) => void
}

export type TrackedFacade = Readonly<{
  facility: FileSystemFacility<unknown>
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

export type DrainResult =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'pending'; resources: readonly ManagedResource[] }>

export type HostFilesSettings = Readonly<{
  root?: string | undefined
  stateDirectory?: string | undefined
  limits?: Partial<HostFilesLimits> | undefined
}>

export type EngineMembership = Readonly<{
  engine: HostFilesEngine
  leave(): void
}>

export type DomainInternals = Readonly<{
  retainedTerminals: RetainedTerminalIndex
  retainedProcesses(stateDirectory: string, make: () => RetainedProcessIndex): RetainedProcessIndex
  windowsCapacity(): WindowsTerminalCapacity
  joinEngine(
    settings: HostFilesSettings,
    diagnose: ((diagnostic: HostFileDiagnostic) => void) | undefined,
  ): EngineMembership
  quota(tenant: TenantId): ProviderQuota | undefined
  registerGeneration(generation: string): void
  knowsGeneration(generation: string): boolean
  admit(
    original: OriginalAcquisition,
    fingerprint: string,
    generation: string,
    engine: HostFilesEngine,
    commands: () => HostCommands,
    terminals: () => HostTerminals,
  ): AdmitResult
  find(original: OriginalAcquisition): DomainRecord | undefined
  records(): Iterable<DomainRecord>
  drain(record: DomainRecord, boundMs: number): Promise<DrainResult>
}>

const internals = new WeakMap<HostFilesDomain, DomainInternals>()

export function domainInternals(domain: HostFilesDomain): DomainInternals | undefined {
  return internals.get(domain)
}

function retiredResult(requestId: string): FacilityResult<never> {
  return { kind: 'rejected', requestId, reason: 'closed' }
}

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
    scopeChain(original.retentionScope),
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

function deliver(sinks: ReadonlySet<DiagnosticSink>, diagnostic: HostFileDiagnostic): void {
  for (const sink of sinks)
    try {
      sink(diagnostic)
    } catch {}
}

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
    const sink: DiagnosticSink = diagnostic => diagnose?.(diagnostic)
    shared.sinks.add(sink)
    const sinks = shared.sinks
    return { engine: shared.engine, leave: () => void sinks.delete(sink) }
  }
}

export function createHostFilesDomain(options: HostFilesDomainOptions = {}): HostFilesDomain {
  const quotaDomain = options.quotaDomain ?? 'host-files'
  if (quotaDomain === '') throw new RangeError('quotaDomain must not be empty')
  const policy: HostFilesQuotaPolicy =
    options.quota ?? (() => ({ perTenant: defaultPerTenant, global: null }))
  const generations = new Set<string>()
  const records = new Map<string, DomainRecord>()
  const retainedTerminals = createRetainedTerminalIndex()
  const retainedProcesses = new Map<string, RetainedProcessIndex>()
  let windowsCapacity: WindowsTerminalCapacity | undefined
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
    record.terminals.seal()
    record.invalidate({ source: 'provider', reason: 'released' })
    if (record.state === 'open') record.state = 'releasing'
    const quiet = await within(
      Promise.all([
        record.facade.settled(),
        record.commands.settled(),
        record.terminals.settled(),
      ]).then(() => undefined),
      boundMs,
    )
    const open = await record.engine.closeOwned(record.owner)
    // A process still running is stopped by force: draining never leaves it to a later generation.
    const resources = (
      await Promise.all([record.commands.stopAll(), record.terminals.stopAll()])
    ).flat()
    const busy = record.facade.inFlight() + record.commands.inFlight() + record.terminals.inFlight()
    const pending: DrainResult = { kind: 'pending', resources }
    if (!quiet || open > 0 || busy > 0 || resources.length > 0) return pending
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
      let pending = await retainedTerminals.maintain()
      for (const index of retainedProcesses.values()) pending += await index.maintain()
      for (const record of records.values())
        if (record.state === 'releasing' && (await drain(record, 0)).kind === 'pending') pending++
      return { pending }
    },
  }

  internals.set(domain, {
    retainedTerminals,
    retainedProcesses(stateDirectory, make) {
      let index = retainedProcesses.get(stateDirectory)
      if (index === undefined) {
        index = make()
        retainedProcesses.set(stateDirectory, index)
      }
      return index
    },
    windowsCapacity: () => (windowsCapacity ??= createWindowsTerminalCapacity()),
    joinEngine: createEngineRegistry(),
    quota,
    registerGeneration: generation => {
      generations.add(generation)
    },
    knowsGeneration: generation => generations.has(generation),
    admit(original, fingerprint, generation, engine, commands, terminals) {
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
        terminals: terminals(),
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
