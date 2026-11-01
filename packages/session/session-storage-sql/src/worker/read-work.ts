// R1: the authoritative snapshot of one session.
import { big, handler, oneRow, scopeOf, text } from './support.ts'

export default handler('session.work', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const row = oneRow(
    port,
    `SELECT s.snapshot AS snapshot, s.covered AS covered, j.tail AS tail
       FROM sl_journal j LEFT JOIN sl_state s ON s.tenant = j.tenant AND s.session = j.session
      WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
    [scope.tenant, scope.session],
  )
  if (row === undefined) return { kind: 'absent' }
  if (row['snapshot'] === null || big(row['covered']) !== big(row['tail'])) return { kind: 'behind' }
  return { kind: 'state', snapshot: JSON.parse(text(row['snapshot'])) }
})
