// The public root of @omne-harness/mcp: the services of the contract on the five requirement
// ports, and the production in-memory catalog store. The aggregates, the gate, the tables and
// the assembly are internal.
import type { McpConfig, McpPorts, McpServices } from '@omne-harness/mcp-contract'
import { validateConfig } from './config.ts'
import { assemble } from './internal/assembly.ts'

export { createInMemoryCatalogStore } from './store/memory.ts'

/**
 * Builds the services on the ports. An unlawful configuration is a `RangeError` (SPEC S3). The
 * services share one connection table, one in-flight table and one task table; nothing connects
 * until an operation asks for it. The host that holds the instance calls `connections.closeAll()`
 * at exit.
 */
export function createMcp<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
): Omit<McpServices<P, S>, 'invoker'> {
  return assemble(ports, validateConfig<P>(config)).services
}
