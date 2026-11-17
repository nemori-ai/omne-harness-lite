import { handler } from './support.ts'
import { readSharedBlob } from './shared-blobs.ts'

export default handler('execution-record.blob', (input, port) => {
  const value =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const { tenant, digest } = value
  if (typeof tenant !== 'string' || tenant === '' || typeof digest !== 'string' || digest === '')
    throw new Error('invalid input')
  const row = readSharedBlob(port, tenant, digest)
  return row === null
    ? { kind: 'denied' }
    : {
        kind: 'blob',
        digest,
        media: row.media,
        size: String(Buffer.byteLength(row.payload)),
        payload: row.payload,
      }
})
