// The version of the `readWork` answer of one session (SPEC RT-04): the Session tail and the Agent
// publication count, by two primary-key point reads in one snapshot. It reads no snapshot row (not
// even `sl_state.covered`, which SQLite reaches only past the overflow pages of the snapshot text),
// no entry and no index row, so its rows and bytes do not depend on the size of the session.
import { handler, oneRow, scopeOf, text } from './support.ts'

export default handler('session.work-version', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const row = oneRow(
    port,
    `SELECT j.tail AS tail, r.published AS published
       FROM sl_journal j
       LEFT JOIN er_root r ON r.tenant = j.tenant AND r.session = j.session
      WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
    [scope.tenant, scope.session],
  )
  if (row === undefined) return { kind: 'absent' }
  return {
    kind: 'version',
    tail: text(row['tail']),
    published: row['published'] === null ? '0' : text(row['published']),
  }
})
