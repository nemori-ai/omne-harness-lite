import { handler, PAGE_BYTES, PAGE_ROWS } from './support.ts'
import { readSharedBlob } from './shared-blobs.ts'

// Content blocks by digest, as many as fit one page; digests the store does not hold are `missing`.
export default handler('execution-record.blobs', (input, port) => {
  const value =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const { tenant, digests } = value
  if (
    typeof tenant !== 'string' ||
    tenant === '' ||
    !Array.isArray(digests) ||
    digests.length === 0 ||
    digests.length > PAGE_ROWS ||
    !digests.every(digest => typeof digest === 'string' && digest !== '') ||
    new Set(digests).size !== digests.length
  )
    throw new Error('invalid input')
  const blobs: { digest: string; media: string; size: string; payload: string }[] = []
  const missing: string[] = []
  let bytes = 0
  let index = 0
  for (; index < digests.length && (blobs.length === 0 || bytes < PAGE_BYTES); index += 1) {
    const digest = digests[index] as string
    const row = readSharedBlob(port, tenant, digest)
    if (row === null) {
      missing.push(digest)
      continue
    }
    const size = Buffer.byteLength(row.payload)
    bytes += size
    blobs.push({ digest, media: row.media, size: String(size), payload: row.payload })
  }
  return { kind: 'blobs', blobs, missing, rest: digests.slice(index) as string[] }
})
