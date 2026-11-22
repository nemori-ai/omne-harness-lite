import { handler } from './support.ts'
import { readBlock } from './execution-blocks.ts'

export default handler('execution-record.blob', (input, port) => {
  const value =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const { tenant, execution, digest } = value
  if (
    typeof tenant !== 'string' ||
    tenant === '' ||
    typeof digest !== 'string' ||
    digest === '' ||
    (execution !== undefined && (typeof execution !== 'string' || execution === ''))
  )
    throw new Error('invalid input')
  const row = readBlock(port, tenant, (execution as string | undefined) ?? null, digest)
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
