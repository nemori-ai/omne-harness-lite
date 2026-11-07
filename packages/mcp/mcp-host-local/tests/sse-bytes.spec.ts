// The byte bound of one SSE event (SPEC H8, contract T2), on the counter alone with a small bound:
// the raw bytes since the last empty line, whatever line ends the body uses.
import { describe, expect, it } from 'vitest'
import { SseEventBytes } from '../src/sse-bytes.ts'

type Read = Readonly<{ passed: string; error?: unknown }>

/** Writes the chunks through a counter of `limit` bytes; what came out, and the error if any. */
async function through(limit: number, chunks: readonly (string | Uint8Array)[]): Promise<Read> {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      controller.close()
    },
  })
  const reader = body.pipeThrough(new SseEventBytes(limit)).getReader()
  const parts: Uint8Array[] = []
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      parts.push(next.value)
    }
  } catch (error) {
    return { passed: Buffer.concat(parts).toString('utf8'), error }
  }
  return { passed: Buffer.concat(parts).toString('utf8') }
}

/** An event of exactly `size` bytes before its empty line: `data: ` and padding, then LF. */
const eventOf = (size: number, end = '\n') => `data: ${'x'.repeat(size - 6 - end.length)}${end}`

describe('the byte counter of an SSE event (SPEC H8)', () => {
  it('passes an event of exactly the bound and breaks on one byte more', async () => {
    expect(await through(16, [`${eventOf(16)}\n`])).toEqual({ passed: `${eventOf(16)}\n` })
    const above = await through(16, [`${eventOf(17)}\n`])
    expect(above.passed).toBe('')
    expect(above.error).toBeInstanceOf(RangeError)
    expect(String(above.error)).toContain('16 bytes')
    expect(String(above.error)).toContain('17 bytes read')
  })

  it('counts bytes, not characters: three-byte characters within the character count pass the bound', async () => {
    const event = `data: ${'中'.repeat(4)}\n\n`
    // 6 + 12 + 1 = 19 bytes before the empty line, 11 characters.
    expect(await through(18, [event])).toMatchObject({ error: expect.any(RangeError) })
    expect(await through(19, [event])).toEqual({ passed: event })
  })

  it.each([
    ['LF LF', '\n', '\n'],
    ['CRLF CRLF', '\r\n', '\r\n'],
    ['CR CR', '\r', '\r'],
  ])('an empty line ends the event and resets the count (%s)', async (_name, end, empty) => {
    const event = `${eventOf(16, end)}${empty}`
    expect(await through(16, [event, event, event])).toEqual({ passed: event.repeat(3) })
  })

  it.each([
    ['an LF', '\n'],
    ['a CR', '\r'],
    ['a CRLF', '\r\n'],
  ])(
    'a body that opens with %s opens with an empty line: the first event starts its count at zero',
    async (_name, opening) => {
      expect(await through(16, [`${opening}${eventOf(16)}\n`])).toEqual({
        passed: `${opening}${eventOf(16)}\n`,
      })
      expect(await through(16, [`${opening}${eventOf(17)}\n`])).toMatchObject({
        error: expect.any(RangeError),
      })
    },
  )

  it('a data line that ends with CRLF and an empty line that is a bare LF: the CRLF counts, the LF is the boundary', async () => {
    const first = eventOf(16, '\r\n')
    expect(await through(16, [`${first}\n${eventOf(16)}\n`])).toEqual({
      passed: `${first}\n${eventOf(16)}\n`,
    })
    expect(await through(16, [`${eventOf(17, '\r\n')}\n`])).toMatchObject({
      error: expect.any(RangeError),
    })
  })

  it('a CRLF split across two chunks is one line end: the LF of the empty line is not counted', async () => {
    const line = eventOf(16, '\r\n')
    // The empty line's CR closes one chunk and its LF opens the next, followed by a full event.
    expect(await through(16, [`${line}\r`, `\n${line}\r\n`])).toEqual({
      passed: `${line}\r\n${line}\r\n`,
    })
    // The CRLF of a data line split the same way: both bytes are bytes of the event.
    const split = `data: ${'x'.repeat(8)}`
    expect(await through(16, [`${split}\r`, `\n\r\n`])).toEqual({ passed: `${split}\r\n\r\n` })
    expect(await through(15, [`${split}\r`, `\n\r\n`])).toMatchObject({
      passed: `${split}\r`,
      error: expect.any(RangeError),
    })
  })

  it('a line end that ends a line with bytes is no boundary: the lines of one event add up', async () => {
    expect(await through(16, ['data: 1234\ndata: 5\n\n'])).toMatchObject({
      error: expect.any(RangeError),
    })
  })

  it('counts across chunks before any line end, and passes no chunk from the one that passes the bound', async () => {
    const read = await through(16, ['data: ', 'xxxxx', 'xxxxxx', 'tail', '\n\n', 'data: after\n\n'])
    expect(read.passed).toBe('data: xxxxx')
    expect(read.error).toBeInstanceOf(RangeError)
  })

  it('every byte in a chunk counts, wherever the chunk starts', async () => {
    const bytes = new Uint8Array(17).fill(0x78)
    expect(await through(16, [bytes.subarray(0, 9), bytes.subarray(9)])).toMatchObject({
      passed: 'x'.repeat(9),
      error: expect.any(RangeError),
    })
  })
})
