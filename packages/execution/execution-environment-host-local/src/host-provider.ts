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
import { commandSettings, type HostCommandOptions } from './host-command.ts'
import { terminalSettings, type HostTerminalOptions } from './host-terminal.ts'
import { createHostPlatform, type CommandPrerequisite } from './host-platform.ts'
import { readWindowsJobReference, stopWindowsResource } from './windows-execution/index.ts'
import { retainedLegShell } from './host-retained-terminals.ts'
import {
  createRetainedProcessIndex,
  type RetainedMarkerFact,
  type RetainedProcessIndex,
} from './host-retained-processes.ts'
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
import { probeWindowsFilesPrerequisite } from './windows-files/facility.ts'
import { probeMacosFilesPrerequisite } from './macos-files/prerequisite.ts'
import { type HostTerminalPrerequisite } from './host-probe.ts'
import { listMacosResources, recoverMacosResource } from './macos-execution/recovery.ts'
import {
  forceStopScope,
  cleanupTerminalScope,
  listScopes,
  readBootId,
  readScopeMembers,
  readScopeReference,
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
      kind: 'commandUnavailable' | 'terminalUnavailable'
      provider: string
      generation: string
      missing: readonly (CommandPrerequisite | HostTerminalPrerequisite)[]
      acquisition: string
    }>
  | Readonly<{
      /**
       * The marker of a retained process is out of step with its unit: it could not be written
       * after the handover took effect, could not be removed after the confirmed stop, or was
       * discarded at load because it was unreadable, from another boot or named a gone unit.
       */
      kind: 'retainedMarker'
      provider: string
      generation: string
      key: string
      unit: string
      issue: RetainedMarkerFact['issue']
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
  /** Bounds of the persistent Linux terminal facility. */
  terminal?: HostTerminalOptions
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
    const reading = await (
      process.platform === 'win32'
        ? probeWindowsFilesPrerequisite
        : process.platform === 'darwin'
          ? probeMacosFilesPrerequisite
          : probeHostFilesPrerequisite
    )(stateDirectory)
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
  const terminal = terminalSettings(options.terminal)
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
  const facilities: readonly FacilityKey[] = Object.freeze(['files', 'command', 'terminal'])
  let retired = false
  const execution = createHostPlatform({
    settings,
    terminal,
    windowsCapacity: internals.windowsCapacity,
    stateDirectory: options.stateDirectory,
  })
  const filesPrerequisite = createFilesPrerequisiteReader(options.stateDirectory)
  const platform = Object.freeze({ os: process.platform, release: release() })
  const stateDirectory = options.stateDirectory
  // The retained-process index lives with the state directory: without one, nothing is retained.
  const retained: RetainedProcessIndex | undefined =
    process.platform === 'linux' && stateDirectory !== undefined
      ? internals.retainedProcesses(stateDirectory, () =>
          createRetainedProcessIndex({
            stateDirectory,
            provider: name,
            capacityPerScope: settings.retainedPerScope,
            pollMs: settings.retainedPollMs,
            async supervision() {
              const tools = await execution.supervisor()
              if (tools === undefined) return undefined
              return {
                bootId: readBootId,
                members: ({ unit, directory }) =>
                  readScopeMembers({ tools, unit, directory, boundMs: settings.stopBoundMs }),
                stop: coordinate =>
                  forceStopScope({ tools, coordinate, boundMs: settings.stopBoundMs }),
              }
            },
            diagnose: fact =>
              report({ kind: 'retainedMarker', provider: name, generation, ...fact }),
          }),
        )
      : undefined
  retained?.join(generation)

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
      (sum, record) =>
        sum + record.facade.inFlight() + record.commands.inFlight() + record.terminals.inFlight(),
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

  /** The lease of one acquisition: its facade, its invalidation and its release. */
  const leaseOf = (record: DomainRecord): EnvironmentLease => {
    let settle: (value: LeaseInvalidation) => void = () => undefined
    const invalidated = new Promise<LeaseInvalidation>(resolve => {
      settle = resolve
    })
    const available: Partial<EnvironmentFacilities> = {
      files: record.facade.facility,
      command: record.commands.facility,
      terminal: record.terminals.facility,
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
        prerequisites: merged([...(await execution.prerequisites()), await filesPrerequisite()]),
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
        ...(input.retention === undefined ? {} : { retentionScope: input.retention.scope }),
        placement: input.placement,
      }
      const admitted = internals.admit(
        original,
        fingerprintOf(original),
        generation,
        files.engine,
        () =>
          execution.commands({
            ledger: input.ledger,
            provider: name,
            scope: input.scope,
            tenant: input.tenant,
            settings,
            retention: input.retention,
            retained,
            unavailable: missing =>
              report({
                kind: 'commandUnavailable',
                provider: name,
                generation,
                missing,
                acquisition: input.acquisition,
              }),
          }),
        () => {
          const terminalInput = {
            ledger: input.ledger,
            provider: name,
            scope: input.scope,
            settings: terminal,
            unavailable: (missing: readonly (CommandPrerequisite | HostTerminalPrerequisite)[]) =>
              report({
                kind: 'terminalUnavailable',
                provider: name,
                generation,
                missing,
                acquisition: input.acquisition,
              }),
          }
          return internals.retainedTerminals.facade({
            acquisition: input,
            instance: domain.instance,
            generation,
            capacity: terminal.retainedCapacity,
            ...execution.terminals(terminalInput),
          })
        },
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
          return {
            kind: 'pending',
            phase: 'releasing',
            resources: [...record.commands.unconfirmed(), ...record.terminals.unconfirmed()],
          }
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
        if (
          record.state !== 'settled' &&
          (record.original.scope.ref === scope.ref ||
            record.original.retentionScope?.ref === scope.ref)
        )
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
    // Windows has no complete cold owner index; partial live records cannot prove recovery complete.
    async listRecoveryResources(scope) {
      if (process.platform === 'win32') return { kind: 'unavailable' }
      const retainedShells = internals.retainedTerminals.resources(scope)
      if (execution.macos !== undefined) {
        // The cold index lists every domain whose marker exists; an unread marker makes no list.
        const resources = await listMacosResources(execution.macos, scope, () =>
          internals.retainedTerminals.resources(scope),
        )
        return resources === 'unavailable' ? { kind: 'unavailable' } : { kind: 'listed', resources }
      }
      if (process.platform !== 'linux') return { kind: 'listed', resources: retainedShells }
      const systemctl = (await execution.supervisor())?.systemctl
      if (systemctl === undefined) return { kind: 'unavailable' }
      // The retained-process markers are part of the index; unread markers make no complete listing.
      if (retained !== undefined && !(await retained.ready())) return { kind: 'unavailable' }
      const listed = await listScopes({
        systemctl,
        scope,
        provider: name,
        boundMs: settings.stopBoundMs,
      })
      if (listed.kind !== 'listed') return listed
      const resources = new Map(listed.resources.map(resource => [resource.key, resource]))
      for (const resource of retainedShells) resources.set(resource.key, resource)
      // A reservation may arrive while the supervisor listing is in flight.
      for (const resource of internals.retainedTerminals.resources(scope))
        resources.set(resource.key, resource)
      for (const resource of retained?.resources(scope) ?? []) resources.set(resource.key, resource)
      return { kind: 'listed', resources: [...resources.values()] }
    },
    async recover(resource) {
      const retainedShell = await internals.retainedTerminals.recover(resource)
      if (retainedShell !== undefined)
        return {
          status: retainedShell === 'confirmed' ? 'confirmedStopped' : 'pending',
          evidence: null,
        }
      const retainedProcess = await retained?.recover(resource)
      if (retainedProcess !== undefined)
        return {
          status: retainedProcess === 'confirmed' ? 'confirmedStopped' : 'pending',
          evidence: null,
        }
      resource = retainedLegShell(resource) ?? resource
      if (execution.macos !== undefined)
        return {
          status: await recoverMacosResource(execution.macos, resource, name),
          evidence: null,
        }
      if (process.platform === 'win32') {
        if (resource.provider !== name || readWindowsJobReference(resource.reference) === undefined)
          return { status: 'unsupported', evidence: null }
        const stopped = await stopWindowsResource(resource, settings.stopBoundMs)
        return { status: stopped === 'confirmed' ? 'confirmedStopped' : 'pending', evidence: null }
      }
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
      const tools = await execution.supervisor()
      if (tools === undefined) return { status: 'pending', evidence: null }
      const reading = await forceStopScope({ tools, coordinate, boundMs: settings.stopBoundMs })
      if (reading.status === 'confirmed') await cleanupTerminalScope(coordinate.unit)
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
    async retainedProcesses(scope, tenant) {
      // Without an index (not Linux, or no state directory) nothing is retained. The index stays
      // with its state directory, so a retired generation answers its reading like a live one: the
      // retained processes belong to their scopes, not to the generation that read them.
      if (retained === undefined) return []
      return retained.list(scope, tenant)
    },
    async retire(): Promise<Retirement> {
      retired = true
      // Retained processes belong to their retention scopes: this generation only stops reading them.
      retained?.retire(generation)
      const retainedDrain = internals.retainedTerminals.retire(generation)
      const own = [...internals.records()].filter(
        record => record.generation === generation && record.state !== 'settled',
      )
      for (const record of own) {
        record.facade.seal()
        record.commands.seal()
        record.terminals.seal()
        record.invalidate({ source: 'provider', reason: 'providerRetired' })
      }
      // Draining force-stops what this generation still runs: those outcomes end as effectUnknown.
      const results = await Promise.all(own.map(record => internals.drain(record, drainBoundMs)))
      const retainedResources = await retainedDrain
      if (results.every(result => result.kind === 'settled') && retainedResources.length === 0) {
        // Nothing of this generation is left to report on; the engine stays with the domain.
        files.leave()
        return { kind: 'drained' }
      }
      const resources = [
        ...retainedResources,
        ...results.flatMap(result => (result.kind === 'pending' ? result.resources : [])),
      ]
      diagnose(
        own.filter((_, index) => results[index]?.kind === 'pending'),
        resources,
      )
      return { kind: 'pending', resources }
    },
  }
  return Object.freeze(provider)
}
