import {
  Inject,
  isConstructor,
  Service,
  symbols,
  type Context,
  type Plugin,
} from '@deepseek-ai/cordis'
import type { SwapWay } from '@omne-harness/assembly'
import type { Entry } from '@omne-harness/assembly-cordis/cordis'
import type { RowSupervision } from './shutdown.ts'
import type {
  AssemblyLifecycle,
  DeclaredImplementation,
  LifecycleHandle,
  LifecyclePhase,
  RowId,
  RowManifest,
  ServiceName,
} from './types.ts'

export const S0_ASSEMBLY_LIFECYCLE_KEY = 's0.assemblyLifecycle'

/**
 * Where a row hands its handle to the supervision of the assembly. The registration is an effect of the calling
 * fiber: when that fiber is unloaded, the handle is withdrawn.
 *
 * @owner apps/harness-server
 */
export class S0AssemblyLifecycleService extends Service implements AssemblyLifecycle {
  private readonly supervision: RowSupervision

  constructor(ctx: Context, supervision: RowSupervision) {
    super(ctx, S0_ASSEMBLY_LIFECYCLE_KEY)
    this.supervision = supervision
  }

  register(handle: LifecycleHandle): void {
    this.ctx.effect(() => this.supervision.add(handle), 'assemblyLifecycle.register')
  }
}

export type RowHandle = Omit<LifecycleHandle, 'phase' | 'row'>

export type RowBody = (ctx: Context, config: unknown) => Promise<RowHandle>

export type RowLifecycle =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'body'; phase: LifecyclePhase }>
  | Readonly<{ kind: 'entry-object'; phase: LifecyclePhase; via: ServiceName }>

type Common = Readonly<{
  row: string
  implementation: DeclaredImplementation
  manifest: Omit<RowManifest, 'phase'>
  /** How this row is swapped while the process serves; a row that says nothing takes a new process. */
  swap?: SwapWay
  /** For each service key the row provides, the digest of its contract. */
  contracts?: Readonly<Record<ServiceName, string>>
  entries?: readonly RowEntry[]
  isolates?: readonly ServiceName[]
  /** What the row brings that no generation changes: loaded once beside the entries. */
  fixed?: readonly Plugin.Object[]
}>

export type RowEntry = Pick<Entry<unknown>, 'key' | 'plugin' | 'offered' | 'promote'> &
  Readonly<{ unavailable: object; offer(ctx: Context, implementation: never): void }>

export type RowDefinition = Common &
  (
    | Readonly<{ lifecycle: Readonly<{ kind: 'none' }>; plugin: Plugin }>
    | Readonly<{
        lifecycle: Readonly<{ kind: 'body'; phase: LifecyclePhase }>
        body: RowBody
        Config?: NonNullable<Plugin.Object['Config']>
      }>
    | Readonly<{
        lifecycle: Readonly<{ kind: 'entry-object'; phase: LifecyclePhase; via: ServiceName }>
        plugin: Plugin
      }>
  )

export type RowDeclaration = Readonly<{
  row: RowId
  implementation: DeclaredImplementation
  manifest: RowManifest
  lifecycle: RowLifecycle
  /** Absent: the row takes a new process. */
  swap?: SwapWay
  contracts?: Readonly<Record<ServiceName, string>>
  entries?: readonly RowEntry[]
  fixed?: readonly Plugin.Object[]
}>

const declarations = new WeakMap<object, RowDeclaration>()

const ROW_ID = /^[a-z0-9][a-z0-9-]*$/
const PRIVATE_PREFIX = 's0.'

function rowIdOf(text: string): RowId {
  if (!ROW_ID.test(text))
    throw new Error(`row id "${text}" must be lower-case letters, digits and hyphens`)
  return text as RowId
}

function checkNames(manifest: Omit<RowManifest, 'phase'>): void {
  for (const name of [...manifest.provides, ...manifest.injects]) {
    if (name.startsWith(PRIVATE_PREFIX))
      throw new Error(`manifest name "${name}" carries the S0 private prefix; use the formal key`)
  }
}

function checkWrappedInject(row: string, plugin: Plugin, injects: readonly ServiceName[]): void {
  const literal = Object.keys(Inject.resolve(plugin.inject))
  const missing = literal.filter(name => !injects.includes(name))
  if (missing.length > 0)
    throw new Error(
      `row "${row}" declares injects without the wrapped plugin's own inject: ${missing.join(', ')}`,
    )
}

function runInit(instance: unknown): unknown {
  if (typeof instance !== 'object' || instance === null) return undefined
  const hooks: unknown = Reflect.get(instance, symbols.initHooks)
  if (Array.isArray(hooks)) {
    for (const hook of hooks) if (typeof hook === 'function') Reflect.apply(hook, undefined, [])
  }
  const init: unknown = Reflect.get(instance, symbols.init)
  return typeof init === 'function' ? Reflect.apply(init, instance, []) : undefined
}

function runWrapped(plugin: Plugin, ctx: Context, config: unknown): unknown {
  if (typeof plugin === 'function') {
    if (!isConstructor(plugin)) return plugin(ctx, config)
    return runInit(new plugin(ctx, config))
  }
  return plugin.apply(ctx, config)
}

function register(ctx: Context, handle: LifecycleHandle): void {
  const lifecycle: AssemblyLifecycle = ctx.get(S0_ASSEMBLY_LIFECYCLE_KEY)
  lifecycle.register(handle)
}

/** The context a generation provides into: the keys of its entries and its private keys are its own there. */
function privateTo(ctx: Context, definition: RowDefinition): Context {
  const keys = [
    ...(definition.entries ?? []).map(entry => entry.key),
    ...(definition.isolates ?? []),
  ]
  return keys.reduce((scope, key) => scope.isolate(key), ctx)
}

type Method = (...args: unknown[]) => unknown

/** What a generation gives an entry: each call reads the service the generation provides to itself then, so a part that comes up late is found. */
function providedIn(scope: Context, entry: RowEntry): never {
  const forward = ([name, none]: [string, Method]): [string, Method] => [
    name,
    (...args) => {
      const service: unknown = scope.get(entry.key, false)
      const method = service === undefined ? none : (Reflect.get(Object(service), name) as Method)
      return Reflect.apply(method, service, args)
    },
  ]
  return Object.fromEntries(Object.entries(entry.unavailable).map(forward)) as never
}

export function defineRow(definition: RowDefinition): Plugin.Object {
  const row = rowIdOf(definition.row)
  checkNames(definition.manifest)
  const { lifecycle } = definition
  const phase = lifecycle.kind === 'none' ? null : lifecycle.phase
  const manifest: RowManifest = { ...definition.manifest, phase }
  const inject =
    phase === null ? [...manifest.injects] : [...manifest.injects, S0_ASSEMBLY_LIFECYCLE_KEY]

  let wrapper: Plugin.Object
  if ('body' in definition) {
    const { body, lifecycle: bodyLifecycle } = definition
    wrapper = {
      name: row,
      inject,
      ...(definition.Config === undefined ? {} : { Config: definition.Config }),
      apply: async (ctx: Context, config: unknown) => {
        const scope = privateTo(ctx, definition)
        const handle = await body(scope, config)
        for (const entry of definition.entries ?? []) entry.offer(ctx, providedIn(scope, entry))
        register(ctx, { ...handle, phase: bodyLifecycle.phase, row })
      },
    }
  } else {
    const { plugin } = definition
    checkWrappedInject(row, plugin, manifest.injects)
    const wrappedInject = Inject.resolve(plugin.inject)
    const configuredInject = Object.values(wrappedInject).some(config => config !== null)
      ? Object.assign(Object.fromEntries(inject.map(name => [name, null])), wrappedInject)
      : inject
    wrapper = {
      name: row,
      inject: configuredInject,
      ...(plugin.Config === undefined ? {} : { Config: plugin.Config }),
      apply: (ctx: Context, config: unknown) => runWrapped(plugin, ctx, config),
    }
  }
  declarations.set(wrapper, {
    row,
    implementation: definition.implementation,
    manifest,
    lifecycle,
    ...(definition.swap === undefined ? {} : { swap: definition.swap }),
    ...(definition.contracts === undefined ? {} : { contracts: definition.contracts }),
    ...(definition.entries === undefined ? {} : { entries: definition.entries }),
    ...(definition.fixed === undefined ? {} : { fixed: definition.fixed }),
  })
  return wrapper
}

export function declaredParts(declaration: RowDeclaration) {
  const { lifecycle, swap, contracts, entries, fixed } = declaration
  return {
    manifest: declaration.manifest,
    implementation: declaration.implementation,
    declared: {
      row: declaration.row,
      via: lifecycle.kind === 'entry-object' ? lifecycle.via : null,
    },
    ...(swap === undefined ? {} : { swap }),
    ...(contracts === undefined ? {} : { contracts }),
    ...(entries === undefined ? {} : { entries }),
    ...(fixed === undefined ? {} : { fixed }),
  }
}

export function rowDeclarationOf(plugin: unknown): RowDeclaration | undefined {
  if (typeof plugin !== 'object' || plugin === null) return undefined
  return declarations.get(plugin)
}
