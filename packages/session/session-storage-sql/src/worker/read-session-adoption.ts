import type { JsonValue } from '@omne-harness/sql-contract'
import { blobDigest } from '../codec.ts'
import { handler, oneRow, packed, text } from './support.ts'

export default handler('execution-record.session-adoption', (input, port) => {
  const read = input as Readonly<Record<string, unknown>> | null
  const tenant = read?.['tenant']
  const session = read?.['session']
  if (typeof tenant !== 'string' || tenant === '') throw new Error('invalid input')
  if (typeof session !== 'string' || session === '') throw new Error('invalid input')
  const row = oneRow(
    port,
    'SELECT reference, pub, execution, digest, media, size, payload, adoption FROM er_session_adoption WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  if (row === undefined) return { kind: 'adoption', value: null }
  const digest = text(row['digest'])
  const payload = packed(row['payload'])
  if (blobDigest(payload) !== digest || String(Buffer.byteLength(payload)) !== text(row['size']))
    throw new TypeError('the retained adoption differs from its digest or size')
  return {
    kind: 'adoption',
    value: {
      reference: text(row['reference']),
      pub: text(row['pub']),
      execution: text(row['execution']),
      digest,
      media: text(row['media']),
      payload,
      adoption: JSON.parse(text(row['adoption'])) as JsonValue,
    },
  }
})
