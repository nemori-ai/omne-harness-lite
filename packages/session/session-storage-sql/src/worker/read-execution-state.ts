// The publication count and the opaque state of the Agent records of one session, in one snapshot.
import type { JsonValue } from '@omne-harness/sql-contract'
import { big, handler, oneRow, scopeOf, text } from './support.ts'

export default handler('execution-record.state', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const row = oneRow(
    port,
    `SELECT r.published AS published, s.state AS state
       FROM er_root r LEFT JOIN er_state s ON s.tenant = r.tenant AND s.session = r.session
      WHERE r.tenant = ? AND r.session = ? LIMIT 1`,
    [scope.tenant, scope.session],
  )
  if (row === undefined) return { published: '0', state: null }
  return {
    published: String(big(row['published'])),
    state: row['state'] === null ? null : (JSON.parse(text(row['state'])) as JsonValue),
  }
})
