// R1: the authoritative snapshot of one session, with the history index of its pending inputs read
// in the same snapshot (the memory pair of session-contract answers `readWork` the same way). The
// index is a read projection: it is never stored in the snapshot row. Over the read bound the
// snapshot comes without an index, which the pure layer reads as unknown, never as empty. The
// answer names the version it was read at, so the work cache keeps it under that version.
import type { WorkSnapshot } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue } from '../codec.ts'
import { workIndexOf } from './history-index.ts'
import { big, handler, oneRow, readVersion, scopeOf, text } from './support.ts'

export default handler('session.work', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const version = readVersion(port, scope)
  if (version === undefined) return { kind: 'absent' }
  const row = oneRow(
    port,
    'SELECT snapshot, covered FROM sl_state WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (row === undefined || row['snapshot'] === null || big(row['covered']) !== big(version.tail))
    return { kind: 'behind' }
  const body = text(row['snapshot'])
  const stored = JSON.parse(body) as JsonValue
  const snapshot = decodeValue(stored) as WorkSnapshot
  const history = workIndexOf(port, scope.tenant, scope.session, snapshot)
  return {
    kind: 'state',
    // The version this answer was read at, from the same snapshot (SPEC RT-04), and the length of
    // the stored text, which the work cache counts against its byte bound.
    tail: version.tail,
    covered: text(row['covered']),
    published: version.published,
    bytes: body.length,
    snapshot:
      history === 'too-many' ? stored : encodeValue({ ...snapshot, historyIndex: history.index }),
  }
})
