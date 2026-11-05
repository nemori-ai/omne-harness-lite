// The public root of @omne-harness/mcp: the core services of MCP on the five requirement ports,
// and the production in-memory catalog store. The aggregates, the gate and the connection table
// are internal; the next wave adds the invoker on the same table.
import {
  type EndpointStatus,
  type Connections,
  type EndpointInspection,
  type McpConfig,
  type McpPorts,
} from '@omne-harness/mcp-contract'
import { validateConfig } from './config.ts'
import { createConnections } from './connections.ts'
import { createDiscovery, type McpDiscovery } from './discovery.ts'
import { createInspection } from './inspection.ts'
import { createTaskScope } from './internal/scope.ts'
import { createConnectionTable } from './internal/table.ts'
import { createStatus } from './status.ts'

export { createInMemoryCatalogStore } from './store/memory.ts'
export type { McpDiscovery, RefreshRequest } from './discovery.ts'

/**
 * The four core services: the contract's service set without the invoker. `discovery.refresh`
 * also accepts an abort signal, which the publish boundary checks.
 */
export type McpCore<P, S> = Readonly<{
  inspection: EndpointInspection
  discovery: McpDiscovery<P>
  status: EndpointStatus<P, S>
  connections: Connections<P>
}>

export type McpCoreOptions = Readonly<{
  /** The time a listing is acquired at. Defaults to the local clock. */
  now?: () => Date
}>

/** The local observation of the time a listing is acquired; no decision in this member reads it. */
function localNow(): Date {
  return /* wall-clock: observation-time -- acquiredAt of a listing; no decision here reads it */ new Date()
}

/**
 * Builds the core services on the ports. An unlawful configuration is a `RangeError` (SPEC S3).
 * The services share one connection table and its scope; nothing connects until a `refresh` asks
 * for it.
 */
export function createMcpCore<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
  options: McpCoreOptions = {},
): McpCore<P, S> {
  const checked = validateConfig<P>(config)
  const scope = createTaskScope()
  const table = createConnectionTable(ports, checked, scope)
  const deps = { ports, config: checked, table, scope, now: options.now ?? localNow }
  return {
    inspection: createInspection(),
    discovery: createDiscovery(deps),
    status: createStatus(deps),
    connections: createConnections(deps),
  }
}
