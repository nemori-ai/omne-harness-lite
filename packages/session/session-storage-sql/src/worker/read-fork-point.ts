import { forkPointAfterRows } from '@omne-harness/session-contract'
import { forkOf } from './fork.ts'
import { big, handler, oneRow, rowsOf, scopeOf, text } from './support.ts'

/** The newest rows looked at for the asking message: a step leaves fewer rows behind it. */
export const FORK_POINT_WINDOW = 64

export default handler('session.fork-point', (raw, port) => {
  const scope = scopeOf(raw)
  if (scope === null) throw new Error('invalid input')
  const bind = [scope.tenant, scope.session]
  const journal = oneRow(
    port,
    'SELECT epoch FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    bind,
  )
  if (journal === undefined) return { kind: 'absent' }
  const epoch = text(journal['epoch'])
  const forked = forkOf(port, scope)?.position ?? 0n
  // Only a row the session wrote itself can be its asking message: its entry lies above the fork.
  const newest = rowsOf(
    port,
    `SELECT seq, CASE WHEN json_valid(message) THEN json_extract(message, '$.role')
      ELSE 'compaction' END AS role FROM sl_model_view
      WHERE tenant = ? AND session = ? AND epoch = ? AND CAST(entry AS INTEGER) > ?
      ORDER BY seq DESC LIMIT ?`,
    [...bind, epoch, forked, BigInt(FORK_POINT_WINDOW)],
  )
  const head = oneRow(
    port,
    'SELECT COALESCE(MAX(position), ?) AS p FROM sl_entry WHERE tenant = ? AND session = ? LIMIT 1',
    [forked, ...bind],
  )
  const rows = newest.reverse().map(row => ({ seq: String(row['seq']), role: text(row['role']) }))
  const point = forkPointAfterRows(epoch, rows, String(big(head?.['p'] ?? forked)))
  return point === null ? { kind: 'none' } : { kind: 'point', point }
})
