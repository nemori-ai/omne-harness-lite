import type { Context, Inject, Plugin } from '@deepseek-ai/cordis'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

/**
 * `FiberState` 在 @deepseek-ai/cordis 4.0.4 的声明里是 `declare const enum`，`isolatedModules` 下运行时读不到。
 * 这里镜像它的数值；每个值都 `satisfies` 上游声明的对应成员，上游改了数值，类型检查失败。
 */
export const FIBER_STATE = {
  PENDING: 0 satisfies CordisFiberState['PENDING'],
  LOADING: 1 satisfies CordisFiberState['LOADING'],
  ACTIVE: 2 satisfies CordisFiberState['ACTIVE'],
  FAILED: 3 satisfies CordisFiberState['FAILED'],
  DISPOSED: 4 satisfies CordisFiberState['DISPOSED'],
  UNLOADING: 5 satisfies CordisFiberState['UNLOADING'],
} as const

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
