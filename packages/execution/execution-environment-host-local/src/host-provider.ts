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
import { listWindowsJobs, recoverWindowsResource } from './windows-execution/recovery.ts'
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
  readScopeReference,
} from './host-scope.ts'

const defaultDrainBoundMs = 10_000

export type HostFilesDiagnostic =
  | Readonly<{
      kind: 'drainBoundExceeded' | 'closePending'
      provider: string
      generation: string
      inFlight: number
      openDescriptors: number
      boundMs: number
      acquisition?: string
    }>
  | Readonly<{
      kind: 'stopUnconfirmed'
      provider: string
      generation: string
      resources: readonly ManagedResource[]
      acquisition?: string
    }>
  | Readonly<{
      kind: 'commandUnavailable' | 'terminalUnavailable'
      provider: string
      generation: string
      missing: readonly (CommandPrerequisite | HostTerminalPrerequisite)[]
      acquisition: string
    }>
  | Readonly<{
      kind: 'retainedMarker'
      provider: string
      generation: string
      key: string
      unit: string
      issue: RetainedMarkerFact['issue']
    }>
  | Readonly<{
      kind: 'temporaryFileRemains'
      provider: string
      generation: string
      batch: string
      path: string
      temporary: string
      code?: string
    }>

export type HostFilesProviderOptions = Readonly<{
  domain: HostFilesDomain
  drainBoundMs?: number
  diagnose?: (diagnostic: HostFilesDiagnostic) => void
  command?: HostCommandOptions
  terminal?: HostTerminalOptions
  filesRoot?: string
  stateDirectory?: string
  limits?: Partial<HostFilesLimits>
}>

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

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
    } catch {}
  }
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
  const retained: RetainedProcessIndex | undefined =
    (process.platform === 'linux' || process.platform === 'win32') && stateDirectory !== undefined
      ? internals.retainedProcesses(stateDirectory, () =>
          createRetainedProcessIndex({
            stateDirectory,
            provider: name,
            capacityPerScope: settings.retainedPerScope,
            pollMs: settings.retainedPollMs,
            supervision: () => execution.retainedSupervision(),
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
      ...(options.filesRoot === undefined
        ? []
        : [{ key: 'filesRoot', value: { kind: 'string', value: 'configured' } } as const]),
    ],
  }

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
        record.invalidate = () => undefined
        const result = await drain(record)
        return result.kind === 'settled' ? { kind: 'released' } : result
      },
    }
    record.lease = lease
    return lease
  }

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
    async listRecoveryResources(scope) {
      const retainedShells = internals.retainedTerminals.resources(scope)
      const retainedReady = async () => retained === undefined || (await retained.ready())
      const listed = (...lists: (readonly ManagedResource[])[]) => ({
        kind: 'listed' as const,
        resources: [...new Map(lists.flat().map(resource => [resource.key, resource])).values()],
      })
      if (execution.windows !== undefined) {
        const jobs = await listWindowsJobs(execution.windows.jobs, scope)
        if (jobs === 'unavailable' || !(await retainedReady())) return { kind: 'unavailable' }
        return listed(
          jobs,
          internals.retainedTerminals.resources(scope),
          retained?.resources(scope) ?? [],
        )
      }
      if (execution.macos !== undefined) {
        const resources = await listMacosResources(execution.macos, scope, () =>
          internals.retainedTerminals.resources(scope),
        )
        return resources === 'unavailable' ? { kind: 'unavailable' } : { kind: 'listed', resources }
      }
      if (process.platform !== 'linux') return { kind: 'listed', resources: retainedShells }
      const systemctl = (await execution.supervisor())?.systemctl
      if (systemctl === undefined || !(await retainedReady())) return { kind: 'unavailable' }
      const scopes = await listScopes({
        systemctl,
        scope,
        provider: name,
        boundMs: settings.stopBoundMs,
      })
      if (scopes.kind !== 'listed') return scopes
      return listed(
        scopes.resources,
        retainedShells,
        internals.retainedTerminals.resources(scope),
        retained?.resources(scope) ?? [],
      )
    },
    async recover(resource) {
      const held =
        (await internals.retainedTerminals.recover(resource)) ?? (await retained?.recover(resource))
      if (held !== undefined)
        return { status: held === 'confirmed' ? 'confirmedStopped' : 'pending', evidence: null }
      resource = retainedLegShell(resource) ?? resource
      if (execution.macos !== undefined)
        return {
          status: await recoverMacosResource(execution.macos, resource, name),
          evidence: null,
        }
      if (execution.windows !== undefined && (await retained?.mayHold(resource.key)))
        return { status: 'pending', evidence: null }
      if (execution.windows !== undefined)
        return {
          status: await recoverWindowsResource(
            execution.windows.jobs,
            resource,
            name,
            settings.stopBoundMs,
          ),
          evidence: null,
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
      if (retained === undefined) return []
      return retained.list(scope, tenant)
    },
    async retire(): Promise<Retirement> {
      retired = true
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
      const results = await Promise.all(own.map(record => internals.drain(record, drainBoundMs)))
      const retainedResources = await retainedDrain
      if (results.every(result => result.kind === 'settled') && retainedResources.length === 0) {
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
