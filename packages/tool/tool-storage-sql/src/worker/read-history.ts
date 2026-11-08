import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { isObject, rowsOf, text, integer } from './support.ts'
import { PROTOCOL } from './schema.ts'

export const HISTORY_READ_HANDLER = 'tool.history.copies'
export const HISTORY_COPY_LIMIT = 1024
const handler: ReadHandlerModule = {
  handler: HISTORY_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    if (!isObject(input) || typeof input.tenant !== 'string' || typeof input.call !== 'string')
      return { kind: 'failed', diagnostic: 'invalid historical call address' }
    const address = [input.tenant, input.call]
    const copies = rowsOf(
      port,
      `SELECT operation, kind, digest, bytes, chunks, sha256, seal, answer FROM tl_manifest
      WHERE tenant = ? AND call = ? ORDER BY operation LIMIT ?`,
      [...address, BigInt(HISTORY_COPY_LIMIT + 1)],
    )
    const unsealed = rowsOf(
      port,
      `SELECT DISTINCT c.operation FROM tl_chunk c
      WHERE c.tenant = ? AND c.call = ? AND NOT EXISTS
      (SELECT 1 FROM tl_manifest m WHERE m.tenant = c.tenant AND m.call = c.call AND m.operation = c.operation)
      ORDER BY c.operation LIMIT ?`,
      [...address, BigInt(HISTORY_COPY_LIMIT + 1)],
    )
    if (copies.length > HISTORY_COPY_LIMIT || unsealed.length > HISTORY_COPY_LIMIT)
      return { kind: 'failed', diagnostic: 'historical copy inventory exceeds its limit' }
    return {
      kind: 'read',
      output: {
        copies: copies.map(row => ({
          operation: text(row.operation),
          kind: text(row.kind),
          digest: text(row.digest),
          bytes: integer(row.bytes),
          chunks: integer(row.chunks),
          sha256: text(row.sha256),
          seal: text(row.seal),
          answer: text(row.answer),
        })),
        unsealed: unsealed.map(row => text(row.operation)),
      },
    }
  },
}
export default handler
