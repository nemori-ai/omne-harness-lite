// Reading one HTTP body with a byte cap. undici's `fetch` hands out the decompressed stream, so the
// count here is the decompressed size (a gzip bomb is cut at the cap, not at its wire size).
import type { WebFailure } from '@omne-harness/tool-definitions'

export type CappedBody = Readonly<{ bytes: Uint8Array; truncated: boolean }>

/** Reads the stream up to `maxBytes`; a longer body is cut there and the rest is cancelled. */
export async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<CappedBody> {
  if (body === null) return { bytes: new Uint8Array(0), truncated: false }
  const reader = body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const room = maxBytes - size
    if (value.byteLength > room) {
      parts.push(value.subarray(0, room))
      size += room
      truncated = true
      await reader.cancel()
      break
    }
    parts.push(value)
    size += value.byteLength
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return { bytes, truncated }
}

/** Parsed `Content-Type`: the lowercase media type and the charset parameter, when given. */
export type ContentType = Readonly<{ mediaType: string; charset: string | undefined }>

export function parseContentType(header: string | null): ContentType {
  if (header === null || header.trim().length === 0)
    return { mediaType: 'application/octet-stream', charset: undefined }
  const [type = '', ...parameters] = header.split(';')
  const charset = parameters
    .map(parameter => /^\s*charset\s*=\s*"?([^";\s]+)"?\s*$/iu.exec(parameter)?.[1])
    .find(value => value !== undefined)
  return { mediaType: type.trim().toLowerCase(), charset: charset?.toLowerCase() }
}

/** Decodes with the given charset; an unsupported charset is a `not-text` failure, not a guess. */
export function decodeText(
  body: CappedBody,
  contentType: ContentType,
  original: string,
): Readonly<{ ok: string }> | Readonly<{ failure: WebFailure }> {
  const decoder = decoderFor(contentType.charset ?? 'utf-8')
  if (decoder === undefined) return { failure: { kind: 'not-text', mediaType: original } }
  // A cut body may end inside a multibyte character; streaming mode drops the partial tail.
  return { ok: decoder.decode(body.bytes, { stream: body.truncated }) }
}

/** `TextDecoder` throws `RangeError` on a label it does not know; that is not a guess at UTF-8. */
function decoderFor(label: string): InstanceType<typeof TextDecoder> | undefined {
  try {
    return new TextDecoder(label)
  } catch {
    return undefined
  }
}

/** The classification of an error thrown by undici: the caller's cancellation, the total timeout, or the network. */
export function classifyThrown(
  error: unknown,
  caller: AbortSignal,
  total: AbortSignal,
): Extract<WebFailure, { kind: 'network' | 'timeout' }> {
  if (caller.aborted) return { kind: 'network', diagnostic: 'cancelled by the caller' }
  if (total.aborted) return { kind: 'timeout' }
  return { kind: 'network', diagnostic: diagnosticOf(error) }
}

function diagnosticOf(error: unknown): string {
  if (!(error instanceof Error)) return 'request failed'
  const cause: unknown = error.cause
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
      ? cause.code
      : 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined
  if (code !== undefined) return code
  return cause instanceof Error ? cause.name : error.name
}
