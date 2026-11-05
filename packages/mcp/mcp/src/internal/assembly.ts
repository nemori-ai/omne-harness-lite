// The one assembly of the services on a connection table: the table, then the services that
// share it. `createMcp` (the public root) and the member tests both assemble here, so neither
// repeats the wiring. The configuration comes validated: `createMcp` validates it (SPEC S3).
import type { McpClock, McpConfig, McpPorts, McpServices } from '@omne-harness/mcp-contract'
import { createConnections } from '../connections.ts'
import { createDiscovery } from '../discovery.ts'
import { createInspection } from '../inspection.ts'
import { createStatus } from '../status.ts'
import { createConnectionTable, type ConnectionTable, type TableRuntime } from './table.ts'

export type Assembled<P, S> = Readonly<{
  services: Omit<McpServices<P, S>, 'invoker'>
  table: ConnectionTable<P>
}>

/** The host's clock, read only to stamp when a listing was acquired; no decision reads it. */
const hostClock: McpClock = {
  now: () =>
    /* wall-clock: observation-time -- acquiredAt of a listing; no decision here reads it */ new Date(),
}

/**
 * Builds the connection table and the services on it. `runtime` replaces the table's source of
 * bounds and the outlet of its scope, for tests that observe them.
 */
export function assemble<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
  runtime?: TableRuntime,
): Assembled<P, S> {
  const table = createConnectionTable(ports, config, runtime)
  const clock = ports.clock ?? hostClock
  const deps = { ports, config, table, clock }
  return {
    table,
    services: {
      inspection: createInspection(),
      discovery: createDiscovery(deps),
      status: createStatus(deps),
      connections: createConnections(deps),
    },
  }
}
