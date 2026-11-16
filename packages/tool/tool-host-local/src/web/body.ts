import type { WebFailure } from '@omne-harness/tool-definitions'

export type CappedBody = Readonly<{ bytes: Uint8Array; truncated: boolean }>

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

export function decodeText(
  body: CappedBody,
  contentType: ContentType,
): Readonly<{ ok: string }> | Readonly<{ failure: WebFailure }> {
  const decoder = decoderFor(contentType.charset ?? 'utf-8')
  if (decoder === undefined)
    return { failure: { kind: 'not-text', mediaType: contentType.mediaType } }
  return { ok: decoder.decode(body.bytes, { stream: body.truncated }) }
}

function decoderFor(label: string): InstanceType<typeof TextDecoder> | undefined {
  try {
    return new TextDecoder(label)
  } catch {
    return undefined
  }
}

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
