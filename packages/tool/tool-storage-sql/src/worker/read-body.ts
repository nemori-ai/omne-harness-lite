// A range of one body of one tenant (`snapshot`): its manifest, when sealed, and the chunks in
// `[first, first + count)` as base64. A body without a manifest reads as absent.
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { parseBodyReadInput, type BodyReadOutput } from './facts.ts'
import { BODY_READ_CHUNKS, BODY_READ_HANDLER, PROTOCOL } from './schema.ts'
import { integer, oneRow, rowsOf, text } from './support.ts'

const handler: ReadHandlerModule = {
  handler: BODY_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const address = parseBodyReadInput(input)
    if (address === null) return { kind: 'failed', diagnostic: 'not a body range' }
    if (address.count > BODY_READ_CHUNKS)
      return {
        kind: 'failed',
        diagnostic: `a body read returns at most ${BODY_READ_CHUNKS} chunks`,
      }
    const key = [address.tenant, address.call, address.body] as const
    const manifest = oneRow(
      port,
      'SELECT chunks, bytes, digest FROM tl_body_manifest WHERE tenant = ? AND call = ? AND body = ? LIMIT 1',
      key,
    )
    if (manifest === undefined) {
      const output: BodyReadOutput = { manifest: null, chunks: [] }
      return { kind: 'read', output }
    }
    const rows = rowsOf(
      port,
      `SELECT seq, data FROM tl_body_chunk WHERE tenant = ? AND call = ? AND body = ?
        AND seq >= ? AND seq < ? ORDER BY seq LIMIT ?`,
      [...key, BigInt(address.first), BigInt(address.first + address.count), BigInt(address.count)],
    )
    const output: BodyReadOutput = {
      manifest: {
        chunks: Number(integer(manifest['chunks'])),
        bytes: Number(integer(manifest['bytes'])),
        digest: text(manifest['digest']),
      },
      chunks: rows.map(row => {
        const data = row['data']
        if (!(data instanceof Uint8Array)) throw new TypeError('a BLOB cell was expected')
        return { seq: Number(integer(row['seq'])), data: Buffer.from(data).toString('base64') }
      }),
    }
    return { kind: 'read', output }
  },
}
export default handler
