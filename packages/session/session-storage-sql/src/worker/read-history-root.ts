// The common log root G of one session in one snapshot (FR-03 step 2): the Session position and the
// Agent publication count are read by one handler call, never by two reads put together.
import { encodeValue } from '../codec.ts'
import { logRoot } from './log-root.ts'
import { handler, oneRow, scopeOf, text } from './support.ts'

export default handler('session.history-root', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const journal = oneRow(
    port,
    'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  const revision = journal === undefined ? null : text(journal['tail'])
  const root = logRoot(port, scope.tenant, scope.session, revision ?? '0')
  return encodeValue({ ...root, revision })
})
