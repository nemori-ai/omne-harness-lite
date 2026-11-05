// The call port `ActionInvoker` of the contract: the calls and the task operations, on the same
// tables. The two halves are `calls.ts` and `tasks.ts`; each takes the part of the dependencies
// it needs from the whole declared here.
import type { ActionInvoker, McpConfig, McpPorts } from '@omne-harness/mcp-contract'
import { createCalls } from './calls.ts'
import type { InFlightCalls } from './internal/in-flight.ts'
import type { ConnectionTable } from './internal/table.ts'
import type { TaskTable } from './internal/task-table.ts'
import { createTasks } from './tasks.ts'

export type InvokerDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  table: ConnectionTable<P>
  inFlight: InFlightCalls
  tasks: TaskTable
}>

export function createInvoker<P, S>(deps: InvokerDependencies<P, S>): ActionInvoker<P> {
  return { ...createCalls(deps), ...createTasks(deps) }
}
