// Derived from pi 1.0.0 openai-codex-responses.ts parseSSE, commit a13d35a742c6ef8462812a28fbe1d8c8b7431c32.
// Copyright (c) 2025 Mario Zechner. MIT: ../LICENSE.pi. See provenance.json.
import type { IncomingMessage } from 'node:http'

export class SseProtocolError extends Error {}
/** Bounded frame parser. UTF-8 and CR/LF state both survive arbitrary byte cuts. */
export async function* parseSSE(stream: IncomingMessage, maximum: number): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let line = '',
    lines: string[] = [],
    bytes = 0,
    previousCR = false
  function endLine(): string | undefined {
    if (!line.length) {
      const frame = lines.length ? lines.join('\n') : undefined
      lines = []
      bytes = 0
      return frame
    }
    if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''))
    line = ''
    return undefined
  }
  try {
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) throw new SseProtocolError('non-byte stream')
      const text = decoder.decode(chunk, { stream: true })
      for (const character of text) {
        if (previousCR && character === '\n') {
          previousCR = false
          continue
        }
        previousCR = false
        bytes += Buffer.byteLength(character)
        if (bytes > maximum) throw new SseProtocolError('SSE event exceeds configured limit')
        if (character === '\r' || character === '\n') {
          const frame = endLine()
          previousCR = character === '\r'
          if (frame !== undefined) yield frame
        } else line += character
      }
    }
    const tail = decoder.decode()
    if (tail) line += tail
    if (line.length || lines.length) throw new SseProtocolError('unterminated SSE event')
  } catch (error) {
    if (error instanceof SseProtocolError) throw error
    if (error instanceof TypeError) throw new SseProtocolError('invalid UTF-8 stream')
    throw error
  }
}
