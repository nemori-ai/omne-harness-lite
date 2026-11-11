// The request body as the storage writes it: the JSON text of the fixed request, cut into chunks
// that each fit one command of the storage provider. Nothing here reads or writes the store.
import type { FixedModelRequest } from '@omne-harness/model-contract'

const HIGH_SURROGATE_FIRST = 0xd800
const HIGH_SURROGATE_LAST = 0xdbff

/** The UTF-8 size of the text as a JSON string, which is how a chunk travels in the facts. */
const encodedBytes = (text: string): number => Buffer.byteLength(JSON.stringify(text), 'utf8')

/** The end of a slice that starts at `from` and has about `size` code units, on a pair boundary. */
function sliceEnd(text: string, from: number, size: number): number {
  const end = Math.min(text.length, from + size)
  const last = text.charCodeAt(end - 1)
  const splits = end < text.length && last >= HIGH_SURROGATE_FIRST && last <= HIGH_SURROGATE_LAST
  return splits && end - 1 > from ? end - 1 : end
}

/**
 * Cuts the text into chunks whose encoded size is at most `bytes`. The chunks put together are
 * the text. A chunk is at least one character, so `bytes` must hold the largest encoded character.
 */
export function chunksOf(text: string, bytes: number): readonly string[] {
  const chunks: string[] = []
  for (let from = 0; from < text.length;) {
    // A code unit is at least one encoded byte, so no chunk has more than `bytes` code units.
    let size = bytes
    let end = sliceEnd(text, from, size)
    for (let encoded = encodedBytes(text.slice(from, end)); encoded > bytes && size > 1;) {
      size = Math.max(1, Math.min(size - 1, Math.floor((size * bytes) / encoded)))
      end = sliceEnd(text, from, size)
      encoded = encodedBytes(text.slice(from, end))
    }
    chunks.push(text.slice(from, end))
    from = end
  }
  return chunks
}

/** The chunks of one request body. A request is never the empty text, so there is at least one. */
export function requestChunks(request: FixedModelRequest, bytes: number): readonly string[] {
  return chunksOf(JSON.stringify(request), bytes)
}
