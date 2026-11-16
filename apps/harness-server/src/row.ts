import { Inject, isConstructor, symbols, type Context, type Plugin } from '@deepseek-ai/cordis'
import { S0_ASSEMBLY_LIFECYCLE_KEY } from './lifecycle.ts'
import type {
  AssemblyLifecycle,
  DeclaredImplementation,
  LifecycleHandle,
  LifecyclePhase,
  RowId,
  RowManifest,
  ServiceName,
} from './types.ts'

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
}>

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
        const handle = await body(ctx, config)
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
  declarations.set(wrapper, { row, implementation: definition.implementation, manifest, lifecycle })
  return wrapper
}

export function rowDeclarationOf(plugin: unknown): RowDeclaration | undefined {
  if (typeof plugin !== 'object' || plugin === null) return undefined
  return declarations.get(plugin)
}
