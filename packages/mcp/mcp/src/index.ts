import type { McpConfig, McpPorts, McpServices } from '@omne-harness/mcp-contract'
import { validateConfig } from './config.ts'
import { assemble } from './internal/assembly.ts'

export { createInMemoryCatalogStore } from './store/memory.ts'

export function createMcp<P, S>(ports: McpPorts<P, S>, config: McpConfig<P>): McpServices<P, S> {
  return assemble(ports, validateConfig<P>(config)).services
}
