// `runS0` 与 `runServe`：把装载树（plugin-tree）、装载与就绪（loader）、行清单（profile）与有序关闭
// （lifecycle、shutdown）组合成一次运行。S0 不接 HTTP，不打开业务状态根（s0-spec-r2 §2、§10）。
// `serve` 以正式服务键装载行，启动后等停止请求（DP-1 决定，#978）。
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { ConfigError } from './config-schema.ts'
import { stubPlugin } from './cordis.ts'
import { entryObjects as releaseEntryObjects } from './entry/index.ts'
import {
  LifecycleRegistry,
  S0AssemblyLifecycleService,
  S0_ASSEMBLY_LIFECYCLE_KEY,
} from './lifecycle.ts'
import {
  createSessionWorkPrincipals,
  disposeTree,
  startTree,
  type EntryObject,
  type PreflightDiagnostic,
  type RowSpec,
} from './loader.ts'
import { loadTree, type ResolvedTree } from './plugin-tree.ts'
import { STUB_EXPORT, s0Profile, serveProfile, type Profile } from './profile.ts'
import type { LoadedRow } from './readiness.ts'
import { monotonicClock, runShutdown } from './shutdown.ts'
import { createTrust, type Trust } from './trust.ts'
import type {
  EntryEnv,
  EntryObjectModule,
  Implementation,
  LifecycleHandle,
  LifecyclePhase,
  RowId,
  RowManifest,
  ServiceName,
  StopResult,
  Visibility,
} from './types.ts'

/** One stdout record. `kind` names it; the other fields are the record's own. */
export type S0Record = { readonly kind: string } & Readonly<Record<string, unknown>>

export type RunS0Options = Readonly<{
  /** Parsed JSON of the distribution file. Validated at the boundary here. */
  distribution: unknown
  operator?: unknown
  readinessTimeoutMs: number
  shutdownDeadlineMs: number
  write: (record: S0Record) => void
  /** Diagnostics for a person. Rejections before loading go here. */
  stderr: (line: string) => void
  /** Test input: entry objects to withhold, by full name. The CLI does not expose it. */
  omitEntryObjects?: readonly ServiceName[]
  /** Test input: replace the row manifests of the release code. */
  manifests?: ReadonlyMap<RowId, RowManifest>
  /** Test input: replace the trusted-name table of the release code. */
  visibility?: Visibility
}>

export type S0Result = Readonly<{
  /** 0 ready and shutdown settled; 2 rejected before loading; 3 FAILED; 4 PENDING or LOADING; 5 shutdown incomplete. */
  exitCode: 0 | 2 | 3 | 4 | 5
  barrierCalls: number
  startedRows: readonly string[]
  appliedRows: readonly string[]
}>

const NO_MANIFEST: RowManifest = { provides: [], injects: [], phase: null, sameProviderGroup: null }

/** The one stub switch this entry reads itself. The rest belongs to the stub plugin. */
const StopConfig = z.object({
  startBehavior: z.enum(['settle', 'fail']).optional(),
  stopBehavior: z.enum(['settle', 'hang']).optional(),
})

type Probes = { started: string[]; applied: string[] }

const SETTLED: StopResult = { kind: 'settled' }

/**
 * The registry of one run, with a probe before every `start` the registry calls: `startedRows` lists
 * the rows in call order, whoever registered the handle (a stub, a row body or an entry object).
 */
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

/**
 * A stub row's plugin: the stub for its manifest, plus a lifecycle handle for a row that the release
 * code expects to register. The handle is registered from the row's own fiber, so it leaves with it.
 */
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

/** A declared row's plugin: the wrapper from `defineRow`, with the probes of this run around it. */
function declaredRowPlugin(id: RowId, wrapper: Plugin.Object, probes: Probes): Plugin.Object {
  return {
    ...wrapper,
    apply: (ctx, config) => {
      probes.applied.push(id)
      return wrapper.apply(ctx, config)
    },
  }
}

/** Names that no row provides: the runtime objects of the root, which the entry stands in for. */
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
    })),
    ...tree.disabled.map((row): S0Record => ({
      kind: 'tree',
      id: row.id,
      disabled: true,
      source: row.source,
    })),
  ]
}

/** A non-zero startup code wins. Otherwise an incomplete shutdown is 5. */
function finalExitCode(
  startCode: 0 | 3 | 4,
  overall: 'settled' | 'incomplete',
): S0Result['exitCode'] {
  if (startCode !== 0) return startCode
  return overall === 'settled' ? 0 : 5
}

/** Expected registrants of the enabled rows, by shutdown phase. */
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
    else stderr(`s0: entry-object ${started.name}: install failed`)
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
  /** Parsed JSON of the distribution file. Validated at the boundary here. */
  distribution: unknown
  operator?: unknown
  readinessTimeoutMs: number
  shutdownDeadlineMs: number
  /** `--state-root`: an existing absolute directory. Handed to the entry objects as `EntryEnv.stateRoot`. */
  stateRoot: string
  /** The planned stop. After a successful startup the run waits for it. */
  stop: AbortSignal
  write: (record: S0Record) => void
  /** Diagnostics for a person. Rejections before loading go here. */
  stderr: (line: string) => void
  /** Test input: replace the `./cordis` exports (the allowlist and the row declarations). */
  plugins?: Readonly<Record<string, unknown>>
  /** Test input: replace the entry object registry `src/entry/index.ts`. */
  entryObjects?: readonly EntryObjectModule[]
  /** Test input: replace the stub manifests of the release code (formal names). */
  manifests?: ReadonlyMap<RowId, RowManifest>
  /** Test input: replace the trusted-name table of the release code. */
  visibility?: Visibility
}>

export type ServeResult = Readonly<{
  /** 0 was accepting, stopped on request and shutdown settled; 2 rejected before loading; 3 FAILED, start failed or an entry object failed to install; 4 PENDING or LOADING; 5 shutdown incomplete. */
  exitCode: 0 | 2 | 3 | 4 | 5
  accepting: boolean
  barrierCalls: number
  startedRows: readonly string[]
  appliedRows: readonly string[]
  implementations: Readonly<Record<Implementation, number>>
}>

const SERVE_PREFIX = 'serve'

/** DP1-C17: one object per key for one run. A second `create` for the same key is a programming error. */
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
    // The same `create` made it, so it is a T.
    return hit.value as T
  }
}

/**
 * DP1-C11: names that only s0-double rows inject, that no row of the table or any declaration
 * provides, that no module of the registry installs, and that no real or contract-double row injects.
 * The entry provides a placeholder for each. A real consumer never gets a placeholder.
 */
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

/** Settles with the reason when the signal aborts. `cancel` detaches the listener. */
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
  const { write, stderr } = options
  const profile = options.plugins === undefined ? serveProfile() : serveProfile(options.plugins)
  const probes: Probes = { started: [], applied: [] }
  let barrierCalls = 0
  let accepting = false
  const implementations: Record<Implementation, number> = {
    real: 0,
    'contract-double': 0,
    's0-double': 0,
  }
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
  try {
    tree = loadTree(options.distribution, options.operator, profile.allowlist)
    rows = tree.rows.map((row): RowSpec => {
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
    })
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    stderr(`${SERVE_PREFIX}: ${error.code}: ${error.message}`)
    return result(2)
  }
  for (const spec of rows) implementations[spec.implementation ?? 's0-double'] += 1

  const visibility = options.visibility ?? profile.visibility
  const trust = trustFor(visibility)
  const implementationOf = new Map(rows.map(r => [r.row.id, r.implementation ?? 's0-double']))
  for (const record of treeRecords(
    tree,
    row => trust.describe(row).names,
    row => implementationOf.get(row) ?? 's0-double',
  ))
    write(record)

  const modules = options.entryObjects ?? releaseEntryObjects
  const placeholders = placeholderNames(
    rows,
    profile,
    manifests,
    new Set(modules.map(module => module.name)),
  )
  const entryRecords: S0Record[] = [
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
  for (const record of entryRecords) write(record)

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
        disposeRoot: () => disposeTree(root, loaded),
      },
    ))
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

  const env: EntryEnv = {
    stateRoot: options.stateRoot,
    readTrusted: name => trust.contextForName(root, name),
    once: createOnce(),
  }
  const entryObjects: EntryObject[] = [
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

  const started = await startTree({
    root,
    trust,
    rows,
    entryObjects,
    readinessTimeoutMs: options.readinessTimeoutMs,
    barrier: () => {
      barrierCalls += 1
    },
  })

  if (started.kind === 'rejected') {
    for (const diagnostic of started.diagnostics)
      stderr(`${SERVE_PREFIX}: ${describeDiagnostic(diagnostic)}`)
    await root.fiber.dispose()
    return result(started.exitCode)
  }
  if (started.kind === 'entry-failed') {
    stderr(`${SERVE_PREFIX}: entry-object ${started.name}: install failed`)
    const report = await shutdown()
    write({ kind: 'shutdown-result', ...report })
    return result(started.exitCode)
  }

  loaded = started.rows
  const startFailure = barrierCalls > 0 ? await registry.startAll() : undefined
  const startCode = startFailure === undefined ? started.report.exitCode : 3
  accepting = startCode === 0
  for (const state of started.report.rows) write({ kind: 'row-state', ...state })
  write({
    kind: 'startup-result',
    profile: 'real',
    scope: 'serving',
    accepting,
    enabledRows: tree.rows.length,
    outcome: startFailure === undefined ? started.report.outcome : 'start-failed',
    ...(startFailure === undefined ? {} : { startFailure }),
    implementations,
    barrierCalls,
    startedRows: probes.started,
    appliedRows: probes.applied,
  })

  if (accepting) {
    const request = stopRequest(options.stop)
    const reason = await Promise.race([request.promise, registryStop.then(() => null)])
    request.cancel()
    if (reason !== null) stderr(`${SERVE_PREFIX}: stop requested: ${reason}`)
  }
  const report = await shutdown()
  write({ kind: 'shutdown-result', ...report })
  return result(finalExitCode(startCode, report.overall))
}
