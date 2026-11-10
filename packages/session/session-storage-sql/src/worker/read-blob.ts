// One content block of the tenant by its digest (TB-04). A digest the tenant does not hold answers
// `denied`, whether no block has it or a block of another tenant has it: the answer tells nothing
// of another tenant.
import { big, handler, oneRow, packed, text } from './support.ts'

export default handler('execution-record.blob', (input, port) => {
  const value =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const { tenant, digest } = value
  if (typeof tenant !== 'string' || tenant === '' || typeof digest !== 'string' || digest === '')
    throw new Error('invalid input')
  const row = oneRow(
    port,
    'SELECT media, size, payload FROM sl_blob WHERE tenant = ? AND digest = ? LIMIT 1',
    [tenant, digest],
  )
  return row === undefined
    ? { kind: 'denied' }
    : {
        kind: 'blob',
        digest,
        media: text(row['media']),
        size: String(big(row['size'])),
        payload: packed(row['payload']),
      }
})
