import type { Context, Inject, Plugin } from '@deepseek-ai/cordis'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

export const FIBER_STATE = {
  PENDING: 0 satisfies CordisFiberState['PENDING'],
  LOADING: 1 satisfies CordisFiberState['LOADING'],
  ACTIVE: 2 satisfies CordisFiberState['ACTIVE'],
  FAILED: 3 satisfies CordisFiberState['FAILED'],
  DISPOSED: 4 satisfies CordisFiberState['DISPOSED'],
  UNLOADING: 5 satisfies CordisFiberState['UNLOADING'],
} as const

export function plugin(
  name: string,
  apply: (ctx: Context) => unknown,
  inject?: Inject,
): Plugin.Object {
  const object: Plugin.Object = { name, apply }
  if (inject !== undefined) object.inject = inject
  return object
}
