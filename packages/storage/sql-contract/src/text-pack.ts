// The stored form of a large text column (SPEC §10.1). The first byte is the format marker: 0 is
// the UTF-8 text as it is, 1 is the UTF-8 text compressed with raw DEFLATE. A text shorter than
// the threshold is kept as it is.
import { deflateRawSync, inflateRawSync } from 'node:zlib'

const PLAIN = 0
const DEFLATED = 1
/** Below this many UTF-8 bytes compression saves less than the work it costs. */
const PACK_THRESHOLD_BYTES = 128

/** The bytes to store for `text`. */
export function packText(text: string): Uint8Array {
  const length = Buffer.byteLength(text, 'utf8')
  if (length < PACK_THRESHOLD_BYTES) {
    const plain = Buffer.allocUnsafe(1 + length)
    plain[0] = PLAIN
    plain.write(text, 1, 'utf8')
    return plain
  }
  return Buffer.concat([Uint8Array.of(DEFLATED), deflateRawSync(Buffer.from(text, 'utf8'))])
}

/** The text that `packText` stored. Throws for bytes without a known format marker. */
export function unpackText(bytes: Uint8Array): string {
  if (bytes.length === 0) throw new Error('packed text has no format marker')
  const body = bytes.subarray(1)
  switch (bytes[0]) {
    case PLAIN:
      return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString('utf8')
    case DEFLATED:
      return inflateRawSync(body).toString('utf8')
    default:
      throw new Error(`packed text has unknown format marker ${String(bytes[0])}`)
  }
}
