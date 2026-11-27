import type { Access } from '@omne-harness/legal-identity'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { Connections, EndpointRef, McpPorts, ReleaseReport } from '@omne-harness/mcp-contract'
import type { GateRefusal } from './internal/gate.ts'
import { admitForUse, type UseGate } from './internal/guard.ts'
import type { ChangeFeed } from './internal/changes.ts'
import type { ConnectionTable } from './internal/table.ts'

export type ConnectionsDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  table: ConnectionTable<P>
  changes: ChangeFeed
}>

export function createConnections<P, S>(deps: ConnectionsDependencies<P, S>): Connections<P> {
  const gate: UseGate<P, S> = { ports: deps.ports, table: deps.table }
  return {
    async release(
      access: Access<P>,
      ref: EndpointRef,
    ): Promise<Outcome<ReleaseReport, GateRefusal>> {
      const admitted = await admitForUse(gate, access, ref)
      if ('failure' in admitted) return admitted
      return succeed(await deps.table.close(access.tenant, ref.holding))
    },
    async closeAll() {
      try {
        return await deps.table.closeAll()
      } finally {
        deps.changes.close()
      }
    },
  }
}
