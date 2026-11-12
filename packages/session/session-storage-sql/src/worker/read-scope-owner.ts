// The session that minted one Context scope of one tenant: one point read of `sl_scope_idx`.
import { handler, oneRow, text } from './support.ts'

export default handler('session.scope-owner', (raw, port) => {
  const input = raw as Readonly<{ tenant?: unknown; scope?: unknown }>
  if (
    typeof input.tenant !== 'string' ||
    input.tenant === '' ||
    typeof input.scope !== 'string' ||
    input.scope === ''
  )
    throw new Error('invalid input')
  const row = oneRow(
    port,
    'SELECT session, generation FROM sl_scope_idx WHERE tenant = ? AND scope = ? LIMIT 1',
    [input.tenant, input.scope],
  )
  return row === undefined
    ? { kind: 'unknown' }
    : { kind: 'owned', session: text(row['session']), generation: text(row['generation']) }
})
