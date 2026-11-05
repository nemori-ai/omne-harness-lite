// The call port `ActionInvoker` of the contract: the calls and the task operations, on the same
// tables. The two halves are `calls.ts` and `tasks.ts`.
import type { ActionInvoker } from '@omne-harness/mcp-contract'
import { createCalls, type CallsDependencies } from './calls.ts'
import { createTasks } from './tasks.ts'

export type InvokerDependencies<P, S> = CallsDependencies<P, S>

export function createInvoker<P, S>(deps: InvokerDependencies<P, S>): ActionInvoker<P> {
  return { ...createCalls(deps), ...createTasks(deps) }
}
