import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { release } from 'node:os'
import type {
  AcquisitionSettlement,
  BindingKind,
  EnvironmentContinuity,
  EnvironmentFacilities,
  EnvironmentLease,
  EnvironmentProvider,
  FacilityKey,
  LeaseInvalidation,
  OriginalAcquisition,
  ProviderAcquisitionStatus,
  ProviderFacts,
  Retirement,
} from '@omne-harness/execution-environment-contract'
import {
  domainInternals,
  fingerprintOf,
  type DomainInternals,
  type DomainRecord,
  type HostFilesDomain,
} from './host-domain.ts'

/** Initial value of `drainBoundMs` when the configuration does not give one. */
const defaultDrainBoundMs = 10_000

/** One structured diagnostic of the host files provider. */
export type HostFilesDiagnostic = Readonly<{
  /**
   * `drainBoundExceeded`: file operations were still running when the bound passed.
   * `closePending`: no operation runs, but a descriptor whose close failed is still open.
   */
  kind: 'drainBoundExceeded' | 'closePending'
  provider: string
  generation: string
  /** File operations still running when the bound passed. */
  inFlight: number
  /** Descriptors still open after a failed close. */
  openDescriptors: number
  boundMs: number
  /** The acquisition of a pending release or settlement; absent for a retirement. */
  acquisition?: string
}>

export type HostFilesProviderOptions = Readonly<{
  /** The responsibility domain this generation joins. Every generation of one host shares it. */
  domain: HostFilesDomain
  /** Upper bound in milliseconds that a release, a settlement or `retire()` waits for in-flight file operations. */
  drainBoundMs?: number
  /** Receives a diagnostic when a retirement passes its bound. */
  diagnose?: (diagnostic: HostFilesDiagnostic) => void
}>

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

/** The version of this package, read from its `package.json` beside `src/` and `dist/`. */
function packageVersion(): string {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  )
  if (!isRecord(parsed) || typeof parsed['version'] !== 'string')
    throw new Error('execution-environment-host-local: package.json has no version')
  return parsed['version']
}

const version = packageVersion()

function isDrainBound(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

/**
 * The host provider of the `files` facility. It serves the `host_machine` layer only, confirms no
 * isolation claim and gives no continuity guarantee. Each acquisition gets its own facade in the
 * shared domain: its admission, its in-flight operations and the descriptors of its failed closes.
 * A release seals the facade, waits up to `drainBoundMs`, retries the failed closes, and returns the
 * quota slot only when nothing is left. Its resource recovery lists no managed resource: file
 * operations leave none; descriptors and in-flight work are on the acquisition path.
 */
export function createHostFilesProvider(options: HostFilesProviderOptions): EnvironmentProvider {
  const domain = options.domain
  const internals: DomainInternals | undefined = domain ? domainInternals(domain) : undefined
  if (internals === undefined)
    throw new TypeError('createHostFilesProvider needs a domain from createHostFilesDomain')
  const drainBoundMs = options.drainBoundMs ?? defaultDrainBoundMs
  if (!isDrainBound(drainBoundMs))
    throw new RangeError('drainBoundMs must be a finite number of milliseconds, zero or more')
  const name = 'host-files'
  const generation = randomUUID()
  internals.registerGeneration(generation)
  const facilities: readonly FacilityKey[] = ['files']
  let retired = false

  // The platform prerequisites are not probed yet, so they are unknown, not satisfied.
  const facts: ProviderFacts = Object.freeze({
    provider: name,
    generation,
    version,
    platform: Object.freeze({ os: process.platform, release: release() }),
    facilities,
    isolation: [],
    prerequisites: 'unknown',
  })

  const bindingKinds: readonly BindingKind[] = Object.freeze(['host_machine'])
  const continuity: EnvironmentContinuity = Object.freeze({ kind: 'not_guaranteed' })
  const evidence: Extract<ProviderAcquisitionStatus, { kind: 'acquired' }>['evidence'] = {
    kind: 'object',
    entries: [
      { key: 'provider', value: { kind: 'string', value: name } },
      { key: 'generation', value: { kind: 'string', value: generation } },
      { key: 'version', value: { kind: 'string', value: version } },
    ],
  }

  const diagnose = (records: readonly DomainRecord[], acquisition?: string) => {
    const inFlight = records.reduce((sum, record) => sum + record.facade.inFlight(), 0)
    const openDescriptors = records.reduce(
      (sum, record) => sum + internals.engine.openCount(record.owner),
      0,
    )
    try {
      options.diagnose?.(
        Object.freeze({
          kind: inFlight > 0 ? 'drainBoundExceeded' : 'closePending',
          provider: name,
          generation,
          inFlight,
          openDescriptors,
          boundMs: drainBoundMs,
          ...(acquisition === undefined ? {} : { acquisition }),
        }),
      )
    } catch {
      /* A diagnostic sink never changes the result. */
    }
  }

  const drain = async (record: DomainRecord): Promise<'settled' | 'pending'> => {
    const result = await internals.drain(record, drainBoundMs)
    if (result === 'pending') diagnose([record], record.original.acquisition)
    return result
  }

  /** The lease of one acquisition: its facade, its invalidation and its release. */
  const leaseOf = (record: DomainRecord): EnvironmentLease => {
    let settle: (value: LeaseInvalidation) => void = () => undefined
    const invalidated = new Promise<LeaseInvalidation>(resolve => {
      settle = resolve
    })
    const available: Partial<EnvironmentFacilities> = { files: record.facade.facility }
    record.invalidate = value => {
      settle(value)
      record.invalidate = () => undefined
    }
    const lease: EnvironmentLease = {
      placement: record.original.placement,
      instance: { id: 'host', generation: record.generation },
      continuity,
      invalidated,
      facility<F extends FacilityKey>(key: F) {
        return available[key]
      },
      async release() {
        // A released lease is not invalidated later: its own release removes the notice.
        record.invalidate = () => undefined
        return (await drain(record)) === 'settled'
          ? { kind: 'released' }
          : { kind: 'pending', resources: [] }
      },
    }
    record.lease = lease
    return lease
  }

  /** The domain knows every generation it issued; a key of an unknown generation stays unknown. */
  const absent = (original: OriginalAcquisition): 'notAllocated' | 'unknown' =>
    internals.knowsGeneration(original.placement.provider.generation) ? 'notAllocated' : 'unknown'

  const lookup = (original: OriginalAcquisition): DomainRecord | 'conflict' | undefined => {
    if (original.placement.quotaDomain !== domain.quotaDomain) return undefined
    const record = internals.find(original)
    if (record === undefined) return undefined
    return record.fingerprint === fingerprintOf(original) ? record : 'conflict'
  }

  const provider: EnvironmentProvider = {
    name,
    generation,
    version,
    quotaDomain: domain.quotaDomain,
    bindingKinds,
    continuity,
    facilities,
    isolation: [],
    async describe() {
      return facts
    },
    async quota(tenant) {
      const declared = internals.quota(tenant)
      return declared === undefined ? { kind: 'unknown' } : { kind: 'declared', quota: declared }
    },
    async acquire(input) {
      if (retired) return { kind: 'rejected', reason: 'providerUnavailable' }
      if (input.placement.binding.kind !== 'host_machine')
        return { kind: 'rejected', reason: 'noMatchingEnvironment' }
      const original: OriginalAcquisition = {
        tenant: input.tenant,
        acquisition: input.acquisition,
        origin: input.origin,
        scope: input.scope,
        placement: input.placement,
      }
      const admitted = internals.admit(original, fingerprintOf(original), generation)
      switch (admitted.kind) {
        case 'admitted':
          return { kind: 'acquired', lease: leaseOf(admitted.record), evidence }
        case 'existing': {
          // A repeat reads the original record; it never makes a second facade.
          const record = admitted.record
          return record.state === 'open' && record.lease
            ? { kind: 'acquired', lease: record.lease, evidence }
            : { kind: 'unknown', acquisition: input.acquisition }
        }
        case 'conflict':
          return { kind: 'rejected', reason: 'acquisitionConflict' }
        case 'quotaExceeded':
        case 'globalCapacityExceeded':
          return { kind: 'rejected', reason: admitted.kind }
        case 'unknown':
          return { kind: 'unknown', acquisition: input.acquisition }
        default: {
          const exhaustive: never = admitted
          return exhaustive
        }
      }
    },
    async inspectAcquisition(original): Promise<ProviderAcquisitionStatus> {
      const record = lookup(original)
      if (record === undefined) return { kind: absent(original) }
      if (record === 'conflict') return { kind: 'conflict' }
      switch (record.state) {
        case 'open':
          return record.lease
            ? { kind: 'acquired', lease: record.lease, evidence }
            : { kind: 'unknown' }
        case 'releasing':
          return { kind: 'pending', phase: 'releasing', resources: [] }
        case 'settled':
          return { kind: 'settled' }
        default: {
          const exhaustive: never = record.state
          return exhaustive
        }
      }
    },
    async listAcquisitions(scope) {
      const acquisitions: OriginalAcquisition[] = []
      for (const record of internals.records())
        if (record.state !== 'settled' && record.original.scope.ref === scope.ref)
          acquisitions.push(record.original)
      return { kind: 'listed', acquisitions }
    },
    async settleAcquisition(original): Promise<AcquisitionSettlement> {
      const record = lookup(original)
      if (record === undefined) return { kind: absent(original) }
      if (record === 'conflict') return { kind: 'conflict' }
      return (await drain(record)) === 'settled'
        ? { kind: 'settled' }
        : { kind: 'pending', resources: [] }
    },
    // The files profile has no managed resource: a ready domain lists a complete empty set.
    async listRecoveryResources() {
      return { kind: 'listed', resources: [] }
    },
    async recover() {
      return { status: 'unsupported', evidence: null }
    },
    async retire(): Promise<Retirement> {
      retired = true
      const own = [...internals.records()].filter(
        record => record.generation === generation && record.state !== 'settled',
      )
      for (const record of own) {
        record.facade.seal()
        record.invalidate({ source: 'provider', reason: 'providerRetired' })
      }
      const results = await Promise.all(own.map(record => internals.drain(record, drainBoundMs)))
      if (results.every(result => result === 'settled')) return { kind: 'drained' }
      diagnose(own.filter((_, index) => results[index] === 'pending'))
      return { kind: 'pending', resources: [] }
    },
  }
  return Object.freeze(provider)
}
