import type { Context, Inject, Plugin } from '@deepseek-ai/cordis'
import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * 本项目插件的统一形态：函数插件 + `inject` 数组 + Standard Schema 的 `Config`（zod 即可）。
 *
 * - config 校验由内核在插件体运行前完成：校验失败 ⇒ fiber `FAILED`、不 provide 任何服务、`await fiber` 抛出
 *   （probe：`plugin-throw-fails-fiber`）。配置错误一律启动失败，不做运行期拒绝。
 * - `inject` 里写进去的服务都是**必需**的：缺一个即 `PENDING`；提供者换代即卸载重跑
 *   （basis：`plugin-body-reruns-on-provider-change`）。可选依赖不写进 `inject`，用 {@link resolveOptional} 调用时解析。
 * - 插件体必须可重复执行：只做 config 校验之外的 `ctx.provide`，不在闭包里持有事实。
 */
export interface PluginDefinition<C> {
  readonly name: string
  readonly inject?: Inject
  readonly Config: StandardSchemaV1<unknown, C>
  readonly apply: (ctx: Context, config: C) => void | Promise<void>
}

export function definePlugin<C>(definition: PluginDefinition<C>): Plugin.Object<C> {
  const plugin: Plugin.Object<C> = {
    name: definition.name,
    Config: definition.Config,
    apply: definition.apply,
  }
  if (definition.inject !== undefined) plugin.inject = definition.inject
  return plugin
}

/**
 * 可选依赖的调用时解析：`ctx.get` 不要求 inject，提供者不在或未 `ACTIVE` 时返回 `undefined`。
 * 调用方拿到 `undefined` 时按各自契约的「缺席默认答案」收场（例如 `storage-unavailable`），不放行。
 */
export function resolveOptional<T>(ctx: Context, name: string): T | undefined {
  return ctx.get(name) as T | undefined
}
