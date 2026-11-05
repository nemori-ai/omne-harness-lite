// The one assembly of the services on a connection table: the table, then the services that
// share it. `createMcp` (the public root) and the member tests both assemble here, so neither
// repeats the wiring. The configuration comes validated: `createMcp` validates it (SPEC S3).
import type {
  ActionCalls,
  McpClock,
  McpConfig,
  McpPorts,
  McpServices,
} from '@omne-harness/mcp-contract'
import { createCalls } from '../calls.ts'
import { createConnections } from '../connections.ts'
import { createDiscovery } from '../discovery.ts'
import { createInspection } from '../inspection.ts'
import { createStatus } from '../status.ts'
import { InFlightCalls } from './in-flight.ts'
import { createConnectionTable, type ConnectionTable, type TableRuntime } from './table.ts'
import { TaskTable } from './task-table.ts'

export type Assembled<P, S> = Readonly<{
  services: Omit<McpServices<P, S>, 'invoker'> & Readonly<{ invoker: ActionCalls<P> }>
  table: ConnectionTable<P>
}>

/** The host's clock, read only to stamp when a listing was acquired; no decision reads it. */
const hostClock: McpClock = {
  now: () =>
    /* wall-clock: observation-time -- acquiredAt of a listing; no decision here reads it */ new Date(),
}

/**
 * Builds the connection table, the in-flight table and the task table, and the services on them.
 * `runtime` replaces the table's source of bounds and the outlet of its scope, for tests that
 * observe them.
 */
export function assemble<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
  runtime?: TableRuntime,
): Assembled<P, S> {
  const table = createConnectionTable(ports, config, runtime)
  const clock = ports.clock ?? hostClock
  const deps = {
    ports,
    config,
    table,
    clock,
    inFlight: new InFlightCalls(),
    tasks: new TaskTable(),
  }
  return {
    table,
    services: {
      inspection: createInspection(),
      discovery: createDiscovery(deps),
      invoker: createCalls(deps),
      status: createStatus(deps),
      connections: createConnections(deps),
    },
  }
}
