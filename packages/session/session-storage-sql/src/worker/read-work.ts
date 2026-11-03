// R1: the authoritative snapshot of one session, with the history index of its pending inputs read
// in the same snapshot (the memory pair of session-contract answers `readWork` the same way). The
// index is a read projection: it is never stored in the snapshot row. Over the read bound the
// snapshot comes without an index, which the pure layer reads as unknown, never as empty. The
// answer names the version it was read at, so the work cache keeps it under that version.
import type { WorkSnapshot } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue } from '../codec.ts'
import { readHistory } from './history-index.ts'
import { big, handler, oneRow, scopeOf, text } from './support.ts'

/** The rows the index may read in one handler call, below the row bound of the handler (2000). */
const INDEX_ROWS = 1000

export default handler('session.work', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const row = oneRow(
    port,
    `SELECT s.snapshot AS snapshot, s.covered AS covered, j.tail AS tail, r.published AS published
       FROM sl_journal j
       LEFT JOIN sl_state s ON s.tenant = j.tenant AND s.session = j.session
       LEFT JOIN er_root r ON r.tenant = j.tenant AND r.session = j.session
      WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
    [scope.tenant, scope.session],
  )
  if (row === undefined) return { kind: 'absent' }
  if (row['snapshot'] === null || big(row['covered']) !== big(row['tail']))
    return { kind: 'behind' }
  const body = text(row['snapshot'])
  const stored = JSON.parse(body) as JsonValue
  const snapshot = decodeValue(stored) as WorkSnapshot
  const history = readHistory(
    port,
    scope.tenant,
    scope.session,
    snapshot,
    { kind: 'pending', inputs: snapshot.pending },
    INDEX_ROWS,
  )
  return {
    kind: 'state',
    // The version this answer was read at, from the same snapshot (SPEC RT-04), and the length of
    // the stored text, which the work cache counts against its byte bound.
    tail: text(row['tail']),
    covered: text(row['covered']),
    published: row['published'] === null ? '0' : text(row['published']),
    bytes: body.length,
    snapshot:
      history === 'too-many' ? stored : encodeValue({ ...snapshot, historyIndex: history.index }),
  }
})
