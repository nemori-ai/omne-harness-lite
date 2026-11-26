import { Context, type Plugin } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { ConfigError } from './config-schema.ts'
import { stubPlugin } from './cordis.ts'
import * as releasePlugins from './cordis.ts'
import { createHostFilesRuntime, type HostFilesRuntime } from './host-files.ts'
import { createExecutionHostBinding, hostFactoryBindings } from './rows/execution-host/index.ts'
import {
  createTelemetryBinding,
  telemetryFactoryBindings,
  type TelemetryBinding,
} from './rows/telemetry/index.ts'
import { checkModelRowConsistency } from './model/consistency.ts'
import {
  checkToolsReplyBudget,
  compileToolResultDisclosure,
  installToolResultDisclosure,
} from './model/tool-result-disclosure.ts'
import { entryObjects as releaseEntryObjects } from './entry/index.ts'
import {
  LifecycleRegistry,
  S0AssemblyLifecycleService,
  S0_ASSEMBLY_LIFECYCLE_KEY,
} from './lifecycle.ts'
import {
  createSessionWorkPrincipals,
  disposeRow,
  disposeTree,
  startTree,
  validateFactoryRows,
  type EntryObject,
  type PreflightDiagnostic,
  type RowSpec,
  type StartResult,
} from './loader.ts'
import { loadTree, type ResolvedTree } from './plugin-tree.ts'
import { STUB_EXPORT, s0Profile, serveProfile, type Profile } from './profile.ts'
import type { LoadedRow } from './readiness.ts'
import { checkSuspensionCommandBound } from './rows/tool-runtime/suspension-bound.ts'
import { inTransit, stopOf } from './readiness.ts'
import { refusedByStamp, stampState } from './state-stamp.ts'
import { disposeWithin, monotonicClock, runShutdown, stopPredecessors } from './shutdown.ts'
import { hostTime, holdRunTime } from './entry/time.ts'
import { enabledExtensionsOf } from './rows/agent-host/enabled-extensions.ts'
import { systemExtensionsOf } from './rows/system-extensions/index.ts'
import { releaseToolRequestsOf } from './entry/tool-requests.ts'
import { createAgentHostRow } from './rows/agent-host/index.ts'
import { createModelHostRow } from './rows/model-host/index.ts'
import { createModelRecordsRow } from './rows/model-records/index.ts'
import { createToolRecordsRow } from './rows/tool-runtime/index.ts'
import { refusedInstance, type Instance } from './state-instance.ts'
import { acquireStateLock, lostContactBy, type StateLock } from './state-lock.ts'
import { prepareStartupDirectory } from './startup-directory.ts'
import { createTrust, type Trust } from './trust.ts'
import type {
  EntryEnv,
  EntryTime,
  EntryObjectModule,
  Implementation,
  LifecycleHandle,
  LifecyclePhase,
  RowId,
  RowManifest,
  ServiceName,
  StopResult,
  TreeRow,
  Visibility,
} from './types.ts'

type ExecutionHostBinding = ReturnType<typeof createExecutionHostBinding>

export type S0Record = { readonly kind: string } & Readonly<Record<string, unknown>>

export type TextSink = Readonly<{ write(text: string): unknown }>

export function recordLineWriter(sink: TextSink): (record: unknown) => void {
  return record => {
    sink.write(`${JSON.stringify(record)}\n`)
  }
}

export function lineWriter(sink: TextSink): (line: string) => void {
  return line => {
    sink.write(`${line}\n`)
  }
}

function sealedAfterShutdownResult(
  write: (record: S0Record) => void,
  stderr: (line: string) => void,
): (record: S0Record) => void {
  let sealed = false
  return record => {
    if (sealed) {
      stderr(JSON.stringify(record))
      return
    }
    write(record)
    if (record.kind === 'shutdown-result') sealed = true
  }
}

export type RunS0Options = Readonly<{
  distribution: unknown
  operator?: unknown
  readinessTimeoutMs: number
  shutdownDeadlineMs: number
  write: (record: S0Record) => void
  stderr: (line: string) => void
  omitEntryObjects?: readonly ServiceName[]
  manifests?: ReadonlyMap<RowId, RowManifest>
  visibility?: Visibility
}>

export type S0Result = Readonly<{
  exitCode: 0 | 2 | 3 | 4 | 5
  barrierCalls: number
  startedRows: readonly string[]
  appliedRows: readonly string[]
}>

const NO_MANIFEST: RowManifest = { provides: [], injects: [], phase: null, sameProviderGroup: null }

const StopConfig = z.object({
  startBehavior: z.enum(['settle', 'fail']).optional(),
  stopBehavior: z.enum(['settle', 'hang']).optional(),
})

type Probes = { started: string[]; applied: string[] }

const SETTLED: StopResult = { kind: 'settled' }

class ProbedRegistry extends LifecycleRegistry {
  readonly #started: string[]

  constructor(options: ConstructorParameters<typeof LifecycleRegistry>[0], started: string[]) {
    super(options)
    this.#started = started
  }

  override add(handle: LifecycleHandle): () => void {
    const { start } = handle
    if (start === undefined) return super.add(handle)
    return super.add({
      ...handle,
      start: async () => {
        this.#started.push(handle.row)
        await Reflect.apply(start, handle, [])
      },
    })
  }
}

function stubRowPlugin(id: RowId, manifest: RowManifest, probes: Probes): Plugin.Object {
  const stub = stubPlugin({
    id,
    manifest,
    hooks: {
      observe: event => {
        if (event.kind === 'applied') probes.applied.push(id)
      },
    },
  }) as Plugin.Object
  const phase = manifest.phase
  return {
    name: id,
    inject:
      phase === null ? [...manifest.injects] : [...manifest.injects, S0_ASSEMBLY_LIFECYCLE_KEY],
    apply: async (ctx, config) => {
      await stub.apply(ctx, config)
      if (phase === null) return
      const { startBehavior, stopBehavior } = StopConfig.parse(config ?? {})
      const handle: LifecycleHandle = {
        phase,
        row: id,
        start: async () => {
          if (startBehavior === 'fail') throw new Error(`stub start failed: ${id}`)
        },
        stop: () =>
          stopBehavior === 'hang' ? new Promise<StopResult>(() => {}) : Promise.resolve(SETTLED),
      }
      ;(ctx.get(S0_ASSEMBLY_LIFECYCLE_KEY) as S0AssemblyLifecycleService).register(handle)
    },
  }
}

function declaredRowPlugin(id: RowId, wrapper: Plugin.Object, probes: Probes): Plugin.Object {
  return {
    ...wrapper,
    apply: (ctx, config) => {
      probes.applied.push(id)
      return wrapper.apply(ctx, config)
    },
  }
}

function entryNames(manifests: ReadonlyMap<RowId, RowManifest>): ServiceName[] {
  const provided = new Set([...manifests.values()].flatMap(m => m.provides))
  const wanted = [...manifests.values()].flatMap(m => m.injects)
  return [...new Set(wanted.filter(name => !provided.has(name)))]
}

const BINDINGS_NAME = 's0.sessionPrincipalBindings'
const ISSUER_NAME = 's0.principalIssuer'
const WORK_NAME = 's0.sessionWorkPrincipals'

function describeDiagnostic(d: PreflightDiagnostic): string {
  switch (d.kind) {
    case 'duplicate-row':
      return `duplicate row id "${d.row}"`
    case 'invisible-inject':
      return `row "${d.row}" injects trusted name "${d.name}", which it cannot see`
    case 'split-provider-group':
      return `provider group "${d.group}" is split over rows ${d.rows.join(', ')}`
    case 'row-binding':
      return `export "${d.plugin}" declares row "${d.declared}" but is bound to row "${d.row}"`
    case 'double-dependency':
      return `row "${d.row}" injects "${d.name}", which only the s0-double ${
        d.provider === 'entry-object' ? 'entry object' : `row "${d.provider}"`
      } provides`
    case 'via-unregistered':
      return `row "${d.row}" relies on entry object "${d.via}" to register its shutdown handle, but no such module declares registersFor "${d.row}"`
    case 'duplicate-entry-object':
      return `entry object "${d.name}" is listed more than once`
  }
}

function treeRecords(
  tree: ResolvedTree,
  visible: (row: RowId) => readonly ServiceName[],
  implementationOf: (row: RowId) => Implementation,
  describe: (row: TreeRow) => Readonly<Record<string, unknown>> = () => ({}),
): S0Record[] {
  return [
    ...tree.rows.map((row): S0Record => ({
      kind: 'tree',
      id: row.id,
      plugin: row.plugin,
      source: row.source,
      configSource: row.source,
      visible: visible(row.id),
      visibleSource: 'release-code',
      implementation: implementationOf(row.id),
      ...describe(row),
    })),
    ...tree.disabled.map((row): S0Record => ({
      kind: 'tree',
      id: row.id,
      disabled: true,
      source: row.source,
    })),
  ]
}

function finalExitCode(
  startCode: 0 | 3 | 4,
  overall: 'settled' | 'incomplete',
): S0Result['exitCode'] {
  if (startCode !== 0) return startCode
  return overall === 'settled' ? 0 : 5
}

function expectedPhases(rows: readonly RowSpec[]): Map<RowId, LifecyclePhase> {
  const expected = new Map<RowId, LifecyclePhase>()
  for (const { row, manifest } of rows) {
    if (manifest.phase !== null) expected.set(row.id, manifest.phase)
  }
  return expected
}

function trustFor(visibility: Visibility): Trust {
  return createTrust(
    [...new Set([...visibility.values()].flat())].map(name => ({ id: name, names: [name] })),
    visibility,
  )
}

export async function runS0(options: RunS0Options): Promise<S0Result> {
  const { write, stderr } = options
  const probes: Probes = { started: [], applied: [] }
  let barrierCalls = 0
  const result = (exitCode: S0Result['exitCode']): S0Result => ({
    exitCode,
    barrierCalls,
    startedRows: probes.started,
    appliedRows: probes.applied,
  })

  let tree: ResolvedTree
  try {
    tree = loadTree(options.distribution, options.operator, s0Profile.allowlist)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    stderr(`s0: ${error.code}: ${error.message}`)
    return result(2)
  }

  const manifests = options.manifests ?? s0Profile.stubManifests
  const visibility = options.visibility ?? s0Profile.visibility
  const trust = trustFor(visibility)
  for (const record of treeRecords(
    tree,
    row => trust.describe(row).names,
    () => 's0-double',
  ))
    write(record)

  const rows: RowSpec[] = tree.rows.map(row => {
    const manifest = manifests.get(row.id) ?? NO_MANIFEST
    return { row, manifest, plugin: stubRowPlugin(row.id, manifest, probes) }
  })
  const expected = expectedPhases(rows)

  const root = new Context()
  let loaded: readonly LoadedRow[] = []
  let shutdownReport: ReturnType<typeof runShutdown> | undefined
  const shutdown = () =>
    (shutdownReport ??= runShutdown(
      registry,
      expected,
      options.shutdownDeadlineMs,
      monotonicClock,
      {
        log: write,
        stopsFirst: stopPredecessors(rows),
        disposeRoot: () => disposeTree(root, loaded),
      },
    ))
  const registry = new ProbedRegistry(
    {
      expected,
      clock: monotonicClock,
      requestStop: reason => {
        stderr(`s0: stop requested: ${reason}`)
        void shutdown()
      },
    },
    probes.started,
  )

  const omitted = new Set(options.omitEntryObjects ?? [])
  if (!omitted.has(S0_ASSEMBLY_LIFECYCLE_KEY))
    await root.plugin(S0AssemblyLifecycleService, registry)
  omitted.delete(S0_ASSEMBLY_LIFECYCLE_KEY)

  const objectFor = (name: ServiceName): unknown => {
    if (name === ISSUER_NAME) return { issue: (claim: unknown) => claim }
    if (name === WORK_NAME) {
      const bindingsCtx = trust.isTrusted(BINDINGS_NAME)
        ? trust.contextForName(root, BINDINGS_NAME)
        : root
      return createSessionWorkPrincipals({ issue: claim => claim }, bindingsCtx, BINDINGS_NAME)
    }
    return Object.freeze({ standIn: name })
  }
  const entryObjects: EntryObject[] = [
    ...new Set([ISSUER_NAME, WORK_NAME, ...entryNames(s0Profile.stubManifests)]),
  ].map(name => ({ name, value: objectFor(name) }))

  const started = await startTree({
    root,
    trust,
    rows,
    entryObjects,
    omitEntryObjects: [...omitted],
    readinessTimeoutMs: options.readinessTimeoutMs,
    barrier: () => {
      barrierCalls += 1
    },
  })

  if (started.kind !== 'started') {
    if (started.kind === 'rejected')
      for (const diagnostic of started.diagnostics) stderr(`s0: ${describeDiagnostic(diagnostic)}`)
    else if (started.kind === 'entry-failed')
      stderr(`s0: entry-object ${started.name}: install failed`)
    else stderr('s0: preparation failed')
    await root.fiber.dispose()
    return result(started.exitCode)
  }

  loaded = started.rows
  const startFailure = barrierCalls > 0 ? await registry.startAll() : undefined
  for (const state of started.report.rows) write({ kind: 'row-state', ...state })
  write({
    kind: 'startup-result',
    profile: 's0',
    scope: 'loader-only',
    accepting: false,
    enabledRows: tree.rows.length,
    outcome: startFailure === undefined ? started.report.outcome : 'start-failed',
    ...(startFailure === undefined ? {} : { startFailure }),
    barrierCalls,
    startedRows: probes.started,
    appliedRows: probes.applied,
  })

  const report = await shutdown()
  write({ kind: 'shutdown-result', ...report })
  return result(
    finalExitCode(startFailure === undefined ? started.report.exitCode : 3, report.overall),
  )
}

export type RunServeOptions = Readonly<{
  distribution: unknown
  operator?: unknown
  readinessTimeoutMs: number
  shutdownDeadlineMs: number
  drainDeadlineMs?: number
  rootDisposalDeadlineMs?: number
  stateRoot: string
  stop: AbortSignal
  write: (record: S0Record) => void
  stderr: (line: string) => void
  plugins?: Readonly<Record<string, unknown>>
  entryObjects?: readonly EntryObjectModule[]
  manifests?: ReadonlyMap<RowId, RowManifest>
  visibility?: Visibility
  /** How the host row chooses its screen backend; absent: by the system this process runs on. */
  hostScreen?: Parameters<typeof createExecutionHostBinding>[1]
  /** The one time of this run; absent: the system time. The release entry gives none. */
  time?: EntryTime
  /** Which kind of instance starts: a lab one only on a state root it made, a release one never there. */
  instance?: Instance
  /** Row plugins an entry adds to the release ones; the lab adds its programs, the release none. */
  extraPlugins?: Readonly<Record<string, unknown>>
}>

export type ServeResult = Readonly<{
  exitCode: 0 | 2 | 3 | 4 | 5
  accepting: boolean
  barrierCalls: number
  startedRows: readonly string[]
  appliedRows: readonly string[]
  implementations: Readonly<Record<Implementation, number>>
}>

const SERVE_PREFIX = 'serve'
const NO_ROWS_YET: Record<Implementation, number> = {
  real: 0,
  'contract-double': 0,
  's0-double': 0,
}
const ROOT_DISPOSAL_DEADLINE_MS = 10_000
const rootDeadlineOf = (options: RunServeOptions): number =>
  options.rootDisposalDeadlineMs ?? ROOT_DISPOSAL_DEADLINE_MS

/** The entry's environment for this run; the one time of the run is held on its root for the rows. */
function entryEnvOf(root: Context, trust: Trust, options: RunServeOptions): EntryEnv {
  const time = options.time ?? hostTime()
  holdRunTime(root, time)
  return {
    stateRoot: options.stateRoot,
    readTrusted: name => trust.contextForName(root, name),
    once: createOnce(),
    time,
  }
}

function createOnce(): EntryEnv['once'] {
  const made = new Map<symbol, { create: () => unknown; value: unknown }>()
  return <T>(key: symbol, create: () => T): T => {
    const hit = made.get(key)
    if (hit === undefined) {
      const value = create()
      made.set(key, { create, value })
      return value
    }
    if (hit.create !== create)
      throw new Error(`entry env: ${String(key)} was first created by a different function`)
    return hit.value as T
  }
}

function placeholderNames(
  rows: readonly RowSpec[],
  profile: Profile,
  manifests: ReadonlyMap<RowId, RowManifest>,
  registry: ReadonlySet<ServiceName>,
): ServiceName[] {
  const providedByRows = new Set<ServiceName>([
    ...[...manifests.values()].flatMap(m => m.provides),
    ...[...profile.declarations.values()].flatMap(d => d.declaration.manifest.provides),
  ])
  const wantedByReal = new Set(
    rows.filter(r => r.implementation !== 's0-double').flatMap(r => r.manifest.injects),
  )
  const wantedByDoubles = rows
    .filter(r => r.implementation === 's0-double')
    .flatMap(r => r.manifest.injects)
  return [...new Set(wantedByDoubles)].filter(
    name => !providedByRows.has(name) && !registry.has(name) && !wantedByReal.has(name),
  )
}

function stopRequest(signal: AbortSignal): { promise: Promise<string>; cancel: () => void } {
  const reasonOf = () => (typeof signal.reason === 'string' ? signal.reason : 'stop signal')
  let onAbort = () => {}
  const promise = new Promise<string>(resolve => {
    if (signal.aborted) {
      resolve(reasonOf())
      return
    }
    onAbort = () => resolve(reasonOf())
    signal.addEventListener('abort', onAbort, { once: true })
  })
  return { promise, cancel: () => signal.removeEventListener('abort', onAbort) }
}

export async function runServe(options: RunServeOptions): Promise<ServeResult> {
  const wrongInstance = refusedInstance(options.stateRoot, options.instance ?? 'release')
  if (wrongInstance !== undefined) {
    options.stderr(`${SERVE_PREFIX}: ${wrongInstance}`)
    return {
      exitCode: 3,
      accepting: false,
      barrierCalls: 0,
      startedRows: [],
      appliedRows: [],
      implementations: { real: 0, 'contract-double': 0, 's0-double': 0 },
    }
  }
  const hostFiles = createHostFilesRuntime({
    diagnose: diagnostic => options.stderr(`${SERVE_PREFIX}: ${diagnostic.kind}`),
  })
  let lock: StateLock | undefined
  // The stamp is read before the lock, so a refused directory is not written at all, and again under the lock.
  const lockState = (): string | null => {
    try {
      const unknown = refusedByStamp(options.stateRoot)
      if (unknown !== null) return unknown
      const taken = acquireStateLock(options.stateRoot)
      if (taken.kind === 'in-use')
        return `state-root-in-use: another serve process works on ${options.stateRoot}`
      lock = taken.lock
      const changed = refusedByStamp(options.stateRoot)
      if (changed === null) return null
      lock.release()
      lock = undefined
      return changed
    } catch (error) {
      return `state-root-unusable: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  const plugins: Readonly<Record<string, unknown>> = options.plugins ?? {
    ...releasePlugins,
    ...options.extraPlugins,
    agentHostRow: createAgentHostRow({
      toolRequestsOf: releaseToolRequestsOf,
      enabledExtensionsOf,
      systemExtensionsOf,
      lostContact: lostContactBy(() => lock, 'instance'),
    }),
    modelHostRow: createModelHostRow({ lostContact: lostContactBy(() => lock, 'call') }),
    modelRecordsRow: createModelRecordsRow({
      adopt: target => lostContactBy(() => lock, 'call')(target.call),
    }),
    toolRecordsRow: createToolRecordsRow({ lostContact: lostContactBy(() => lock, 'instance') }),
  }
  // A start that came to accept wrote this directory with the formats of this build: the stamp says so.
  const write: RunServeOptions['write'] = record => {
    if (record.kind === 'startup-result' && record['accepting'] === true)
      stampState(options.stateRoot)
    options.write(record)
  }
  try {
    return await runServeWithHostFiles({ ...options, plugins, write }, hostFiles, lockState)
  } finally {
    await hostFiles.close()
    lock?.release()
  }
}

function rowSpecOf(
  row: TreeRow,
  profile: Profile,
  manifests: ReadonlyMap<RowId, RowManifest>,
  probes: Probes,
): RowSpec {
  if (row.plugin === STUB_EXPORT) {
    const manifest = manifests.get(row.id) ?? NO_MANIFEST
    return {
      row,
      manifest,
      plugin: stubRowPlugin(row.id, manifest, probes),
      implementation: 's0-double',
    }
  }
  const declared = profile.declarations.get(row.plugin)
  if (declared === undefined)
    throw new ConfigError('unknown-plugin', `plugin "${row.plugin}" carries no row declaration`)
  const { declaration, plugin } = declared
  const { lifecycle } = declaration
  return {
    row,
    manifest: declaration.manifest,
    plugin: declaredRowPlugin(row.id, plugin, probes),
    implementation: declaration.implementation,
    declared: {
      row: declaration.row,
      via: lifecycle.kind === 'entry-object' ? lifecycle.via : null,
    },
  }
}

function entryObjectRecords(
  modules: readonly EntryObjectModule[],
  placeholders: readonly ServiceName[],
  trust: Trust,
): S0Record[] {
  return [
    {
      kind: 'entry-object',
      name: S0_ASSEMBLY_LIFECYCLE_KEY,
      implementation: 'real',
      trusted: false,
    },
    ...modules.map((module): S0Record => ({
      kind: 'entry-object',
      name: module.name,
      implementation: module.implementation,
      trusted: trust.isTrusted(module.name),
    })),
    ...placeholders.map((name): S0Record => ({
      kind: 'entry-object',
      name,
      implementation: 's0-double',
      trusted: trust.isTrusted(name),
    })),
  ]
}

function entryObjectsOf(
  modules: readonly EntryObjectModule[],
  placeholders: readonly ServiceName[],
  env: EntryEnv,
): EntryObject[] {
  return [
    ...modules.map((module): EntryObject => ({
      name: module.name,
      implementation: module.implementation,
      registersFor: module.registersFor ?? [],
      install: scope => module.install(scope, env),
    })),
    ...placeholders.map((name): EntryObject => ({
      name,
      implementation: 's0-double',
      value: Object.freeze({ standIn: name }),
    })),
  ]
}

const implementationOfSpec = (spec: RowSpec): Implementation => spec.implementation ?? 's0-double'

function implementationCounts(rows: readonly RowSpec[]): Readonly<{
  counts: Record<Implementation, number>
  of: ReadonlyMap<RowId, Implementation>
}> {
  const counts: Record<Implementation, number> = { real: 0, 'contract-double': 0, 's0-double': 0 }
  for (const spec of rows) counts[implementationOfSpec(spec)] += 1
  return { counts, of: new Map(rows.map(spec => [spec.row.id, implementationOfSpec(spec)])) }
}

function parseFactoryConfigs(
  rows: readonly TreeRow[],
  factories: Readonly<{ executionHost: ExecutionHostBinding; telemetry: TelemetryBinding }>,
): void {
  for (const row of rows) {
    if (row.plugin === 'executionHost') factories.executionHost.parseConfig(row.config)
    if (row.plugin === 'telemetry') factories.telemetry.parseConfig(row.config)
  }
}

type Started = Extract<StartResult, { kind: 'started' }>
type StartFailure = Exclude<StartResult, { kind: 'started' }>

async function startAndReport(
  input: Readonly<{
    registry: LifecycleRegistry
    started: Started
    barrierCalls: number
    enabledRows: number
    implementations: Record<Implementation, number>
    probes: Probes
    write: RunServeOptions['write']
    options: RunServeOptions
  }>,
): Promise<0 | 3 | 4> {
  const { registry, started, barrierCalls, probes, write } = input
  const starts =
    barrierCalls > 0
      ? await startsWithin(registry, input.options.readinessTimeoutMs, input.options.stop)
      : undefined
  const startFailure = typeof starts === 'string' ? undefined : starts
  const startCode =
    starts === undefined ? started.report.exitCode : typeof starts === 'string' ? 4 : 3
  for (const state of started.report.rows) write({ kind: 'row-state', ...state })
  write({
    kind: 'startup-result',
    profile: 'real',
    scope: 'serving',
    accepting: startCode === 0,
    enabledRows: input.enabledRows,
    outcome:
      starts === undefined
        ? started.report.outcome
        : typeof starts === 'string'
          ? starts
          : 'start-failed',
    stuck: started.report.stuck,
    ...(startFailure === undefined ? {} : { startFailure }),
    implementations: input.implementations,
    barrierCalls,
    startedRows: probes.started,
    appliedRows: probes.applied,
  })
  return startCode
}

async function startsWithin(
  registry: LifecycleRegistry,
  deadlineMs: number,
  stop: AbortSignal,
): Promise<Awaited<ReturnType<LifecycleRegistry['startAll']>> | 'start-timeout' | 'stopped'> {
  const timer = monotonicClock.after(deadlineMs)
  const stopping = stopOf(stop)
  try {
    return await Promise.race([
      registry.startAll(),
      timer.promise.then(() => 'start-timeout' as const),
      stopping.asked.then(() => 'stopped' as const),
    ])
  } finally {
    timer.cancel()
    stopping.cancel()
  }
}

function rootRetirement(
  deadlineMs: number,
  loaded: () => readonly LoadedRow[],
  stderr: RunServeOptions['stderr'],
): Pick<
  NonNullable<Parameters<typeof runShutdown>[4]>,
  'disposeRootMs' | 'undisposedRows' | 'rootStuck'
> {
  return {
    disposeRootMs: deadlineMs,
    undisposedRows: () =>
      loaded()
        .filter(inTransit)
        .map(row => row.id),
    rootStuck: stuck =>
      stderr(
        `${SERVE_PREFIX}: root disposal did not settle within ${deadlineMs} ms; the process ends without it; stuck rows: ${stuck.join(', ') || 'none named'}`,
      ),
  }
}

async function awaitStop(
  signal: AbortSignal,
  registryStop: Promise<void>,
  stderr: RunServeOptions['stderr'],
): Promise<void> {
  const request = stopRequest(signal)
  const reason = await Promise.race([request.promise, registryStop.then(() => null)])
  request.cancel()
  if (reason !== null) stderr(`${SERVE_PREFIX}: stop requested: ${reason}`)
}

async function settleStartFailure(
  started: StartFailure,
  io: Readonly<{
    write: RunServeOptions['write']
    stderr: RunServeOptions['stderr']
    root: Context
    shutdown: () => ReturnType<typeof runShutdown>
    options: RunServeOptions
  }>,
): Promise<ServeResult['exitCode']> {
  const past = (deadline: boolean): string => (deadline ? ': the start deadline passed' : '')
  const retire = async (): Promise<void> => {
    const dispose = () => io.root.fiber.dispose()
    if ((await disposeWithin(dispose, rootDeadlineOf(io.options), monotonicClock)) === 'late')
      io.stderr(`${SERVE_PREFIX}: root disposal did not settle; the process ends without it`)
  }
  switch (started.kind) {
    case 'rejected':
      for (const diagnostic of started.diagnostics)
        io.stderr(`${SERVE_PREFIX}: ${describeDiagnostic(diagnostic)}`)
      await retire()
      return started.exitCode
    case 'entry-failed': {
      io.stderr(
        `${SERVE_PREFIX}: entry-object ${started.name}: install failed${past(started.deadline)}`,
      )
      const report = await io.shutdown()
      io.write({ kind: 'shutdown-result', ...report })
      return started.exitCode
    }
    case 'preparation-failed':
      io.stderr(`${SERVE_PREFIX}: tenant directory preparation failed${past(started.deadline)}`)
      await retire()
      return started.exitCode
  }
}

async function runServeWithHostFiles(
  options: RunServeOptions,
  hostFiles: HostFilesRuntime,
  lockState: () => string | null,
): Promise<ServeResult> {
  const { stderr } = options
  // Sealed after `shutdown-result`; every writer below gets this one.
  const write = sealedAfterShutdownResult(options.write, stderr)
  const executionHost = createExecutionHostBinding(hostFiles, options.hostScreen)
  const telemetry = createTelemetryBinding({
    write,
    stderr,
    summary: line => stderr(`${SERVE_PREFIX}: ${line}`),
  })
  const profile = serveProfile({
    ...(options.plugins ?? { ...releasePlugins, ...options.extraPlugins }),
    executionHost: executionHost.plugin,
    telemetry: telemetry.plugin,
  })
  const probes: Probes = { started: [], applied: [] }
  let barrierCalls = 0
  let accepting = false
  let implementations = NO_ROWS_YET
  const result = (exitCode: ServeResult['exitCode']): ServeResult => ({
    exitCode,
    accepting,
    barrierCalls,
    startedRows: probes.started,
    appliedRows: probes.applied,
    implementations,
  })

  const manifests = options.manifests ?? profile.stubManifests
  let tree: ResolvedTree
  let rows: RowSpec[]
  let disclosure: ReturnType<typeof compileToolResultDisclosure>
  try {
    validateFactoryRows({
      distribution: options.distribution,
      operator: options.operator,
      allowlist: profile.allowlist,
      bindings: { ...hostFactoryBindings, ...telemetryFactoryBindings },
    })
    tree = loadTree(options.distribution, options.operator, profile.allowlist)
    checkModelRowConsistency(tree.rows)
    disclosure = compileToolResultDisclosure(tree.rows)
    checkToolsReplyBudget(tree.rows)
    checkSuspensionCommandBound(tree.rows)
    parseFactoryConfigs(tree.rows, { executionHost, telemetry })
    rows = tree.rows.map(row => rowSpecOf(row, profile, manifests, probes))
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    stderr(`${SERVE_PREFIX}: ${error.code}: ${error.message}`)
    return result(2)
  }
  const refused = lockState()
  if (refused !== null) {
    stderr(`${SERVE_PREFIX}: ${refused}`)
    return result(2)
  }
  const kinds = implementationCounts(rows)
  implementations = kinds.counts

  const trust = trustFor(options.visibility ?? profile.visibility)
  for (const record of treeRecords(
    tree,
    row => trust.describe(row).names,
    row => kinds.of.get(row) ?? 's0-double',
    telemetry.describe,
  ))
    write(record)

  const modules = options.entryObjects ?? releaseEntryObjects
  const placeholders = placeholderNames(
    rows,
    profile,
    manifests,
    new Set(modules.map(module => module.name)),
  )
  for (const record of entryObjectRecords(modules, placeholders, trust)) write(record)

  const expected = expectedPhases(rows)
  const root = new Context()
  root.logger.exporter(telemetry.bridge.exporter)
  installToolResultDisclosure(root, disclosure)
  let loaded: readonly LoadedRow[] = []
  let shutdownReport: ReturnType<typeof runShutdown> | undefined
  const shutdown = () => {
    hostFiles.stopPeriodic()
    return (shutdownReport ??= runShutdown(
      registry,
      expected,
      options.shutdownDeadlineMs,
      monotonicClock,
      {
        log: write,
        stopsFirst: stopPredecessors(rows),
        ...(options.drainDeadlineMs === undefined ? {} : { drainMs: options.drainDeadlineMs }),
        ...(finishHostFiles === undefined ? {} : { afterBusiness: finishHostFiles }),
        afterStorage: deadline => telemetry.close(Math.max(0, deadline - monotonicClock.now())),
        disposeRoot: async () => {
          await finishHostFiles?.()
          await hostFiles.close()
          await disposeTree(root, loaded)
        },
        ...rootRetirement(rootDeadlineOf(options), () => loaded, stderr),
      },
    ))
  }
  const finishHostFiles = rows.some(spec => spec.row.plugin === 'executionHost')
    ? () =>
        hostFiles.finish(async () => {
          const row = loaded.find(candidate => candidate.id === 'execution-host')
          if (row !== undefined) await disposeRow(row, () => hostFiles.request())
        })
    : undefined
  let stoppedByRegistry = () => {}
  const registryStop = new Promise<void>(resolve => {
    stoppedByRegistry = resolve
  })
  const registry = new ProbedRegistry(
    {
      expected,
      clock: monotonicClock,
      requestStop: reason => {
        stderr(`${SERVE_PREFIX}: stop requested: ${reason}`)
        void shutdown()
        stoppedByRegistry()
      },
    },
    probes.started,
  )
  await root.plugin(S0AssemblyLifecycleService, registry)

  const env = entryEnvOf(root, trust, options)
  const started = await startTree({
    root,
    trust,
    rows,
    entryObjects: entryObjectsOf(modules, placeholders, env),
    prepare: () => prepareStartupDirectory(rows),
    readinessTimeoutMs: options.readinessTimeoutMs,
    barrier: () => {
      barrierCalls += 1
    },
    stop: options.stop,
  })

  if (started.kind !== 'started')
    return result(await settleStartFailure(started, { write, stderr, root, shutdown, options }))

  loaded = started.rows
  const startCode = await startAndReport({
    registry,
    started,
    barrierCalls,
    enabledRows: tree.rows.length,
    implementations,
    probes,
    write,
    options,
  })
  accepting = startCode === 0
  if (accepting) await awaitStop(options.stop, registryStop, stderr)
  const report = await shutdown()
  write({ kind: 'shutdown-result', ...report })
  return result(finalExitCode(startCode, report.overall))
}
