import { packText } from '@omne-harness/sql-contract/worker'
import { blobDigest } from '../codec.ts'
import type { ContentBlob } from '../shared-content.ts'
import { readSharedBlob } from './shared-blobs.ts'
import { oneRow, packed, text, type Executor } from './support.ts'

export function storeExecutionBlock(
  port: Executor,
  tenant: string,
  execution: string,
  blob: ContentBlob,
): void {
  if (blobDigest(blob.payload) !== blob.digest) throw new TypeError('content digest differs')
  port.execute(
    'INSERT OR IGNORE INTO er_block (tenant, execution, digest, media, size, payload) VALUES (?, ?, ?, ?, ?, ?)',
    [
      tenant,
      execution,
      blob.digest,
      blob.media,
      BigInt(Buffer.byteLength(blob.payload)),
      packText(blob.payload),
    ],
  )
}

function readExecutionBlock(
  port: Executor,
  tenant: string,
  execution: string,
  digest: string,
): ContentBlob | null {
  const row = oneRow(
    port,
    'SELECT media, size, payload FROM er_block WHERE tenant = ? AND execution = ? AND digest = ? LIMIT 1',
    [tenant, execution, digest],
  )
  if (row === undefined) return null
  const payload = packed(row['payload'])
  if (blobDigest(payload) !== digest || String(Buffer.byteLength(payload)) !== String(row['size']))
    throw new TypeError('the execution block differs from its digest or size')
  return { digest, media: text(row['media']), payload }
}

export function readBlock(
  port: Executor,
  tenant: string,
  execution: string | null,
  digest: string,
): ContentBlob | null {
  const own = execution === null ? null : readExecutionBlock(port, tenant, execution, digest)
  return own ?? readSharedBlob(port, tenant, digest)
}
