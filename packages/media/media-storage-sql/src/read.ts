import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { isLive, keysWhere, load, pointed, type SqlPort } from './rows.ts'
import { HANDLER, PROTOCOL, READS, type ReadName, type ReadRequest } from './schema.ts'

const notFound = { failure: { kind: 'not-found' } }

const RUN: Record<ReadName, (port: SqlPort, request: ReadRequest) => unknown> = {
  readUpload(port, request) {
    const row = pointed(port, request.name)
    return row === null || row.state === 'deleting' ? notFound : { ok: row }
  },
  readLive(port, request) {
    const row = load(port, request.name)
    return isLive(row) ? { ok: row } : notFound
  },
  listDeleting(port, request) {
    const keys = keysWhere(port, "state = 'deleting' LIMIT ?", [request.limit])
    return { ok: keys.map(key => load(port, key)) }
  },
}

/** The requests come from this member's own index adapter; only the name of the read is checked. */
export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const request = input as ReadRequest
    if (!READS.includes(request.read)) return { kind: 'failed', diagnostic: 'unknown_media_read' }
    return { kind: 'read', output: RUN[request.read](port, request) as JsonValue }
  },
} satisfies ReadHandlerModule
