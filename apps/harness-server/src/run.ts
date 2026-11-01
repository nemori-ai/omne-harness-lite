// `runS0`：把装载树（plugin-tree）、装载与就绪（loader）、行清单（s0/rows、s0/stubs）与有序关闭
// （lifecycle、shutdown）组合成一次 S0 运行（s0-spec-r2 §2、§10）。S0 不接 HTTP，不打开业务状态根。
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { ConfigError } from './config-schema.ts'
import * as cordisExports from './cordis.ts'
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
import type { LoadedRow } from './readiness.ts'
import { visibility as releaseVisibility } from './s0/rows.ts'
import { rowManifests as releaseManifests } from './s0/stubs.ts'
import { monotonicClock, runShutdown } from './shutdown.ts'
import { createTrust } from './trust.ts'
import type {
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

const PLUGINS: Readonly<Record<string, typeof cordisExports.stubPlugin>> = cordisExports
const ALLOWLIST = Object.keys(PLUGINS)

const NO_MANIFEST: RowManifest = { provides: [], injects: [], phase: null, sameProviderGroup: null }

/** The one stub switch this entry reads itself. The rest belongs to the stub plugin. */
const StopConfig = z.object({ stopBehavior: z.enum(['settle', 'hang']).optional() })

type Probes = { started: string[]; applied: string[] }

const SETTLED: StopResult = { kind: 'settled' }

/**
 * A row's plugin: the stub for its manifest, plus a lifecycle handle for a row that the release
 * code expects to register. The handle is registered from the row's own fiber, so it leaves with it.
 */
function rowPlugin(
  plugin: string,
  id: RowId,
  manifest: RowManifest,
  probes: Probes,
): Plugin.Object {
  const factory = PLUGINS[plugin]
  if (factory === undefined) throw new ConfigError('unknown-plugin', `plugin "${plugin}" unknown`)
  const stub = factory({
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
      const { stopBehavior } = StopConfig.parse(config ?? {})
      const handle: LifecycleHandle = {
        phase,
        row: id,
        start: async () => {
          probes.started.push(id)
        },
        stop: () =>
          stopBehavior === 'hang' ? new Promise<StopResult>(() => {}) : Promise.resolve(SETTLED),
      }
      ;(ctx.get(S0_ASSEMBLY_LIFECYCLE_KEY) as S0AssemblyLifecycleService).register(handle)
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
  }
}

function treeRecords(
  tree: ResolvedTree,
  visible: (row: RowId) => readonly ServiceName[],
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
      implementation: 's0-double',
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
function expectedPhases(
  tree: ResolvedTree,
  manifests: ReadonlyMap<RowId, RowManifest>,
): Map<RowId, LifecyclePhase> {
  const expected = new Map<RowId, LifecyclePhase>()
  for (const row of tree.rows) {
    const phase = (manifests.get(row.id) ?? NO_MANIFEST).phase
    if (phase !== null) expected.set(row.id, phase)
  }
  return expected
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
    tree = loadTree(options.distribution, options.operator, ALLOWLIST)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    stderr(`s0: ${error.code}: ${error.message}`)
    return result(2)
  }

  const manifests = options.manifests ?? releaseManifests
  const visibility = options.visibility ?? releaseVisibility
  const trust = createTrust(
    [...new Set([...visibility.values()].flat())].map(name => ({ id: name, names: [name] })),
    visibility,
  )
  for (const record of treeRecords(tree, row => trust.describe(row).names)) write(record)

  const expected = expectedPhases(tree, manifests)

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
  const registry = new LifecycleRegistry({
    expected,
    clock: monotonicClock,
    requestStop: reason => {
      stderr(`s0: stop requested: ${reason}`)
      void shutdown()
    },
  })

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
    ...new Set([ISSUER_NAME, WORK_NAME, ...entryNames(releaseManifests)]),
  ].map(name => ({ name, value: objectFor(name) }))

  const rows: RowSpec[] = tree.rows.map(row => {
    const manifest = manifests.get(row.id) ?? NO_MANIFEST
    return { row, manifest, plugin: rowPlugin(row.plugin, row.id, manifest, probes) }
  })

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

  if (started.kind === 'rejected') {
    for (const diagnostic of started.diagnostics) stderr(`s0: ${describeDiagnostic(diagnostic)}`)
    await root.fiber.dispose()
    return result(started.exitCode)
  }

  loaded = started.rows
  if (barrierCalls > 0) await registry.startAll()
  for (const state of started.report.rows) write({ kind: 'row-state', ...state })
  write({
    kind: 'startup-result',
    profile: 's0',
    scope: 'loader-only',
    accepting: false,
    enabledRows: tree.rows.length,
    outcome: started.report.outcome,
    barrierCalls,
    startedRows: probes.started,
    appliedRows: probes.applied,
  })

  const report = await shutdown()
  write({ kind: 'shutdown-result', ...report })
  return result(finalExitCode(started.report.exitCode, report.overall))
}
