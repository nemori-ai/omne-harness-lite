import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { HISTORY_SCAN_HANDLER, parseHistoryScan } from '../history-scan-wire.ts'
import { PROTOCOL } from './schema.ts'
import { rowsOf, text } from './support.ts'

const handler: ReadHandlerModule = {
  handler: HISTORY_SCAN_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const request = parseHistoryScan(input)
    if (request === null) return { kind: 'failed', diagnostic: 'invalid historical inventory scan' }
    const position = [request.tenant, request.after ?? '']
    const comparison = request.after === null ? '>=' : '>'
    const rows = rowsOf(
      port,
      `
      SELECT name AS call FROM tl_domain WHERE tenant = ? AND kind = 'call' AND name ${comparison} ?
      UNION SELECT name AS call FROM tl_record WHERE tenant = ? AND kind = 'call' AND name ${comparison} ?
      UNION SELECT call FROM tl_manifest WHERE tenant = ? AND call ${comparison} ?
      UNION SELECT call FROM tl_chunk WHERE tenant = ? AND call ${comparison} ?
      UNION SELECT call FROM tl_material WHERE tenant = ? AND call ${comparison} ?
      UNION SELECT call FROM tl_material_chunk WHERE tenant = ? AND call ${comparison} ?
      ORDER BY call LIMIT ?`,
      [
        ...position,
        ...position,
        ...position,
        ...position,
        ...position,
        ...position,
        BigInt(request.limit + 1),
      ],
    )
    return {
      kind: 'read',
      output: {
        calls: rows.slice(0, request.limit).map(row => text(row['call'])),
        more: rows.length > request.limit,
      },
    }
  },
}
export default handler
