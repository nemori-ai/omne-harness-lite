import { assemble } from '../../src/internal/assembly.ts'
import type { ConnectionTable, TableRuntime } from '../../src/internal/table.ts'
import type {
  ActionDiscovery,
  ActionInvoker,
  Connections,
  EndpointStatus,
} from '@omne-harness/mcp-contract'
import type { Principal } from './identities.ts'
import type { World } from './world.ts'

export type Core = Readonly<{
  w: World
  table: ConnectionTable<Principal>
  discovery: ActionDiscovery<Principal>
  invoker: ActionInvoker<Principal>
  status: EndpointStatus<Principal, string>
  connections: Connections<Principal>
}>

export function core(w: World, runtime?: TableRuntime): Core {
  const { table, services } = assemble(w.ports, w.config, runtime)
  return { w, table, ...services }
}
