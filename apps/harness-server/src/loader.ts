import type { Context, Plugin } from '@deepseek-ai/cordis'
import { ConfigError, distributionSchema, operatorSchema, parseBoundary } from './config-schema.ts'
import { awaitReadiness, type LoadedRow, type ReadinessReport } from './readiness.ts'
import type { Trust } from './trust.ts'
import type { Implementation, RowId, RowManifest, ServiceName, TreeRow } from './types.ts'

/** Factory ownership follows the release binding, not a replaced row's config source. */
export function validateFactoryRows(options: {
  distribution: unknown
  operator: unknown
  allowlist: readonly string[]
  bindings: Readonly<Record<string, string>>
}): void {
  const distribution = parseBoundary(distributionSchema(options.allowlist), options.distribution)
  for (const row of distribution.rows) {
    const required = options.bindings[row.plugin]
    if (required !== undefined && required !== row.id)
      throw new ConfigError('invalid-config', `factory export requires row ${required}`)
  }
  if (options.operator === undefined) return
  const operator = parseBoundary(operatorSchema(options.allowlist), options.operator)
  for (const op of operator.ops) {
    if (op.kind === 'insert' && options.bindings[op.row.plugin] !== undefined)
      throw new ConfigError('invalid-config', 'factory row cannot be inserted')
  }
}

export type RowSpec = Readonly<{
  row: TreeRow
  manifest: RowManifest
  plugin: Plugin
  /** Default `s0-double`. */
  implementation?: Implementation
  /** What a real export declares: its row id (DP1-C9) and the entry object that registers for it (DP1-C15). */
  declared?: Readonly<{ row: RowId; via: ServiceName | null }>
}>

/**
 * An object the entry provides before the first row loads. Trusted names go under their own label.
 * A `value` is provided as is (S0 stand-ins and `serve` placeholders). An `install` constructs the
 * service definition's subclass on the scope (DP1-C11).
 */
export type EntryObject = Readonly<{
  name: ServiceName
  /** Default `s0-double`. */
  implementation?: Implementation
  /** Rows this object registers shutdown handles for (DP1-C15). Default none. */
  registersFor?: readonly RowId[]
}> &
  (Readonly<{ value: unknown }> | Readonly<{ install: (scope: Context) => void | Promise<void> }>)

export type PreflightDiagnostic =
  | Readonly<{ kind: 'duplicate-row'; row: RowId }>
  | Readonly<{ kind: 'invisible-inject'; row: RowId; name: ServiceName }>
  | Readonly<{ kind: 'split-provider-group'; group: string; rows: readonly RowId[] }>
  | Readonly<{ kind: 'row-binding'; row: RowId; plugin: string; declared: RowId }>
  | Readonly<{
      kind: 'double-dependency'
      row: RowId
      name: ServiceName
      provider: RowId | 'entry-object'
    }>
  | Readonly<{ kind: 'via-unregistered'; row: RowId; via: ServiceName }>
  | Readonly<{ kind: 'duplicate-entry-object'; name: ServiceName }>

export type PreflightRow = Readonly<{
  id: RowId
  plugin?: string
  manifest: RowManifest
  implementation?: Implementation
  declared?: RowSpec['declared']
}>

export type PreflightEntryObject = Readonly<{
  name: ServiceName
  implementation?: Implementation
  registersFor?: readonly RowId[]
}>

const implementationOf = (item: { implementation?: Implementation }): Implementation =>
  item.implementation ?? 's0-double'

/**
 * Checks that decide before any plugin body runs. A row that injects a trusted
 * name it cannot see would stop in PENDING for ever, and a provider group split
 * over rows has no receiving surface. A real row served by a double would only
 * fail at first use (DP1-C10). A real export on another row id, or an
 * entry-object-borne row without its registering object, would never register
 * (DP1-C9, DP1-C15). All are assembly errors.
 */
export function preflight(
  rows: readonly PreflightRow[],
  trust: Trust,
  entryObjects: readonly PreflightEntryObject[] = [],
): PreflightDiagnostic[] {
  const found: PreflightDiagnostic[] = []
  const seen = new Set<RowId>()
  const groups = new Map<string, RowId[]>()
  const providers = new Map<
    ServiceName,
    { implementation: Implementation; provider: RowId | 'entry-object' }
  >()
  const registrars = new Map<ServiceName, PreflightEntryObject>()

  for (const object of entryObjects) {
    if (registrars.has(object.name))
      found.push({ kind: 'duplicate-entry-object', name: object.name })
    registrars.set(object.name, object)
    providers.set(object.name, {
      implementation: implementationOf(object),
      provider: 'entry-object',
    })
  }
  for (const row of rows) {
    for (const name of row.manifest.provides) {
      providers.set(name, { implementation: implementationOf(row), provider: row.id })
    }
  }

  for (const row of rows) {
    const { id, manifest } = row
    if (seen.has(id)) found.push({ kind: 'duplicate-row', row: id })
    seen.add(id)
    const visible = trust.visibleNames(id)
    for (const name of manifest.injects) {
      if (trust.isTrusted(name) && !visible.includes(name))
        found.push({ kind: 'invisible-inject', row: id, name })
    }
    if (manifest.sameProviderGroup !== null) {
      const members = groups.get(manifest.sameProviderGroup) ?? []
      members.push(id)
      groups.set(manifest.sameProviderGroup, members)
    }
    if (implementationOf(row) !== 's0-double') {
      for (const name of manifest.injects) {
        const provider = providers.get(name)
        if (provider?.implementation === 's0-double')
          found.push({ kind: 'double-dependency', row: id, name, provider: provider.provider })
      }
    }
    if (row.declared !== undefined) {
      if (row.declared.row !== id)
        found.push({
          kind: 'row-binding',
          row: id,
          plugin: row.plugin ?? '?',
          declared: row.declared.row,
        })
      const { via } = row.declared
      if (via !== null && !(registrars.get(via)?.registersFor ?? []).includes(id))
        found.push({ kind: 'via-unregistered', row: id, via })
    }
  }
  for (const [group, members] of groups) {
    if (members.length > 1) found.push({ kind: 'split-provider-group', group, rows: members })
  }
  return found
}

export type StartResult =
  | Readonly<{ kind: 'rejected'; exitCode: 2; diagnostics: readonly PreflightDiagnostic[] }>
  | Readonly<{ kind: 'preparation-failed'; exitCode: 3; error: unknown }>
  | Readonly<{ kind: 'entry-failed'; exitCode: 3; name: ServiceName; error: unknown }>
  | Readonly<{ kind: 'started'; rows: readonly LoadedRow[]; report: ReadinessReport }>

type StartOptions = {
  root: Context
  trust: Trust
  rows: readonly RowSpec[]
  entryObjects: readonly EntryObject[]
  omitEntryObjects?: readonly ServiceName[] | undefined
  prepare?: () => void | Promise<void>
  readinessTimeoutMs: number
  barrier: () => void | Promise<void>
}

function preflightStart(options: StartOptions): PreflightDiagnostic[] {
  return preflight(
    options.rows.map(({ row, manifest, implementation, declared }) => ({
      id: row.id,
      plugin: row.plugin,
      manifest,
      ...(implementation === undefined ? {} : { implementation }),
      ...(declared === undefined ? {} : { declared }),
    })),
    options.trust,
    options.entryObjects,
  )
}

/** Install the entry objects in order, apart from the withheld ones. The first install failure stops it. */
async function installEntryObjects(
  options: StartOptions,
): Promise<Extract<StartResult, { kind: 'entry-failed' }> | undefined> {
  const { root, trust } = options
  const omitted = new Set(options.omitEntryObjects ?? [])
  for (const name of omitted) {
    if (!options.entryObjects.some(object => object.name === name)) {
      throw new Error(`omitEntryObjects names "${name}", which is not an entry object`)
    }
  }
  for (const object of options.entryObjects) {
    if (omitted.has(object.name)) continue
    const scoped = trust.isTrusted(object.name) ? trust.contextForName(root, object.name) : root
    if ('value' in object) {
      scoped.provide(object.name, object.value)
      continue
    }
    try {
      await object.install(scoped)
    } catch (error) {
      return { kind: 'entry-failed', exitCode: 3, name: object.name, error }
    }
  }
  return undefined
}

/**
 * Create every row in order and wait for each to finish loading, sharing the readiness deadline.
 * A row still LOADING at the deadline does not hold the loader for ever: later rows are still
 * created, in order, but not awaited. `elapsedMs` is what the readiness wait must subtract.
 */
async function loadRows(
  options: StartOptions,
): Promise<{ loaded: LoadedRow[]; elapsedMs: number }> {
  const { root, trust } = options
  const startedAt =
    /* wall-clock: operation-timing -- Share one readiness deadline between loading and waiting. */ Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'deadline'>(resolve => {
    timer = setTimeout(() => resolve('deadline'), options.readinessTimeoutMs)
  })
  const loaded: LoadedRow[] = []
  let stalled = false
  try {
    for (const { row, manifest, plugin } of options.rows) {
      const ctx = trust.contextForRow(root, row.id)
      const fiber = ctx.plugin(plugin, row.config)
      const entry: LoadedRow = {
        id: row.id,
        ctx,
        fiber,
        manifest,
        visible: trust.visibleNames(row.id),
      }
      loaded.push(entry)
      if (stalled) continue
      const settled = fiber.then(
        () => 'loaded' as const,
        (error: unknown) => {
          entry.error = error
          return 'loaded' as const
        },
      )
      if ((await Promise.race([settled, deadline])) === 'deadline') stalled = true
    }
  } finally {
    clearTimeout(timer)
  }
  const elapsedMs =
    /* wall-clock: operation-timing -- Share one readiness deadline between loading and waiting. */ Date.now() -
    startedAt
  return { loaded, elapsedMs }
}

/**
 * Load the final tree in order, then wait for readiness.
 *
 * `omitEntryObjects` is a test input that withholds named entry objects.
 * `await ctx.plugin(...)` ends when loading ends, which does not mean ACTIVE:
 * the state is read from the fiber afterwards.
 */
export async function startTree(options: StartOptions): Promise<StartResult> {
  const diagnostics = preflightStart(options)
  if (diagnostics.length > 0) return { kind: 'rejected', exitCode: 2, diagnostics }

  try {
    await options.prepare?.()
  } catch (error) {
    return { kind: 'preparation-failed', exitCode: 3, error }
  }

  const entryFailed = await installEntryObjects(options)
  if (entryFailed !== undefined) return entryFailed

  const { loaded, elapsedMs } = await loadRows(options)
  const report = await awaitReadiness({
    rows: loaded,
    timeoutMs: Math.max(0, options.readinessTimeoutMs - elapsedMs),
    barrier: options.barrier,
  })
  return { kind: 'started', rows: loaded, report }
}

/** Explicit unload waits for the fiber before the entry runs its maintenance callback. */
export async function disposeRow(
  row: LoadedRow,
  afterDispose?: () => Promise<unknown>,
): Promise<void> {
  await row.fiber.dispose()
  await afterDispose?.()
}

/** Dispose rows in reverse load order, then the root. Reports every failure together. */
export async function disposeTree(root: Context, rows: readonly LoadedRow[]): Promise<void> {
  const errors: unknown[] = []
  for (const row of [...rows].reverse()) {
    try {
      await disposeRow(row)
    } catch (error) {
      errors.push(error)
    }
  }
  try {
    await root.fiber.dispose()
  } catch (error) {
    errors.push(error)
  }
  if (errors.length > 0) throw new AggregateError(errors, 'tree disposal failed')
}

export type PrincipalIssuer = Readonly<{
  issue: (claim: { session: string; owner: string }) => unknown
}>

/** Source of session ownership, provided by the session storage row under the S-BIND label. */
export type SessionPrincipalBindings = Readonly<{
  ownerOf: (session: string) => string | undefined
}>

export type SessionWorkPrincipals = Readonly<{
  forSession: (
    session: string,
  ) => Readonly<{ kind: 'issued'; principal: unknown }> | Readonly<{ kind: 'unavailable' }>
}>

/**
 * Entry stand-in for the S-WORK object. The issuer lives only in this closure.
 * Each call reads the bindings source through `bindingsCtx`, the entry's own
 * S-BIND context, and not through any context the object was handed later.
 */
export function createSessionWorkPrincipals(
  issuer: PrincipalIssuer,
  bindingsCtx: Context,
  bindingsName: ServiceName,
): SessionWorkPrincipals {
  return {
    forSession(session) {
      const bindings = bindingsCtx.reflect.get(bindingsName) as SessionPrincipalBindings | undefined
      const owner = bindings?.ownerOf(session)
      if (owner === undefined) return { kind: 'unavailable' }
      return { kind: 'issued', principal: issuer.issue({ session, owner }) }
    },
  }
}
