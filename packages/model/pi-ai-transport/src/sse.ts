// Derived from pi 1.0.0 openai-codex-responses.ts parseSSE, commit a13d35a742c6ef8462812a28fbe1d8c8b7431c32.
// Copyright (c) 2025 Mario Zechner. MIT: ../LICENSE.pi. See provenance.json.

/** Why a byte stream is not a well-formed, bounded SSE stream. */
export type SseFailureReason = 'non-byte' | 'invalid-utf8' | 'event-too-large' | 'unterminated'

const MESSAGES: Readonly<Record<SseFailureReason, string>> = {
  'non-byte': 'SSE stream chunk is not a Uint8Array',
  'invalid-utf8': 'SSE stream is not valid UTF-8',
  'event-too-large': 'SSE event exceeds the configured byte limit',
  unterminated: 'SSE stream ends inside an event',
}

export class SseProtocolError extends Error {
  readonly reason: SseFailureReason

  constructor(reason: SseFailureReason) {
    super(MESSAGES[reason])
    this.name = 'SseProtocolError'
    this.reason = reason
  }
}

/**
 * Yields the data of each SSE event. UTF-8 and CR/LF state both survive arbitrary byte cuts.
 * Comments and the event, id and retry fields are ignored; data lines join with LF. An event
 * whose bytes, line breaks included, exceed `maxEventBytes` fails. Throws `SseProtocolError`
 * for a malformed stream; any other failure of the body passes through unchanged.
 */
export function readSseEvents(
  body: AsyncIterable<Uint8Array>,
  maxEventBytes: number,
): AsyncGenerator<string> {
  if (!Number.isSafeInteger(maxEventBytes) || maxEventBytes < 1)
    throw new RangeError('maxEventBytes must be a positive integer')
  return frameEvents(body, maxEventBytes)
}

async function* frameEvents(
  body: AsyncIterable<Uint8Array>,
  maximum: number,
): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const framer = createFramer(maximum)
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) throw new SseProtocolError('non-byte')
    for (const character of decode(decoder, chunk)) {
      const event = framer.consume(character)
      if (event !== undefined) yield event
    }
  }
  for (const character of decode(decoder, undefined)) framer.consume(character)
  framer.finish()
}

/** Only the decoder's own error means invalid UTF-8; `undefined` flushes the decoder. */
function decode(decoder: InstanceType<typeof TextDecoder>, chunk: Uint8Array | undefined): string {
  try {
    return chunk === undefined ? decoder.decode() : decoder.decode(chunk, { stream: true })
  } catch (error) {
    if (error instanceof TypeError) throw new SseProtocolError('invalid-utf8')
    throw error
  }
}

function createFramer(maximum: number) {
  let line = ''
  let lines: string[] = []
  let bytes = 0
  let previousCR = false

  function endLine(): string | undefined {
    if (!line.length) {
      const event = lines.length ? lines.join('\n') : undefined
      lines = []
      bytes = 0
      return event
    }
    // A line without a colon is a field name with an empty value (WHATWG); `:` starts a comment.
    const colon = line.indexOf(':')
    const name = colon < 0 ? line : line.slice(0, colon)
    if (name === 'data') lines.push(colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, ''))
    line = ''
    return undefined
  }

  return {
    consume(character: string): string | undefined {
      if (previousCR && character === '\n') {
        previousCR = false
        return undefined
      }
      previousCR = false
      bytes += utf8Length(character)
      if (bytes > maximum) throw new SseProtocolError('event-too-large')
      if (character === '\r' || character === '\n') {
        const event = endLine()
        previousCR = character === '\r'
        return event
      }
      line += character
      return undefined
    },
    finish(): void {
      if (line.length || lines.length) throw new SseProtocolError('unterminated')
    },
  }
}

/** UTF-8 byte length of one code point. */
function utf8Length(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  if (codePoint < 0x10000) return 3
  return 4
}
