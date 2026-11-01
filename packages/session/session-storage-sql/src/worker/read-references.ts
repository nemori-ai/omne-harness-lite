// R10: the sessions of one tenant that hold a resident key, one page after (session, capability).
import { handler, rowsOf, text } from './support.ts'

type Input = Readonly<{
  tenant: string
  key: string
  after: { session: string; capability: string } | null
  limit: number
}>

export default handler('session.references', (raw, port) => {
  const input = raw as unknown as Input
  if (
    typeof input.tenant !== 'string' ||
    input.tenant === '' ||
    typeof input.key !== 'string' ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 1000
  )
    throw new Error('invalid input')
  const rows = rowsOf(
    port,
    `SELECT session, capability, shape FROM sl_resident_idx
      WHERE resident_key = ? AND tenant = ?
        ${input.after === null ? '' : 'AND (session > ? OR (session = ? AND capability > ?))'}
      ORDER BY session, capability LIMIT ?`,
    [
      input.key,
      input.tenant,
      ...(input.after === null
        ? []
        : [input.after.session, input.after.session, input.after.capability]),
      BigInt(input.limit + 1),
    ],
  )
  return {
    rows: rows.slice(0, input.limit).map(row => ({
      session: text(row['session']),
      capability: text(row['capability']),
      shape: JSON.parse(text(row['shape'])),
    })),
    more: rows.length > input.limit,
  }
})
