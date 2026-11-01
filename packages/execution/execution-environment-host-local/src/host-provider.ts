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
  ManagedResource,
  OriginalAcquisition,
  ProviderAcquireInput,
  ProviderAcquisition,
  ProviderAcquisitionStatus,
  ProviderFacts,
  Retirement,
} from '@omne-harness/execution-environment-contract'
import { commandSettings, createHostCommands, type HostCommandOptions } from './host-command.ts'
import {
  domainInternals,
  fingerprintOf,
  type AdmitResult,
  type DomainInternals,
  type DomainRecord,
  type DrainResult,
  type HostFilesDomain,
} from './host-domain.ts'
import type { HostFileDiagnostic, HostFilesLimits } from './host-files.ts'
import { probeHostFilesPrerequisite } from './host-paths.ts'
import {
  createPrerequisiteProbe,
  resolveSupervisor,
  type HostCommandPrerequisite,
} from './host-probe.ts'
import {
  forceStopScope,
  listScopes,
  readBootId,
  readScopeReference,
  type Supervisor,
} from './host-scope.ts'

/** Initial value of `drainBoundMs` when the configuration does not give one. */
const defaultDrainBoundMs = 10_000

/** One structured diagnostic of the host provider. */
export type HostFilesDiagnostic =
  | Readonly<{
      /**
       * `drainBoundExceeded`: operations were still running when the bound passed.
       * `closePending`: no operation runs, but a descriptor whose close failed is still open.
       */
      kind: 'drainBoundExceeded' | 'closePending'
      provider: string
      generation: string
      /** File operations and command starts still running when the bound passed. */
      inFlight: number
      /** Descriptors still open after a failed close. */
      openDescriptors: number
      boundMs: number
      /** The acquisition of a pending release or settlement; absent for a retirement. */
      acquisition?: string
    }>
  | Readonly<{
      /** The supervisor did not confirm the stop of these processes; they stay to be stopped. */
      kind: 'stopUnconfirmed'
      provider: string
      generation: string
      resources: readonly ManagedResource[]
      acquisition?: string
    }>
  | Readonly<{
      /** A command start was refused because these platform prerequisites are missing. */
      kind: 'commandUnavailable'
      provider: string
      generation: string
      missing: readonly HostCommandPrerequisite[]
      acquisition: string
    }>
  | Readonly<{
      /**
       * A file batch was published, but the staged file it was published from could not be
       * removed. It stays beside the target. The fact belongs to the engine, not to one
       * acquisition, so it names no acquisition.
       */
      kind: 'temporaryFileRemains'
      provider: string
      generation: string
      /** The batch id. */
      batch: string
      /** The target that was published. */
      path: string
      /** The name of the staged file that stays. */
      temporary: string
      /** The error code of the failed removal. */
      code?: string
    }>

export type HostFilesProviderOptions = Readonly<{
  /** The responsibility domain this generation joins. Every generation of one host shares it. */
  domain: HostFilesDomain
  /** Upper bound in milliseconds that a release, a settlement or `retire()` waits for in-flight file operations. */
  drainBoundMs?: number
  /**
   * Receives a diagnostic when a drain stays pending, when a command start lacks a prerequisite,
   * or when a published batch leaves its staged file.
   */
  diagnose?: (diagnostic: HostFilesDiagnostic) => void
  /** Bounds of the `command` facility. */
  command?: HostCommandOptions
  /**
   * The host files root, an absolute path. Every path of every `files` request of this provider
   * must lie below it. Without it, the provider only checks the named object.
   */
  filesRoot?: string
  /**
   * An absolute path where the manifests of file batches are kept, and where the probe of the files
   * prerequisite makes its temporary directory. Without it, batches answer `unavailable`.
   */
  stateDirectory?: string
  /** Bounds of listing and searching; each given value must be a positive safe integer. */
  limits?: Partial<HostFilesLimits>
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

type Prerequisite = ProviderFacts['prerequisites']

/**
 * Reads prerequisite P2 for `describe`. A settled answer stays for the generation; an unknown one
 * is read again at the next call, as the engine does for its requests.
 */
function createFilesPrerequisiteReader(
  stateDirectory: string | undefined,
): () => Promise<Prerequisite> {
  let settled: Prerequisite | undefined
  return async () => {
    if (settled !== undefined) return settled
    const reading = await probeHostFilesPrerequisite(stateDirectory)
    if (reading !== 'unknown') settled = reading
    return reading
  }
}

/** One prerequisite that is missing makes the whole unsatisfied; otherwise one unknown makes it unknown. */
function merged(readings: readonly Prerequisite[]): Prerequisite {
  if (readings.includes('unsatisfied')) return 'unsatisfied'
  return readings.includes('unknown') ? 'unknown' : 'satisfied'
}

function temporaryFileRemains(
  provider: string,
  generation: string,
  fact: HostFileDiagnostic,
): HostFilesDiagnostic {
  return {
    kind: 'temporaryFileRemains',
    provider,
    generation,
    batch: fact.batch,
    path: fact.path,
    temporary: fact.temporary,
    ...(fact.code === undefined ? {} : { code: fact.code }),
  }
}

/**
 * The host provider of the `files` and `command` facilities. It serves the `host_machine` layer
 * only, confirms no isolation claim and gives no continuity guarantee. Each acquisition gets its own
 * facades in the shared domain: its admission, its in-flight operations, the descriptors of its
 * failed closes and the processes it started. A release seals the facades, waits up to
 * `drainBoundMs`, retries the failed closes, force-stops the processes, and returns the quota slot
 * only when nothing is left. Each process runs in its own systemd user scope; the scopes are the
 * managed resources that resource recovery lists and stops.
 */
export function createHostFilesProvider(options: HostFilesProviderOptions): EnvironmentProvider {
  const domain = options.domain
  const internals: DomainInternals | undefined = domain ? domainInternals(domain) : undefined
  if (internals === undefined)
    throw new TypeError('createHostFilesProvider needs a domain from createHostFilesDomain')
  const drainBoundMs = options.drainBoundMs ?? defaultDrainBoundMs
  if (!isDrainBound(drainBoundMs))
    throw new RangeError('drainBoundMs must be a finite number of milliseconds, zero or more')
  const settings = commandSettings(options.command)
  const name = 'host-files'
  const generation = randomUUID()
  const report = (diagnostic: HostFilesDiagnostic) => {
    try {
      options.diagnose?.(Object.freeze(diagnostic))
    } catch {
      /* A diagnostic sink never changes the result. */
    }
  }
  // The files engine for this provider's configuration. Invalid settings throw here, before the
  // generation is registered and before any probe starts.
  const files = internals.joinEngine(
    { root: options.filesRoot, stateDirectory: options.stateDirectory, limits: options.limits },
    fact => report(temporaryFileRemains(name, generation, fact)),
  )
  internals.registerGeneration(generation)
  const facilities: readonly FacilityKey[] = Object.freeze(['files', 'command'])
  let retired = false
  // The probe of the command prerequisites starts now; `describe` reports `unknown` until it answers.
  const probe = createPrerequisiteProbe({
    retryMs: settings.probeRetryMs,
    boundMs: settings.stopBoundMs,
  })
  const filesPrerequisite = createFilesPrerequisiteReader(options.stateDirectory)
  const platform = Object.freeze({ os: process.platform, release: release() })

  const bindingKinds: readonly BindingKind[] = Object.freeze(['host_machine'])
  const continuity: EnvironmentContinuity = Object.freeze({ kind: 'not_guaranteed' })
  const evidence: Extract<ProviderAcquisitionStatus, { kind: 'acquired' }>['evidence'] = {
    kind: 'object',
    entries: [
      { key: 'provider', value: { kind: 'string', value: name } },
      { key: 'generation', value: { kind: 'string', value: generation } },
      { key: 'version', value: { kind: 'string', value: version } },
      // The contract's facts cannot say that a files root limits this provider; the evidence can.
      ...(options.filesRoot === undefined
        ? []
        : [{ key: 'filesRoot', value: { kind: 'string', value: 'configured' } } as const]),
    ],
  }

  /** Diagnoses pending drains: work or descriptors left, and processes whose stop is unconfirmed. */
  const diagnose = (
    records: readonly DomainRecord[],
    resources: readonly ManagedResource[],
    acquisition?: string,
  ) => {
    const inFlight = records.reduce(
      (sum, record) => sum + record.facade.inFlight() + record.commands.inFlight(),
      0,
    )
    const openDescriptors = records.reduce(
      (sum, record) => sum + record.engine.openCount(record.owner),
      0,
    )
    const named = acquisition === undefined ? {} : { acquisition }
    if (inFlight > 0 || openDescriptors > 0 || resources.length === 0)
      report({
        kind: inFlight > 0 ? 'drainBoundExceeded' : 'closePending',
        provider: name,
        generation,
        inFlight,
        openDescriptors,
        boundMs: drainBoundMs,
        ...named,
      })
    if (resources.length > 0)
      report({ kind: 'stopUnconfirmed', provider: name, generation, resources, ...named })
  }

  const drain = async (record: DomainRecord): Promise<DrainResult> => {
    const result = await internals.drain(record, drainBoundMs)
    if (result.kind === 'pending') diagnose([record], result.resources, record.original.acquisition)
    return result
  }

  /** The supervisor: the probe's, or resolved now for recovery when the probe is not satisfied. */
  const supervisor = async (): Promise<Supervisor | undefined> => {
    const reading = await probe.ready()
    return reading.kind === 'satisfied' ? reading.tools : resolveSupervisor(settings.stopBoundMs)
  }

  /** The lease of one acquisition: its facade, its invalidation and its release. */
  const leaseOf = (record: DomainRecord): EnvironmentLease => {
    let settle: (value: LeaseInvalidation) => void = () => undefined
    const invalidated = new Promise<LeaseInvalidation>(resolve => {
      settle = resolve
    })
    const available: Partial<EnvironmentFacilities> = {
      files: record.facade.facility,
      command: record.commands.facility,
    }
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
        const result = await drain(record)
        return result.kind === 'settled' ? { kind: 'released' } : result
      },
    }
    record.lease = lease
    return lease
  }

  /** The provider's answer to the domain's admission of one acquisition. */
  const answerAdmission = (
    admitted: AdmitResult,
    acquisition: ProviderAcquireInput['acquisition'],
  ): ProviderAcquisition => {
    switch (admitted.kind) {
      case 'admitted':
        return { kind: 'acquired', lease: leaseOf(admitted.record), evidence }
      case 'existing': {
        // A repeat reads the original record; it never makes a second facade.
        const record = admitted.record
        return record.state === 'open' && record.lease
          ? { kind: 'acquired', lease: record.lease, evidence }
          : { kind: 'unknown', acquisition }
      }
      case 'conflict':
        return { kind: 'rejected', reason: 'acquisitionConflict' }
      case 'quotaExceeded':
      case 'globalCapacityExceeded':
        return { kind: 'rejected', reason: admitted.kind }
      case 'unknown':
        return { kind: 'unknown', acquisition }
      default: {
        const exhaustive: never = admitted
        return exhaustive
      }
    }
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
    async describe(): Promise<ProviderFacts> {
      return Object.freeze({
        provider: name,
        generation,
        version,
        platform,
        facilities,
        isolation: [],
        prerequisites: merged([probe.facts(), await filesPrerequisite()]),
      })
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
      const admitted = internals.admit(
        original,
        fingerprintOf(original),
        generation,
        files.engine,
        () =>
          createHostCommands({
            ledger: input.ledger,
            provider: name,
            scope: input.scope,
            settings,
            prerequisites: probe,
            unavailable: missing =>
              report({
                kind: 'commandUnavailable',
                provider: name,
                generation,
                missing,
                acquisition: input.acquisition,
              }),
          }),
      )
      return answerAdmission(admitted, input.acquisition)
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
          return { kind: 'pending', phase: 'releasing', resources: record.commands.unconfirmed() }
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
      const result = await drain(record)
      return result.kind === 'settled' ? { kind: 'settled' } : result
    },
    // Only the command scopes are managed resources. A host that is not Linux never ran one.
    async listRecoveryResources(scope) {
      if (process.platform !== 'linux') return { kind: 'listed', resources: [] }
      const systemctl = (await supervisor())?.systemctl
      if (systemctl === undefined) return { kind: 'unavailable' }
      return listScopes({ systemctl, scope, provider: name, boundMs: settings.stopBoundMs })
    },
    async recover(resource) {
      const coordinate = readScopeReference(resource.reference)
      if (resource.provider !== name || coordinate === undefined)
        return { status: 'unsupported', evidence: null }
      const unit = { key: 'unit', value: { kind: 'string', value: coordinate.unit } } as const
      const bootId = await readBootId()
      if (bootId !== undefined && bootId !== coordinate.bootId)
        return {
          status: 'confirmedStopped',
          evidence: {
            kind: 'object',
            entries: [unit, { key: 'bootId', value: { kind: 'string', value: bootId } }],
          },
        }
      const tools = await supervisor()
      if (tools === undefined) return { status: 'pending', evidence: null }
      const reading = await forceStopScope({ tools, coordinate, boundMs: settings.stopBoundMs })
      const show = reading.show
      const states =
        show === undefined
          ? []
          : [
              { key: 'LoadState', value: { kind: 'string', value: show.loadState } } as const,
              { key: 'ActiveState', value: { kind: 'string', value: show.activeState } } as const,
            ]
      return {
        status: reading.status === 'confirmed' ? 'confirmedStopped' : 'pending',
        evidence: { kind: 'object', entries: [unit, ...states] },
      }
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
      // Draining force-stops what this generation still runs: those outcomes end as effectUnknown.
      const results = await Promise.all(own.map(record => internals.drain(record, drainBoundMs)))
      if (results.every(result => result.kind === 'settled')) {
        // Nothing of this generation is left to report on; the engine stays with the domain.
        files.leave()
        return { kind: 'drained' }
      }
      const resources = results.flatMap(result =>
        result.kind === 'pending' ? result.resources : [],
      )
      diagnose(
        own.filter((_, index) => results[index]?.kind === 'pending'),
        resources,
      )
      return { kind: 'pending', resources }
    },
  }
  return Object.freeze(provider)
}
