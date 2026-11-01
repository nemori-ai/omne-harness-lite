// R11: the scopes that archived sessions of one tenant released, one page after (session, scope).
import { handler, rowsOf, text } from './support.ts'

type Input = Readonly<{
  tenant: string
  after: { session: string; scope: string } | null
  limit: number
}>

export default handler('session.released-scopes', (raw, port) => {
  const input = raw as unknown as Input
  if (
    typeof input.tenant !== 'string' ||
    input.tenant === '' ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 1000
  )
    throw new Error('invalid input')
  const rows = rowsOf(
    port,
    `SELECT session, scope, data FROM sl_released_scope_idx
      WHERE tenant = ? ${input.after === null ? '' : 'AND (session > ? OR (session = ? AND scope > ?))'}
      ORDER BY session, scope LIMIT ?`,
    [
      input.tenant,
      ...(input.after === null
        ? []
        : [input.after.session, input.after.session, input.after.scope]),
      BigInt(input.limit + 1),
    ],
  )
  return {
    rows: rows.slice(0, input.limit).map(row => ({
      session: text(row['session']),
      data: JSON.parse(text(row['data'])),
    })),
    more: rows.length > input.limit,
  }
})
