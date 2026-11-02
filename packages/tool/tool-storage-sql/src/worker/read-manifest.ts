// The manifest of one custody operation of one tenant (`snapshot`): absent until the manifest is
// committed, then immutable.
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { custodyAddressOf, type ManifestReadOutput } from './facts.ts'
import { MANIFEST_READ_HANDLER, PROTOCOL } from './schema.ts'
import { integer, oneRow, text } from './support.ts'

const handler: ReadHandlerModule = {
  handler: MANIFEST_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const address = custodyAddressOf(input)
    if (address === null) return { kind: 'failed', diagnostic: 'not a custody address' }
    const row = oneRow(
      port,
      `SELECT kind, digest, bytes, chunks, sha256, seal, answer FROM tl_manifest
        WHERE tenant = ? AND call = ? AND operation = ? LIMIT 1`,
      [address.tenant, address.call, address.operation],
    )
    const kind = row?.['kind']
    const output: ManifestReadOutput = {
      manifest:
        row === undefined || (kind !== 'raw' && kind !== 'retain')
          ? null
          : {
              kind,
              digest: text(row['digest']),
              bytes: integer(row['bytes']),
              chunks: integer(row['chunks']),
              sha256: text(row['sha256']),
              seal: text(row['seal']),
              answer: JSON.parse(text(row['answer'])) as JsonValue,
            },
    }
    return { kind: 'read', output }
  },
}
export default handler
