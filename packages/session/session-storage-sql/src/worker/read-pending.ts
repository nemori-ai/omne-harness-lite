// R8: the sessions of one tenant that have work, one page after a session identity.
import { handler, rowsOf, text } from './support.ts'

type Input = Readonly<{
  tenant: string
  reason: string | null
  after: string | null
  limit: number
}>

export default handler('session.pending', (raw, port) => {
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
    `SELECT DISTINCT session FROM sl_pending_idx
      WHERE tenant = ? ${input.reason === null ? '' : 'AND reason = ?'}
        ${input.after === null ? '' : 'AND session > ?'}
      ORDER BY session LIMIT ?`,
    [
      input.tenant,
      ...(input.reason === null ? [] : [input.reason]),
      ...(input.after === null ? [] : [input.after]),
      BigInt(input.limit + 1),
    ],
  )
  return {
    sessions: rows.slice(0, input.limit).map(row => text(row['session'])),
    more: rows.length > input.limit,
  }
})
