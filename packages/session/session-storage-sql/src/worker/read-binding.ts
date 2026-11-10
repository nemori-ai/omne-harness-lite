// The ownership of one session and the evidence that established it (D-AUTH r4 4.1): the journal
// row proves that the session exists in the tenant, and the entries of its first batch, the batch
// that created it, give the evidence of that batch through the pure `batchEvidence` of
// session-contract. Neither changes after the first commit. It reads no snapshot row, no index row
// and no entry past the first batch, so its rows and bytes do not depend on the size of the session.
import { batchEvidence } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { readEntryText } from '../entry-codec.ts'
import { big, handler, oneRow, packed, PAGE_ROWS, rowsOf, scopeOf, text } from './support.ts'

/** The revision of the batch that creates a session: the first commit after the journal row is made. */
const CREATING_REVISION = 1n

export default handler('session.binding', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const journal = oneRow(
    port,
    'SELECT tenant, session FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (journal === undefined) return { kind: 'absent' }
  // The positions of the first batch: the rows from position 1 up to the first row of a later
  // revision. Only the two small columns are read to find its end.
  let last = 0n
  for (let done = false; !done;) {
    const page = rowsOf(
      port,
      'SELECT position, revision FROM sl_entry WHERE tenant = ? AND session = ? AND position > ? ORDER BY position LIMIT ?',
      [scope.tenant, scope.session, last, BigInt(PAGE_ROWS)],
    )
    for (const row of page) {
      if (big(row['revision']) !== CREATING_REVISION) {
        done = true
        break
      }
      last = big(row['position'])
    }
    if (page.length < PAGE_ROWS) done = true
  }
  if (last === 0n) return { kind: 'unestablished' }
  const rows = rowsOf(
    port,
    'SELECT entry FROM sl_entry WHERE tenant = ? AND session = ? AND position <= ? ORDER BY position LIMIT ?',
    [scope.tenant, scope.session, last, last],
  )
  const entries = rows.map(row => readEntryText(packed(row['entry'])))
  const source = batchEvidence(
    { revision: String(CREATING_REVISION), entries } as never,
    text(journal['session']),
  )
  return {
    kind: 'bound',
    tenant: text(journal['tenant']),
    session: text(journal['session']),
    source: source as unknown as JsonValue,
  }
})
