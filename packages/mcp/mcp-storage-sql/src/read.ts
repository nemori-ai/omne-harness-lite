import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { loadCatalog, type SqlPort } from './rows.ts'
import { HANDLER, PROTOCOL, READS, type CatalogRowKey, type ReadName } from './schema.ts'

type ReadRequest = Readonly<{ read: ReadName; key: CatalogRowKey }>

const RUN: Record<ReadName, (port: SqlPort, request: ReadRequest) => unknown> = {
  readCatalog(port, request) {
    return { ok: loadCatalog(port, request.key)?.record ?? 'absent' }
  },
}

/** The requests come from this member's own store; only the name of the read is checked. */
export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const request = input as ReadRequest
    if (!READS.includes(request.read)) return { kind: 'failed', diagnostic: 'unknown_mcp_read' }
    return { kind: 'read', output: RUN[request.read](port, request) as JsonValue }
  },
} satisfies ReadHandlerModule
