// R3: one ordinary input of one session, by its input identity.
import { handler, oneRow, scopeOf, text } from './support.ts'

export default handler('session.input', (input, port) => {
  const scope = scopeOf(input)
  const id = (input as { input?: unknown }).input
  if (scope === null || typeof id !== 'string') throw new Error('invalid input')
  const journal = oneRow(
    port,
    'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (journal === undefined) return { kind: 'absent' }
  const row = oneRow(
    port,
    'SELECT value FROM sl_input WHERE tenant = ? AND session = ? AND input = ? LIMIT 1',
    [scope.tenant, scope.session, id],
  )
  return row === undefined
    ? { kind: 'no-input' }
    : { kind: 'input', value: JSON.parse(text(row['value'])) }
})
