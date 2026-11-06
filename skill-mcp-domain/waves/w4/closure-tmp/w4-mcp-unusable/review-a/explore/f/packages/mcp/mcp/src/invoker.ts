// The call port `ActionInvoker` of the contract: the calls and the task operations, on the same
// tables. The two halves are `calls.ts` and `tasks.ts`; each declares the dependencies it needs,
// and this module composes them.
import type { ActionInvoker } from '@omne-harness/mcp-contract'
import { createCalls, type CallsDependencies } from './calls.ts'
import { createTasks, type TasksDependencies } from './tasks.ts'

export type InvokerDependencies<P, S> = CallsDependencies<P, S> & TasksDependencies<P, S>

export function createInvoker<P, S>(deps: InvokerDependencies<P, S>): ActionInvoker<P> {
  return { ...createCalls(deps), ...createTasks(deps) }
}
