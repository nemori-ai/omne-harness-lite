import type { ActionInvoker } from '@omne-harness/mcp-contract'
import { createCalls, type CallsDependencies } from './calls.ts'
import { createTasks, type TasksDependencies } from './tasks.ts'

export type InvokerDependencies<P, S> = CallsDependencies<P, S> & TasksDependencies<P, S>

export function createInvoker<P, S>(deps: InvokerDependencies<P, S>): ActionInvoker<P> {
  return { ...createCalls(deps), ...createTasks(deps) }
}
