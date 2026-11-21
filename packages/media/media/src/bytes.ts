import { createHash } from 'node:crypto'
import { digestText } from '@omne-harness/media-contract'

export function digestOf(bytes: Uint8Array): string {
  return digestText(createHash('sha256').update(bytes).digest('hex'))
}

export async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  for await (const chunk of chunks) parts.push(chunk)
  return new Uint8Array(Buffer.concat(parts))
}

/** The parts of `bytes`, each at most `size` long. */
export function* partsOf(bytes: Uint8Array, size: number): Iterable<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += size)
    yield bytes.subarray(offset, offset + size)
}
