import { StoredEntryMalformed } from '../entry-codec.ts'
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
    `SELECT i.session, i.capability, s.shape FROM sl_resident_idx i
      LEFT JOIN sl_resident_shape s ON s.tenant = i.tenant AND s.digest = i.shape_digest
      WHERE i.resident_key = ? AND i.tenant = ?
        ${input.after === null ? '' : 'AND (i.session > ? OR (i.session = ? AND i.capability > ?))'}
      ORDER BY i.session, i.capability LIMIT ?`,
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
    rows: rows.slice(0, input.limit).map(row => {
      const shape = row['shape']
      if (typeof shape !== 'string')
        throw new StoredEntryMalformed('session.references: the shape of a resident row is missing')
      return {
        session: text(row['session']),
        capability: text(row['capability']),
        shape: JSON.parse(shape),
      }
    }),
    more: rows.length > input.limit,
  }
})
