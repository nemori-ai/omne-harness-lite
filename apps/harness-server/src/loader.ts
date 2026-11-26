import type { Context, Plugin } from '@deepseek-ai/cordis'
import { ConfigError, distributionSchema, operatorSchema, parseBoundary } from './config-schema.ts'
import { awaitReadiness, stopOf, type LoadedRow, type ReadinessReport } from './readiness.ts'
import type { Trust } from './trust.ts'
import type { Implementation, RowId, RowManifest, ServiceName, TreeRow } from './types.ts'

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
  implementation?: Implementation
  declared?: Readonly<{ row: RowId; via: ServiceName | null }>
  swap?: 'implementation' | 'rerun' | 'restart'
  contracts?: Readonly<Record<ServiceName, string>>
}>

export type EntryObject = Readonly<{
  name: ServiceName
  implementation?: Implementation
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
  | Readonly<{ kind: 'preparation-failed'; exitCode: 3; error: unknown; deadline: boolean }>
  | Readonly<{
      kind: 'entry-failed'
      exitCode: 3
      name: ServiceName
      error: unknown
      deadline: boolean
    }>
  | Readonly<{ kind: 'started'; rows: readonly LoadedRow[]; report: ReadinessReport }>

type StartOptions = {
  root: Context
  trust: Trust
  rows: readonly RowSpec[]
  entryObjects: readonly EntryObject[]
  omitEntryObjects?: readonly ServiceName[] | undefined
  prepare?: () => void | Promise<void>
  /** The deadline of the start, taken twice: by the steps before the rows, then by the loading and the wait. */
  readinessTimeoutMs: number
  barrier: () => void | Promise<void>
  stop?: AbortSignal | undefined
}

const DEADLINE: unique symbol = Symbol('deadline')
const STOP: unique symbol = Symbol('stop')

/** The budget of one start: what is left of its deadline, and a wait that ends at the deadline or at a stop. */
function startBudget(options: StartOptions) {
  const now = (): number =>
    /* wall-clock: operation-timing -- One deadline shared by every step of the start. */ Date.now()
  const startedAt = now()
  const leftMs = (): number => Math.max(0, options.readinessTimeoutMs - (now() - startedAt))
  const stopping = stopOf(options.stop)
  return {
    leftMs,
    stopped: (): boolean => options.stop?.aborted === true,
    async within<T>(work: PromiseLike<T>): Promise<T | typeof DEADLINE | typeof STOP> {
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<typeof DEADLINE>(resolve => {
        timer = setTimeout(() => resolve(DEADLINE), leftMs())
      })
      try {
        const stop = stopping.asked.then((): typeof STOP => STOP)
        return await Promise.race([Promise.resolve(work), deadline, stop])
      } finally {
        clearTimeout(timer)
      }
    },
    end: () => stopping.cancel(),
  }
}
type Budget = ReturnType<typeof startBudget>

const passed = (step: string): Error => new Error(`the start deadline passed while ${step}`)

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

async function installEntryObjects(
  options: StartOptions,
  budget: Budget,
): Promise<Extract<StartResult, { kind: 'entry-failed' }> | typeof STOP | undefined> {
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
    const { name } = object
    try {
      const done = await budget.within(Promise.resolve().then(() => object.install(scoped)))
      if (done === STOP) return STOP
      if (done === DEADLINE)
        return {
          kind: 'entry-failed',
          exitCode: 3,
          name,
          error: passed(`entry object ${name} was installed`),
          deadline: true,
        }
    } catch (error) {
      return { kind: 'entry-failed', exitCode: 3, name, error, deadline: false }
    }
  }
  return undefined
}

/** Loads the rows in order and waits for each; once a row has failed or the deadline has passed it waits no more. */
async function loadRows(
  options: StartOptions,
  budget: Budget,
): Promise<{ loaded: LoadedRow[]; complete: boolean }> {
  const { root, trust } = options
  const loaded: LoadedRow[] = []
  let stalled = false
  for (const { row, manifest, plugin } of options.rows) {
    if (budget.stopped()) return { loaded, complete: false }
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
        return 'failed' as const
      },
    )
    const won = await budget.within(settled)
    if (won === STOP) return { loaded, complete: false }
    if (won === DEADLINE || won === 'failed') stalled = true
  }
  return { loaded, complete: true }
}

export async function startTree(options: StartOptions): Promise<StartResult> {
  const diagnostics = preflightStart(options)
  if (diagnostics.length > 0) return { kind: 'rejected', exitCode: 2, diagnostics }

  let budget = startBudget(options)
  try {
    const stoppedEarly = async (): Promise<StartResult> => ({
      kind: 'started',
      rows: [],
      report: await awaitReadiness({
        rows: [],
        timeoutMs: 0,
        barrier: options.barrier,
        stop: options.stop,
        complete: false,
      }),
    })
    if (budget.stopped()) return await stoppedEarly()
    try {
      const prepared = await budget.within(Promise.resolve().then(() => options.prepare?.()))
      if (prepared === STOP) return await stoppedEarly()
      if (prepared === DEADLINE) {
        const error = passed('the tenant directories were prepared')
        return { kind: 'preparation-failed', exitCode: 3, error, deadline: true }
      }
    } catch (error) {
      return { kind: 'preparation-failed', exitCode: 3, error, deadline: false }
    }

    const entryFailed = await installEntryObjects(options, budget)
    if (entryFailed === STOP) return await stoppedEarly()
    if (entryFailed !== undefined) return entryFailed

    // The rows get the whole deadline again: what the steps before them took is not theirs to pay.
    budget.end()
    budget = startBudget(options)
    const { loaded, complete } = await loadRows(options, budget)
    const report = await awaitReadiness({
      rows: loaded,
      timeoutMs: budget.leftMs(),
      barrier: options.barrier,
      stop: options.stop,
      complete,
    })
    return { kind: 'started', rows: loaded, report }
  } finally {
    budget.end()
  }
}

/** Explicit unload waits for the fiber before the entry runs its maintenance callback. */
export async function disposeRow(
  row: LoadedRow,
  afterDispose?: () => Promise<unknown>,
): Promise<void> {
  await row.fiber.dispose()
  await afterDispose?.()
}

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

export type SessionPrincipalBindings = Readonly<{
  ownerOf: (session: string) => string | undefined
}>

export type SessionWorkPrincipals = Readonly<{
  forSession: (
    session: string,
  ) => Readonly<{ kind: 'issued'; principal: unknown }> | Readonly<{ kind: 'unavailable' }>
}>

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
