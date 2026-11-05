// Test helper: the services assembled on a world the way `createMcp` does it, through the one
// internal assembly, with the table exposed. Service-level cases assert connection state through
// `status.inspect`, the public status port.
import { assemble } from '../../src/internal/assembly.ts'
import type { ConnectionTable, TableRuntime } from '../../src/internal/table.ts'
import type { ActionDiscovery, Connections, EndpointStatus } from '@omne-harness/mcp-contract'
import type { Principal } from './identities.ts'
import type { World } from './world.ts'

export type Core = Readonly<{
  w: World
  table: ConnectionTable<Principal>
  discovery: ActionDiscovery<Principal>
  status: EndpointStatus<Principal, string>
  connections: Connections<Principal>
}>

/** `runtime` replaces the table's source of bounds and the outlet of its scope, for cases that observe them. */
export function core(w: World, runtime?: TableRuntime): Core {
  const { table, services } = assemble(w.ports, w.config, runtime)
  return { w, table, ...services }
}
