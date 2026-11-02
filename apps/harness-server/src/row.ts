// 行声明（DP1-C8、DP1-C15）：真实行与契约替身行经 `defineRow` 自带清单、实现种类与关闭承载。
// `defineRow` 返回一个包装插件：在同一个行 fiber 里转交被包装插件的 `Config` 与 `apply`，带关闭阶段时再注入
// `s0.assemblyLifecycle`；行体承载时在行体返回后登记句柄。声明挂在包装插件上，装载器用 `rowDeclarationOf` 读回。
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

/** 行句柄：关闭协调者需要的部分。阶段与行 id 由 `defineRow` 填。 */
export type RowHandle = Omit<LifecycleHandle, 'phase' | 'row'>

/** 行体：应用成员自己的插件体，返回本行的句柄。 */
export type RowBody = (ctx: Context, config: unknown) => Promise<RowHandle>

export type RowLifecycle =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'body'; phase: LifecyclePhase }>
  | Readonly<{ kind: 'entry-object'; phase: LifecyclePhase; via: ServiceName }>

type Common = Readonly<{
  /** 行 id，与发行层绑定（DP1-C9）。格式同边界 schema。 */
  row: string
  implementation: DeclaredImplementation
  /** 名字只取定义包导出的键常量。不写 `s0.assemblyLifecycle`，由 `defineRow` 加。 */
  manifest: Omit<RowManifest, 'phase'>
}>

/** `defineRow` 的输入。带关闭阶段的行只有两种承载，成员插件不能直接做带阶段的行。 */
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

/** 装载器读回的声明。 */
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

/** IC-8：声明的 injects 必须包含被包装插件的字面 inject。 */
function checkWrappedInject(row: string, plugin: Plugin, injects: readonly ServiceName[]): void {
  const literal = Object.keys(Inject.resolve(plugin.inject))
  const missing = literal.filter(name => !injects.includes(name))
  if (missing.length > 0)
    throw new Error(
      `row "${row}" declares injects without the wrapped plugin's own inject: ${missing.join(', ')}`,
    )
}

/** 与 Cordis 4.0.4 `Fiber.execute` 对类插件实例的处理相同：先跑 init hooks，再跑 `[Service.init]`。 */
function runInit(instance: unknown): unknown {
  if (typeof instance !== 'object' || instance === null) return undefined
  const hooks: unknown = Reflect.get(instance, symbols.initHooks)
  if (Array.isArray(hooks)) {
    for (const hook of hooks) if (typeof hook === 'function') Reflect.apply(hook, undefined, [])
  }
  const init: unknown = Reflect.get(instance, symbols.init)
  return typeof init === 'function' ? Reflect.apply(init, instance, []) : undefined
}

/** 在同一个 fiber 里运行被包装插件，与 Cordis 4.0.4 的 `Fiber.execute` 对三种形状的处理相同。 */
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

/** 返回可放进 `./cordis` 的插件，声明挂在插件对象上，装载器读回。 */
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
    wrapper = {
      name: row,
      inject,
      ...(plugin.Config === undefined ? {} : { Config: plugin.Config }),
      apply: (ctx: Context, config: unknown) => runWrapped(plugin, ctx, config),
    }
  }
  declarations.set(wrapper, { row, implementation: definition.implementation, manifest, lifecycle })
  return wrapper
}

/** 读回 `defineRow` 挂在插件上的声明。不是 `defineRow` 返回的对象得到 `undefined`。 */
export function rowDeclarationOf(plugin: unknown): RowDeclaration | undefined {
  if (typeof plugin !== 'object' || plugin === null) return undefined
  return declarations.get(plugin)
}
