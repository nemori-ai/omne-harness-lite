// The connections port `Connections` (SPEC S1, S8): `release` passes the gate and closes the
// endpoint's connection in the close order; `closeAll` closes every connection for the host at
// exit and asks no port about adoption or eligibility.
import type { Access } from '@omne-harness/legal-identity'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Connections,
  EndpointRef,
  McpPorts,
  Refusal,
  ReleaseReport,
} from '@omne-harness/mcp-contract'
import { admitForUse, type UseGate } from './internal/guard.ts'
import type { ConnectionTable } from './internal/table.ts'

export type ConnectionsDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  table: ConnectionTable<P>
}>

export function createConnections<P, S>(deps: ConnectionsDependencies<P, S>): Connections<P> {
  const gate: UseGate<P, S> = { ports: deps.ports, table: deps.table }
  return {
    async release(
      access: Access<P>,
      ref: EndpointRef,
    ): Promise<
      Outcome<
        ReleaseReport,
        Extract<Refusal, { kind: 'not-available-to-you' | 'blocked' | 'unknown' }>
      >
    > {
      const admitted = await admitForUse(gate, access, ref)
      if ('failure' in admitted) return admitted
      return succeed(await deps.table.close(access.tenant, ref.holding))
    },
    closeAll: () => deps.table.closeAll(),
  }
}
