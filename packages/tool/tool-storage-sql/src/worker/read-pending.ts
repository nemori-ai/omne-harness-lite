// 一个租户的待办标记的一页（`domain-serial`）：按主键 `(tenant, call)` 的键集，从 `after` 之后取
// 最多 `limit` 个调用身份。只读标记表，不读调用记录。
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { parsePendingInput, type PendingReadOutput } from './facts.ts'
import { PENDING_READ_HANDLER, PROTOCOL } from './schema.ts'
import { rowsOf, text } from './support.ts'

const handler: ReadHandlerModule = {
  handler: PENDING_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const parsed = parsePendingInput(input)
    if (parsed === null) return { kind: 'failed', diagnostic: 'not a pending page request' }
    const rows = rowsOf(
      port,
      `SELECT call FROM tl_pending WHERE tenant = ? ${parsed.after === null ? '' : 'AND call > ?'}
        ORDER BY call LIMIT ?`,
      [parsed.tenant, ...(parsed.after === null ? [] : [parsed.after]), BigInt(parsed.limit + 1)],
    )
    const output: PendingReadOutput = {
      calls: rows.slice(0, parsed.limit).map(row => text(row['call'])),
      more: rows.length > parsed.limit,
    }
    return { kind: 'read', output }
  },
}
export default handler
