// The version of the `readWork` answer of one session (SPEC RT-04): the Session tail, the tail the
// snapshot row covers, and the Agent publication count, by three primary-key point reads in one
// snapshot. It reads no snapshot text, no entry and no index row, so its rows and bytes do not
// depend on the size of the session.
import { handler, oneRow, scopeOf, text } from './support.ts'

export default handler('session.work-version', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const row = oneRow(
    port,
    `SELECT j.tail AS tail, s.covered AS covered, r.published AS published
       FROM sl_journal j
       LEFT JOIN sl_state s ON s.tenant = j.tenant AND s.session = j.session
       LEFT JOIN er_root r ON r.tenant = j.tenant AND r.session = j.session
      WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
    [scope.tenant, scope.session],
  )
  if (row === undefined) return { kind: 'absent' }
  return {
    kind: 'version',
    tail: text(row['tail']),
    covered: row['covered'] === null ? null : text(row['covered']),
    published: row['published'] === null ? '0' : text(row['published']),
  }
})
