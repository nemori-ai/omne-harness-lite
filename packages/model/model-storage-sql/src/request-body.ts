import type { FixedModelRequest } from '@omne-harness/model-contract'

const HIGH_SURROGATE_FIRST = 0xd800
const HIGH_SURROGATE_LAST = 0xdbff

const encodedBytes = (text: string): number => Buffer.byteLength(JSON.stringify(text), 'utf8')

function sliceEnd(text: string, from: number, size: number): number {
  const end = Math.min(text.length, from + size)
  const last = text.charCodeAt(end - 1)
  const splits = end < text.length && last >= HIGH_SURROGATE_FIRST && last <= HIGH_SURROGATE_LAST
  return splits && end - 1 > from ? end - 1 : end
}

// Chunks of at most `bytes` encoded bytes; a chunk is at least one character, so `bytes` must
// hold the largest encoded character.
export function chunksOf(text: string, bytes: number): readonly string[] {
  const chunks: string[] = []
  for (let from = 0; from < text.length;) {
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

export function requestChunks(request: FixedModelRequest, bytes: number): readonly string[] {
  return chunksOf(JSON.stringify(request), bytes)
}
