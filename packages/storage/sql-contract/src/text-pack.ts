import { deflateRawSync, inflateRawSync } from 'node:zlib'

const PLAIN = 0
const DEFLATED = 1
const PACK_THRESHOLD_BYTES = 128

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
