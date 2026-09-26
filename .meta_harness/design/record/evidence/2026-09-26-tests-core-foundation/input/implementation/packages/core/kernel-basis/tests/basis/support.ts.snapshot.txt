import type { Context, Inject, Plugin } from '@deepseek-ai/cordis'

/** probe 用的最小对象插件：函数的 `name` 属性只读，不能 Object.assign，所以走 `{ name, apply }` 形态。 */
export function plugin(
  name: string,
  apply: (ctx: Context) => unknown,
  inject?: Inject,
): Plugin.Object {
  const object: Plugin.Object = { name, apply }
  if (inject !== undefined) object.inject = inject
  return object
}
