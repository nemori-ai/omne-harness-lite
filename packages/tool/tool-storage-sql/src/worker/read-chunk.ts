// One chunk of one custody operation of one tenant (`snapshot`), as base64.
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { parseChunkInput, type ChunkReadOutput } from './facts.ts'
import { CHUNK_READ_HANDLER, PROTOCOL } from './schema.ts'
import { oneRow } from './support.ts'

const handler: ReadHandlerModule = {
  handler: CHUNK_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const address = parseChunkInput(input)
    if (address === null) return { kind: 'failed', diagnostic: 'not a chunk address' }
    const row = oneRow(
      port,
      `SELECT data FROM tl_chunk WHERE tenant = ? AND call = ? AND operation = ? AND idx = ? LIMIT 1`,
      [address.tenant, address.call, address.operation, BigInt(address.index)],
    )
    const data = row?.['data']
    const output: ChunkReadOutput = {
      data: data instanceof Uint8Array ? Buffer.from(data).toString('base64') : null,
    }
    return { kind: 'read', output }
  },
}
export default handler
