import type { McpClock, McpConfig, McpPorts, McpServices } from '@omne-harness/mcp-contract'
import { createConnections } from '../connections.ts'
import { createDiscovery } from '../discovery.ts'
import { createInspection } from '../inspection.ts'
import { createInvoker } from '../invoker.ts'
import { createStatus } from '../status.ts'
import { InFlightCalls } from './in-flight.ts'
import { createConnectionTable, type ConnectionTable, type TableRuntime } from './table.ts'
import { TaskTable } from './task-table.ts'

export type Assembled<P, S> = Readonly<{
  services: McpServices<P, S>
  table: ConnectionTable<P>
}>

const hostClock: McpClock = {
  now: () =>
    /* wall-clock: observation-time -- acquiredAt of a listing; no decision here reads it */ new Date(),
}

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
      invoker: createInvoker(deps),
      status: createStatus(deps),
      connections: createConnections(deps),
    },
  }
}
