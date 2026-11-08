import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { MAINTENANCE_READ_HANDLER, parseMaintenanceScan } from '../maintenance-scan-wire.ts'
import { PROTOCOL } from './schema.ts'
import { integer, oneRow, rowsOf, text } from './support.ts'

const handler: ReadHandlerModule = {
  handler: MAINTENANCE_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const request = parseMaintenanceScan(input)
    if (request === null) return { kind: 'failed', diagnostic: 'invalid maintenance scan' }
    let through = request.through
    if (through === null) {
      const head = oneRow(
        port,
        'SELECT sequence FROM tl_material_maintenance WHERE tenant = ? ORDER BY sequence DESC LIMIT 1',
        [request.tenant],
      )
      through = head === undefined ? '0' : integer(head['sequence'])
    }
    const rows = rowsOf(
      port,
      `SELECT sequence, call, hint, due_at FROM tl_material_maintenance
       WHERE tenant = ? AND sequence > ? AND sequence <= ? AND hint != 'none'
       ORDER BY sequence LIMIT ?`,
      [request.tenant, BigInt(request.after), BigInt(through), BigInt(request.limit + 1)],
    )
    const page = rows.slice(0, request.limit)
    const calls: string[] = []
    for (const row of page) {
      const hint = text(row['hint'])
      if (hint === 'due') {
        const due = Date.parse(text(row['due_at']))
        if (!Number.isFinite(due))
          return { kind: 'failed', diagnostic: 'invalid maintenance deadline' }
        if (due > Date.parse(request.at)) continue
      } else if (hint !== 'unknown' && hint !== 'ready')
        return { kind: 'failed', diagnostic: 'invalid maintenance hint' }
      calls.push(text(row['call']))
    }
    const last = page.at(-1)
    return {
      kind: 'read',
      output: {
        calls,
        through,
        after: last === undefined ? through : integer(last['sequence']),
        more: rows.length > request.limit,
      },
    }
  },
}
export default handler
