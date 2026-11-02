// The session, Run and SE13 position of one execution of one tenant, or null when no Run of the
// tenant started it. Another tenant's execution and an execution that never started give the same
// null.
import { big, handler, oneRow, text } from './support.ts'

export default handler('session.execution', (input, port) => {
  const value =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const { tenant, execution } = value
  if (
    typeof tenant !== 'string' ||
    tenant === '' ||
    typeof execution !== 'string' ||
    execution === ''
  )
    throw new Error('invalid input')
  const row = oneRow(
    port,
    'SELECT session, run, position FROM sl_execution_idx WHERE tenant = ? AND execution = ? LIMIT 1',
    [tenant, execution],
  )
  return row === undefined
    ? null
    : {
        session: text(row['session']),
        run: text(row['run']),
        position: String(big(row['position'])),
      }
})
