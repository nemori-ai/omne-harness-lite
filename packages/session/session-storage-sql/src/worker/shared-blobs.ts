import { packText } from '@omne-harness/sql-contract/worker'
import { blobDigest } from '../codec.ts'
import { expandContent, splitContent, SHARED_MEDIA, type ContentBlob } from '../shared-content.ts'
import { oneRow, packed, text, type Executor } from './support.ts'

export function storeSharedBlob(port: Executor, tenant: string, blob: ContentBlob): void {
  if (blobDigest(blob.payload) !== blob.digest) throw new TypeError('content digest differs')
  const split = splitContent(blob.payload, blob.media)
  for (const child of split.children) storeSharedBlob(port, tenant, child)
  port.execute(
    'INSERT OR IGNORE INTO sl_blob (tenant, digest, media, size, payload) VALUES (?, ?, ?, ?, ?)',
    [
      tenant,
      blob.digest,
      split.media,
      BigInt(Buffer.byteLength(blob.payload)),
      packText(split.payload),
    ],
  )
}

export function readSharedBlob(port: Executor, tenant: string, digest: string): ContentBlob | null {
  const row = oneRow(
    port,
    'SELECT media, size, payload FROM sl_blob WHERE tenant = ? AND digest = ? LIMIT 1',
    [tenant, digest],
  )
  if (row === undefined) return null
  const restored = expandContent(packed(row['payload']), text(row['media']), child => {
    const value = oneRow(
      port,
      'SELECT media, payload FROM sl_blob WHERE tenant = ? AND digest = ? LIMIT 1',
      [tenant, child],
    )
    if (value === undefined) throw new TypeError('the shared message body is missing')
    if (text(value['media']) === SHARED_MEDIA)
      throw new TypeError('a shared message body cannot be an envelope')
    return packed(value['payload'])
  })
  if (
    blobDigest(restored.payload) !== digest ||
    String(Buffer.byteLength(restored.payload)) !== String(row['size'])
  )
    throw new TypeError('the shared body differs from its digest or size')
  return { digest, ...restored }
}
