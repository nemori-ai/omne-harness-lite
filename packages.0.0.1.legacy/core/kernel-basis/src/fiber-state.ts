import type { Context } from '@deepseek-ai/cordis'

/**
 * `FiberState` 在 @deepseek-ai/cordis 4.0.4 的声明文件里是 `declare const enum`，
 * `isolatedModules` 下不能在运行时引用；这里镜像它的数值，由 probe
 * `tests/basis/fiber-state-readable.test.ts` 对着真实 fiber 核对每一个取值。
 */
export const FIBER_STATE = {
  PENDING: 0,
  LOADING: 1,
  ACTIVE: 2,
  FAILED: 3,
  DISPOSED: 4,
  UNLOADING: 5,
} as const

export type FiberStateValue = (typeof FIBER_STATE)[keyof typeof FIBER_STATE]

/** account-registration 每步之前用它判断本 fiber 是否仍 ACTIVE（不再 ACTIVE ⇒ `interrupted`）。 */
export function fiberIsActive(ctx: Context): boolean {
  return (ctx.fiber.state as number) === FIBER_STATE.ACTIVE
}
