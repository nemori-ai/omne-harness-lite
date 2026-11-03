// Test helper: the four core services assembled on a world, the way `createMcpCore` does it.
// Service-level cases assert connection state through `status.inspect`, the public status port.
import { createConnections } from '../../src/connections.ts'
import { createDiscovery, type McpDiscovery } from '../../src/discovery.ts'
import { createConnectionTable } from '../../src/internal/table.ts'
import { createStatus } from '../../src/status.ts'
import type { Connections, EndpointStatus } from '@omne-harness/mcp-contract'
import type { Principal } from './values.ts'
import type { World } from './world.ts'

export type Core = Readonly<{
  w: World
  discovery: McpDiscovery<Principal>
  status: EndpointStatus<Principal, string>
  connections: Connections<Principal>
}>

export function core(w: World): Core {
  const table = createConnectionTable(w.ports, w.config)
  const deps = {
    ports: w.ports,
    config: w.config,
    table,
    now: () => new Date('2026-11-03T12:00:00Z'),
  }
  return {
    w,
    discovery: createDiscovery(deps),
    status: createStatus(deps),
    connections: createConnections(deps),
  }
}
