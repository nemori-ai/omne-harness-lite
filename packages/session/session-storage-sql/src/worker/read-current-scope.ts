import { handler, oneRow, scopeOf, big, packed } from './support.ts'

export default handler('session.current-scope', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const key = [scope.tenant, scope.session]
  const journal = oneRow(
    port,
    'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    key,
  )
  if (journal === undefined) return { kind: 'absent' }
  const state = oneRow(
    port,
    'SELECT covered FROM sl_state WHERE tenant = ? AND session = ? LIMIT 1',
    key,
  )
  if (state === undefined || big(state['covered']) !== big(journal['tail']))
    return { kind: 'behind' }
  const last = oneRow(
    port,
    'SELECT value FROM sl_state_item WHERE tenant = ? AND session = ? AND path = ? ORDER BY seq DESC LIMIT 1',
    [...key, 'contextScopes'],
  )
  if (last === undefined) return { kind: 'scope', value: null }
  const items: unknown = JSON.parse(packed(last['value']))
  if (!Array.isArray(items) || items.length === 0)
    throw new Error('the current scope chunk is not a nonempty list')
  return { kind: 'scope', value: items.at(-1) }
})
