import { createDiagnosticCollector } from '@omne-harness-lite/model-request-runtime-local'
import { resolve } from 'node:path'
import type {
  DiagnosticCloseResult,
  DiagnosticCollector,
  DiagnosticCollectorConfig,
  DiagnosticExportLimits,
  DiagnosticExportResult,
  DiagnosticHealth,
  DiagnosticQuery,
  DiagnosticQueryResult,
  DiagnosticScope,
} from '@omne-harness-lite/model-request-runtime-local'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type {
  ModelTransportService,
  RetirementResult,
} from '@omne-harness-lite/model-request-runtime'
import type { RetirementPolicy } from '@omne-harness-lite/model-request-runtime'
import { createDiagnosticJournal } from './diagnostic-journal.ts'
import type { DiagnosticJournalConfig } from './diagnostic-journal.ts'

type CollectorLimits = Omit<DiagnosticCollectorConfig, 'collectorId' | 'scope' | 'store'>
type JournalLocation = Pick<DiagnosticJournalConfig, 'rootDir' | 'collectorId'>

/** This example receives an already verified tenant identity from its application entry. */
export interface DemoDiagnosticConfig {
  readonly local: JournalLocation
  readonly tenant: JournalLocation & { readonly tenant: TenantId }
  readonly collector: CollectorLimits
  /** Trusted host filesystem provider for the diagnostic journal only; defaults to Node FS. */
  readonly journalFileSystem?: DiagnosticJournalConfig['fs']
  readonly transportRetainedInstancesMax: number
  readonly transportRetirement: RetirementPolicy
}

/** A read capability for exactly one scope; query/export still require that scope explicitly. */
export interface DemoDiagnosticScope {
  readonly scope: DiagnosticScope
  readonly collector: Pick<DiagnosticCollector, 'record' | 'emitter' | 'health' | 'metrics'>
  readonly query: (query: DiagnosticQuery) => Promise<DiagnosticQueryResult>
  readonly exportPage: (
    query: DiagnosticQuery,
    limits: DiagnosticExportLimits,
  ) => Promise<DiagnosticExportResult>
  readonly health: () => DiagnosticHealth
}

type Inspection = ReturnType<ModelTransportService['inspect']>
type DeliveryHealth = ReturnType<ModelTransportService['diagnostics']>
type RetirementState =
  | 'not_started'
  | 'pending'
  | 'retired'
  | 'remaining_active'
  | 'cleanup_failed'
  | 'rejected'
  | 'failed'

export interface TransportInstanceState {
  readonly generation: number
  readonly role: 'current' | 'retired'
  readonly retirement: RetirementState
  readonly closed: 'pending' | 'confirmed' | 'failed'
  readonly inspect?: Inspection
  readonly diagnostics?: DeliveryHealth
}

export interface TransportTerminalSnapshot {
  readonly generation: number
  readonly closedAt: string
  readonly inspect: Inspection
  readonly diagnostics: DeliveryHealth
}

export interface DemoTransportHealth {
  readonly transportLiveInstances: number
  readonly transportTerminalSnapshots: number
  readonly transportReservedInstances: number
  readonly transportRetentionLimit: number
  readonly transportSnapshotsEvicted: number | 'unknown'
  readonly transportReplacementRefusals: number | 'unknown'
  readonly live: readonly TransportInstanceState[]
  readonly terminal: readonly TransportTerminalSnapshot[]
  readonly unknownReservations: number
  readonly accepting: boolean
}

interface Instance {
  readonly generation: number
  readonly service: ModelTransportService
  role: 'current' | 'retired'
  retirement: RetirementState
  closed: 'pending' | 'confirmed' | 'failed'
  retirementTask?: Promise<RetirementResult | { readonly failed: true }>
}

interface Reservation {
  readonly generation: number
  state: 'reserved' | 'unknown' | 'settled'
}

export interface TransportReservation {
  /** Fixed before service construction; failed reservations do not reuse this number. */
  readonly generation: number
  /** Called only after construction returned the actual service. */
  readonly commit: (service: ModelTransportService) => number
  /** A trusted construction path confirmed that no service or other resource exists. */
  readonly abortNoResources: () => void
  /** A partial construction may still own resources; retain its place and report incomplete. */
  readonly abortUnknown: () => void
  /** Construction returned a service but failed before publishing it for business use. */
  readonly adoptFailedConstruction: (service: ModelTransportService) => number
}

export interface DemoTransportRetention {
  readonly reserveReplacement: () =>
    | { readonly reservation: TransportReservation }
    | { readonly unavailable: 'transport_retention_full' }
  /** The business owner has stopped using this generation; this does not close it. */
  readonly markRetired: (generation: number) => void
  /** Start or observe the real service close operation, with an explicit retirement policy. */
  readonly closeRetired: (
    generation: number,
    policy: RetirementPolicy,
  ) => Promise<RetirementResult | { readonly failed: true }>
  readonly stopAdmission: () => void
  readonly health: () => DemoTransportHealth
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function bump(value: number | 'unknown'): number | 'unknown' {
  return value === 'unknown' || value === Number.MAX_SAFE_INTEGER ? 'unknown' : value + 1
}

function ownInspection(service: ModelTransportService): Inspection | undefined {
  try {
    const value = service.inspect()
    if (
      typeof value.accepting !== 'boolean' ||
      !Number.isSafeInteger(value.registrations) ||
      !Number.isSafeInteger(value.retiring) ||
      !Number.isSafeInteger(value.references) ||
      !Number.isSafeInteger(value.executions) ||
      !Number.isSafeInteger(value.cleanupFailures) ||
      Object.values(value).some(entry => typeof entry === 'number' && entry < 0)
    )
      return undefined
    return Object.freeze({ ...value })
  } catch {
    return undefined
  }
}

function ownDeliveryHealth(service: ModelTransportService): DeliveryHealth | undefined {
  try {
    const value = service.diagnostics()
    if (
      !Number.isSafeInteger(value.failed) ||
      !Number.isSafeInteger(value.pending) ||
      !Number.isSafeInteger(value.dropped) ||
      value.failed < 0 ||
      value.pending < 0 ||
      value.dropped < 0
    )
      return undefined
    return Object.freeze({ failed: value.failed, pending: value.pending, dropped: value.dropped })
  } catch {
    return undefined
  }
}

/** One bounded table for current, constructing, live retired and terminal generations. */
export function createDemoTransportRetention(
  limit: number,
  wallClock: () => Date,
): DemoTransportRetention {
  if (!positive(limit) || typeof wallClock !== 'function')
    throw new TypeError('transport retention limit and clock required')
  const live = new Map<number, Instance>()
  const reservations = new Set<Reservation>()
  const terminal: TransportTerminalSnapshot[] = []
  let generation = 0
  let current: number | undefined
  let accepting = true
  let transportSnapshotsEvicted: number | 'unknown' = 0
  let transportReplacementRefusals: number | 'unknown' = 0

  function refresh(): void {
    for (const entry of live.values()) {
      if (
        entry.role !== 'retired' ||
        entry.retirement !== 'retired' ||
        entry.closed !== 'confirmed'
      )
        continue
      const inspect = ownInspection(entry.service)
      const diagnostics = ownDeliveryHealth(entry.service)
      if (
        !inspect ||
        !diagnostics ||
        inspect.registrations !== 0 ||
        inspect.retiring !== 0 ||
        inspect.references !== 0 ||
        inspect.executions !== 0 ||
        diagnostics.pending !== 0
      )
        continue
      let closedAt: string
      try {
        const date = wallClock()
        if (!Number.isFinite(date.getTime())) continue
        closedAt = date.toISOString()
      } catch {
        continue
      }
      terminal.push(Object.freeze({ generation: entry.generation, closedAt, inspect, diagnostics }))
      live.delete(entry.generation)
    }
  }

  function reserveReplacement(): ReturnType<DemoTransportRetention['reserveReplacement']> {
    refresh()
    if (!accepting || generation === Number.MAX_SAFE_INTEGER)
      return { unavailable: 'transport_retention_full' }
    // Evicting history cannot create room when live owners already fill the limit.
    while (
      live.size + reservations.size < limit &&
      live.size + reservations.size + terminal.length >= limit &&
      terminal.length > 0
    ) {
      terminal.shift()
      transportSnapshotsEvicted = bump(transportSnapshotsEvicted)
    }
    if (live.size + reservations.size + terminal.length >= limit) {
      transportReplacementRefusals = bump(transportReplacementRefusals)
      return { unavailable: 'transport_retention_full' }
    }
    generation++
    const item: Reservation = { generation, state: 'reserved' }
    reservations.add(item)
    return {
      reservation: Object.freeze({
        generation: item.generation,
        commit(service: ModelTransportService): number {
          return attach(item, service, 'current')
        },
        adoptFailedConstruction(service: ModelTransportService): number {
          return attach(item, service, 'retired')
        },
        abortNoResources(): void {
          if (item.state === 'settled') throw new Error('transport reservation already settled')
          item.state = 'settled'
          reservations.delete(item)
        },
        abortUnknown(): void {
          if (item.state !== 'reserved') throw new Error('transport reservation already settled')
          item.state = 'unknown'
        },
      }),
    }
  }

  function attach(
    item: Reservation,
    service: ModelTransportService,
    role: 'current' | 'retired',
  ): number {
    if ((item.state !== 'reserved' && item.state !== 'unknown') || !reservations.has(item))
      throw new Error('transport reservation already settled')
    if (
      !service ||
      typeof service.inspect !== 'function' ||
      typeof service.diagnostics !== 'function' ||
      typeof service.close !== 'function' ||
      !(service.closed instanceof Promise)
    )
      throw new TypeError('actual transport service required')
    item.state = 'settled'
    reservations.delete(item)
    if (role === 'current' && current !== undefined) {
      const prior = live.get(current)
      if (prior) prior.role = 'retired'
    }
    const entry: Instance = {
      generation: item.generation,
      service,
      role,
      retirement: 'not_started',
      closed: 'pending',
    }
    if (role === 'current') current = item.generation
    live.set(item.generation, entry)
    void service.closed.then(
      () => {
        entry.closed = 'confirmed'
      },
      () => {
        entry.closed = 'failed'
      },
    )
    return item.generation
  }

  function markRetired(id: number): void {
    const entry = live.get(id)
    if (!entry) throw new Error('transport generation unavailable')
    entry.role = 'retired'
    if (current === id) current = undefined
    refresh()
  }

  function closeRetired(
    id: number,
    policy: RetirementPolicy,
  ): Promise<RetirementResult | { readonly failed: true }> {
    const entry = live.get(id)
    if (!entry || entry.role !== 'retired')
      throw new Error('transport generation is not retired from business use')
    if (entry.retirementTask && entry.retirement === 'pending') return entry.retirementTask
    if (entry.retirementTask && entry.retirement === 'retired') return entry.retirementTask
    entry.retirement = 'pending'
    const task = Promise.resolve()
      .then(() => entry.service.close(policy))
      .then(
        result => {
          entry.retirement =
            'retired' in result
              ? 'retired'
              : 'remaining_active' in result
                ? 'remaining_active'
                : 'cleanup_failed' in result
                  ? 'cleanup_failed'
                  : 'rejected'
          refresh()
          return result
        },
        () => {
          entry.retirement = 'failed'
          return { failed: true } as const
        },
      )
    entry.retirementTask = task
    return task
  }

  function health(): DemoTransportHealth {
    refresh()
    return Object.freeze({
      transportLiveInstances: live.size,
      transportTerminalSnapshots: terminal.length,
      transportReservedInstances: reservations.size,
      transportRetentionLimit: limit,
      transportSnapshotsEvicted,
      transportReplacementRefusals,
      unknownReservations: [...reservations].filter(item => item.state === 'unknown').length,
      accepting,
      live: Object.freeze(
        [...live.values()].map(entry => {
          const inspect = ownInspection(entry.service)
          const diagnostics = ownDeliveryHealth(entry.service)
          return Object.freeze({
            generation: entry.generation,
            role: entry.role,
            retirement: entry.retirement,
            closed: entry.closed,
            ...(inspect ? { inspect } : {}),
            ...(diagnostics ? { diagnostics } : {}),
          })
        }),
      ),
      terminal: Object.freeze([...terminal]),
    })
  }

  return Object.freeze({
    reserveReplacement,
    markRetired,
    closeRetired,
    stopAdmission() {
      accepting = false
    },
    health,
  })
}

function scopeHandle(scope: DiagnosticScope, collector: DiagnosticCollector): DemoDiagnosticScope {
  return Object.freeze({
    scope,
    collector: Object.freeze({
      record: collector.record,
      emitter: collector.emitter,
      health: collector.health,
      metrics: collector.metrics,
    }),
    query: collector.query,
    exportPage: collector.exportPage,
    health: collector.health,
  })
}

export interface DemoDiagnosticAssembly {
  readonly local: DemoDiagnosticScope
  readonly tenant: DemoDiagnosticScope
  readonly transports: DemoTransportRetention
  readonly health: () => {
    readonly local: DiagnosticHealth
    readonly tenant: DiagnosticHealth
    readonly transports: DemoTransportHealth
  }
  /** First close the real business owner. Only then retire transports and diagnostic writers. */
  readonly closeAfterBusiness: (
    businessClose: () => Promise<{ readonly complete: boolean }>,
  ) => Promise<{
    readonly complete: boolean
    readonly businessComplete: boolean
    readonly local?: DiagnosticCloseResult
    readonly tenant?: DiagnosticCloseResult
    readonly transports: DemoTransportHealth
  }>
}

async function openScope(
  location: JournalLocation,
  scope: DiagnosticScope,
  limits: CollectorLimits,
  fs: DiagnosticJournalConfig['fs'],
): Promise<DiagnosticCollector> {
  const store = await createDiagnosticJournal({
    rootDir: location.rootDir,
    collectorId: location.collectorId,
    scope,
    maxRecordBytes: limits.maxRecordBytes,
    segmentMaxBytes: limits.segmentMaxBytes,
    retainedMaxBytes: limits.retainedMaxBytes,
    retainedMaxSegments: limits.retainedMaxSegments,
    retentionMs: limits.retentionMs,
    queryMaxRecords: limits.queryMaxRecords,
    queryMaxBytes: limits.queryMaxBytes,
    queryScanMaxBytes: limits.queryScanMaxBytes,
    queryConcurrency: limits.queryConcurrency,
    queryMaxDurationMs: limits.queryMaxDurationMs,
    exportMaxRecords: limits.exportMaxRecords,
    exportMaxBytes: limits.exportMaxBytes,
    wallClock: limits.wallClock,
    monotonicClock: limits.monotonicClock,
    schedule: limits.schedule,
    ...(fs === undefined ? {} : { fs }),
  })
  const config: DiagnosticCollectorConfig = {
    ...limits,
    collectorId: location.collectorId,
    scope,
    store,
  }
  try {
    return createDiagnosticCollector(config)
  } catch (error) {
    let result: DiagnosticCloseResult | undefined
    try {
      result = await store.close()
    } catch {
      // A failed close retains its store owner for a later explicit retry.
    }
    if (result === undefined || !('complete' in result))
      throw new DemoDiagnosticStartupFailure([() => store.close()])
    throw error
  }
}

/** A failed startup still gives its caller the owner needed to retry incomplete cleanup. */
export class DemoDiagnosticStartupFailure extends Error {
  constructor(private readonly cleanupOwners: readonly (() => Promise<DiagnosticCloseResult>)[]) {
    super('diagnostic assembly startup cleanup incomplete')
  }

  static combine(
    prior: unknown,
    remaining: () => Promise<DiagnosticCloseResult>,
  ): DemoDiagnosticStartupFailure {
    return new DemoDiagnosticStartupFailure([
      ...(prior instanceof DemoDiagnosticStartupFailure ? prior.cleanupOwners : []),
      remaining,
    ])
  }

  remainingOwners(): number {
    return this.cleanupOwners.length
  }

  async retryCleanup(): Promise<{
    readonly complete: boolean
    readonly results: readonly (DiagnosticCloseResult | { readonly failed: true })[]
  }> {
    const attempts = await Promise.allSettled(this.cleanupOwners.map(close => close()))
    const results = attempts.map(result =>
      result.status === 'fulfilled' ? result.value : ({ failed: true } as const),
    )
    return {
      complete: results.every(result => 'complete' in result && result.complete),
      results,
    }
  }
}

function waitBounded<T>(
  task: Promise<T>,
  durationMs: number,
  schedule: CollectorLimits['schedule'],
): Promise<
  { readonly value: T } | { readonly timedOut: true } | { readonly failed: 'task' | 'schedule' }
> {
  return new Promise(resolve => {
    let settled = false
    let timeout: ReturnType<typeof schedule> | undefined
    void task.then(
      value => {
        if (settled) return
        settled = true
        timeout?.cancel()
        resolve({ value })
      },
      () => {
        if (settled) return
        settled = true
        timeout?.cancel()
        resolve({ failed: 'task' })
      },
    )
    try {
      timeout = schedule(durationMs, () => {
        if (settled) return
        settled = true
        resolve({ timedOut: true })
      })
    } catch {
      settled = true
      resolve({ failed: 'schedule' })
    }
  })
}

export async function openDemoDiagnosticAssembly(
  config: DemoDiagnosticConfig,
): Promise<DemoDiagnosticAssembly> {
  if (resolve(config.local.rootDir) === resolve(config.tenant.rootDir))
    throw new TypeError('local and tenant diagnostic roots must be distinct')
  if (config.local.collectorId === config.tenant.collectorId)
    throw new TypeError('local and tenant collector identities must be distinct')
  const transports = createDemoTransportRetention(
    config.transportRetainedInstancesMax,
    config.collector.wallClock,
  )
  const localScope: DiagnosticScope = Object.freeze({ kind: 'local' })
  const tenantScope: DiagnosticScope = Object.freeze({
    kind: 'tenant',
    tenant: config.tenant.tenant,
  })
  const localCollector = await openScope(
    config.local,
    localScope,
    config.collector,
    config.journalFileSystem,
  )
  let tenantCollector: DiagnosticCollector
  try {
    tenantCollector = await openScope(
      config.tenant,
      tenantScope,
      config.collector,
      config.journalFileSystem,
    )
  } catch (error) {
    let cleaned: DiagnosticCloseResult | undefined
    try {
      cleaned = await localCollector.close()
    } catch {
      // Keep both store owners when the tenant and local closes fail independently.
    }
    if (cleaned === undefined || !('complete' in cleaned))
      throw DemoDiagnosticStartupFailure.combine(error, () => localCollector.close())
    throw error
  }
  const local = scopeHandle(localScope, localCollector)
  const tenant = scopeHandle(tenantScope, tenantCollector)
  let closeTask: ReturnType<DemoDiagnosticAssembly['closeAfterBusiness']> | undefined
  let businessTask: Promise<{ readonly complete: boolean }> | undefined

  async function closeAfterBusiness(
    businessClose: () => Promise<{ readonly complete: boolean }>,
  ): ReturnType<DemoDiagnosticAssembly['closeAfterBusiness']> {
    if (closeTask) return closeTask
    const task = (async () => {
      transports.stopAdmission()
      businessTask ??= Promise.resolve().then(businessClose)
      const business = await waitBounded(
        businessTask,
        config.collector.closeWaitMs,
        config.collector.schedule,
      )
      const businessComplete = 'value' in business && business.value.complete
      if (
        ('failed' in business && business.failed === 'task') ||
        ('value' in business && !business.value.complete)
      )
        businessTask = undefined
      if (!businessComplete)
        return { complete: false, businessComplete, transports: transports.health() }
      const prior = transports.health()
      for (const entry of prior.live)
        if (entry.role === 'current') transports.markRetired(entry.generation)
      // The real service close operation is owned here after the business owner completed.
      let closeTasks: Promise<RetirementResult | { readonly failed: true }>[]
      try {
        closeTasks = transports
          .health()
          .live.map(entry => transports.closeRetired(entry.generation, config.transportRetirement))
      } catch {
        return { complete: false, businessComplete, transports: transports.health() }
      }
      const retired = await waitBounded(
        Promise.all(closeTasks),
        config.collector.closeWaitMs,
        config.collector.schedule,
      )
      if (!('value' in retired))
        return { complete: false, businessComplete, transports: transports.health() }
      const transportHealth = transports.health()
      if (
        transportHealth.transportLiveInstances !== 0 ||
        transportHealth.transportReservedInstances !== 0
      )
        return { complete: false, businessComplete, transports: transportHealth }
      const [localClosed, tenantClosed] = await Promise.all([
        localCollector.close(),
        tenantCollector.close(),
      ])
      return {
        complete: 'complete' in localClosed && 'complete' in tenantClosed,
        businessComplete,
        local: localClosed,
        tenant: tenantClosed,
        transports: transports.health(),
      }
    })()
    closeTask = task
    void task.then(
      () => {
        closeTask = undefined
      },
      () => {
        closeTask = undefined
      },
    )
    return task
  }

  return Object.freeze({
    local,
    tenant,
    transports,
    health: () =>
      Object.freeze({
        local: localCollector.health(),
        tenant: tenantCollector.health(),
        transports: transports.health(),
      }),
    closeAfterBusiness,
  })
}
