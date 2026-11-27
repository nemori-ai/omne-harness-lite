import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { listFollowing, loadCatalog, loadTask, type SqlPort } from './rows.ts'
import { loadClient, loadGrant, type GrantCells } from './rows-grants.ts'
import { HANDLER, PROTOCOL, READS, type ReadName, type TaskRowCells } from './schema.ts'

type ReadRequest = Readonly<{ read: ReadName; key: never; tenant: string; issuer: string }>

const RUN: Record<ReadName, (port: SqlPort, request: ReadRequest) => unknown> = {
  readCatalog(port, request) {
    return { ok: loadCatalog(port, request.key)?.record ?? 'absent' }
  },
  readTask(port, request) {
    const rows = loadTask(port, request.key as TaskRowCells)
    return { ok: rows.length === 0 ? 'absent' : rows.length === 1 ? rows[0] : 'ambiguous' }
  },
  followingTasks(port, request) {
    return { ok: listFollowing(port, request.tenant) }
  },
  readGrant(port, request) {
    return { ok: loadGrant(port, request.key as GrantCells) ?? 'absent' }
  },
  readClient(port, request) {
    return { ok: loadClient(port, request.tenant, request.issuer) }
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
