import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readSseEvents, SseProtocolError, type SseFailureReason } from '../src/sse.ts'

const encoder = new TextEncoder()

/** Yields `bytes` cut at the given offsets, as separate Uint8Array chunks. */
async function* cutAt(bytes: Uint8Array, cuts: readonly number[]): AsyncGenerator<Uint8Array> {
  let start = 0
  for (const cut of [...cuts, bytes.length]) {
    yield bytes.slice(start, cut)
    start = cut
  }
}

async function* chunksOf(...chunks: readonly Uint8Array[]): AsyncGenerator<Uint8Array> {
  yield* chunks
}

async function collect(events: AsyncIterable<string>): Promise<string[]> {
  const result: string[] = []
  for await (const event of events) result.push(event)
  return result
}

async function failureOf(events: AsyncIterable<string>): Promise<SseFailureReason> {
  try {
    await collect(events)
  } catch (error) {
    if (error instanceof SseProtocolError) return error.reason
    throw error
  }
  throw new Error('expected an SseProtocolError')
}

/**
 * Every newline form, a comment, ignored fields, multi-line data, a colon-less data line,
 * a value whose second leading space is kept, and 2-, 3- and 4-byte UTF-8 characters.
 */
const mixed = encoder.encode(
  ': keep-alive\r\n' +
    'event: message\r\n' +
    'id: 7\n' +
    'retry: 1000\r' +
    'data: {"text":"你好é"}\r\n' +
    'data:😀\n' +
    '\r\n' +
    'data\n' +
    '\n' +
    'data:  two spaces\r' +
    '\r' +
    'data: last\r\n' +
    '\r\n',
)
const mixedEvents = ['{"text":"你好é"}\n😀', '', ' two spaces', 'last']

describe('framing a byte stream into SSE events', () => {
  it('US-17: frames the stream delivered as one chunk', async () => {
    expect(await collect(readSseEvents(cutAt(mixed, []), 1024))).toEqual(mixedEvents)
  })

  it('US-17: frames the stream identically for every single byte cut', async () => {
    for (let cut = 0; cut <= mixed.length; cut += 1) {
      const events = await collect(readSseEvents(cutAt(mixed, [cut]), 1024))
      expect(events, `cut at ${cut}`).toEqual(mixedEvents)
    }
  })

  it('US-17: frames the stream identically for every pair of byte cuts', async () => {
    for (let first = 1; first < mixed.length; first += 1) {
      for (let second = first + 1; second < mixed.length; second += 1) {
        const events = await collect(readSseEvents(cutAt(mixed, [first, second]), 1024))
        expect(events, `cuts at ${first} and ${second}`).toEqual(mixedEvents)
      }
    }
  })

  it('US-17: frames the stream identically when every byte is its own chunk', async () => {
    const cuts = Array.from({ length: mixed.length - 1 }, (_, index) => index + 1)
    expect(await collect(readSseEvents(cutAt(mixed, cuts), 1024))).toEqual(mixedEvents)
  })

  it('US-17: a CR at the end of one chunk and an LF at the start of the next are one break', async () => {
    const events = readSseEvents(
      chunksOf(
        encoder.encode('data: a\r'),
        encoder.encode('\ndata: b\r'),
        encoder.encode('\n\r\n'),
      ),
      1024,
    )
    expect(await collect(events)).toEqual(['a\nb'])
  })

  it('US-19: ignores comments and the event, id and retry fields; joins data lines with LF', async () => {
    const stream = encoder.encode(
      ':comment\nevent: delta\ndata: one\nid: 3\ndata: two\nretry: 5\ndata: three\n\n',
    )
    expect(await collect(readSseEvents(cutAt(stream, []), 1024))).toEqual(['one\ntwo\nthree'])
  })

  it('US-19: an event without data lines yields nothing', async () => {
    const stream = encoder.encode(': only a comment\n\nevent: ping\nid: 1\n\ndata: real\n\n')
    expect(await collect(readSseEvents(cutAt(stream, []), 1024))).toEqual(['real'])
  })

  it('US-19: a data line without a colon contributes an empty value', async () => {
    const stream = encoder.encode('data\ndata: tail\n\ndata\n\n')
    expect(await collect(readSseEvents(cutAt(stream, []), 1024))).toEqual(['\ntail', ''])
  })

  it('US-19: a field whose name only starts with data is ignored', async () => {
    const stream = encoder.encode('data-extra: no\ndata: yes\n\n')
    expect(await collect(readSseEvents(cutAt(stream, []), 1024))).toEqual(['yes'])
  })

  it('US-17: accepts a Uint8Array subclass such as a Node Buffer', async () => {
    const events = readSseEvents(chunksOf(Buffer.from('data: buffered\n\n')), 1024)
    expect(await collect(events)).toEqual(['buffered'])
  })

  it('US-17: an empty stream yields no event and no failure', async () => {
    expect(await collect(readSseEvents(chunksOf(), 1024))).toEqual([])
  })
})

describe('failing a malformed SSE stream with a closed reason', () => {
  it('US-18: a string chunk, as from a stream with an encoding set, fails as non-byte', async () => {
    const decoded = Readable.from(['data: text\n\n'])
    expect(await failureOf(readSseEvents(decoded, 1024))).toBe('non-byte')
  })

  it('US-18: an invalid UTF-8 byte fails as invalid-utf8', async () => {
    const body = chunksOf(encoder.encode('data: '), Uint8Array.of(0xff), encoder.encode('\n\n'))
    expect(await failureOf(readSseEvents(body, 1024))).toBe('invalid-utf8')
  })

  it('US-18: a multi-byte character cut off by the end of the stream fails as invalid-utf8', async () => {
    const truncated = encoder.encode('data: 你').slice(0, -1)
    expect(await failureOf(readSseEvents(chunksOf(truncated), 1024))).toBe('invalid-utf8')
  })

  it('US-18: an event at the byte limit passes and one byte more fails as event-too-large', async () => {
    // 'data:你' is 8 bytes, then two line breaks: 10 bytes in the event.
    const stream = encoder.encode('data:你\n\n')
    expect(await collect(readSseEvents(cutAt(stream, [6]), 10))).toEqual(['你'])
    expect(await failureOf(readSseEvents(cutAt(stream, [6]), 9))).toBe('event-too-large')
  })

  it('US-18: the byte limit applies to each event, not to the whole stream', async () => {
    const stream = encoder.encode('data: a\n\n'.repeat(50))
    const events = await collect(readSseEvents(cutAt(stream, []), 9))
    expect(events).toEqual(Array.from({ length: 50 }, () => 'a'))
  })

  it('US-18: comment and ignored field bytes count toward the event limit', async () => {
    const stream = encoder.encode(`: ${'x'.repeat(40)}\ndata: a\n\n`)
    expect(await failureOf(readSseEvents(cutAt(stream, []), 20))).toBe('event-too-large')
  })

  it('US-18: a stream that ends after a data line fails as unterminated', async () => {
    const stream = encoder.encode('data: done\n\ndata: half\n')
    const seen: string[] = []
    const events = readSseEvents(cutAt(stream, []), 1024)
    await expect(
      (async () => {
        for await (const event of events) seen.push(event)
      })(),
    ).rejects.toMatchObject({ reason: 'unterminated' })
    expect(seen).toEqual(['done'])
  })

  it('US-18: a stream that ends inside a line fails as unterminated', async () => {
    expect(await failureOf(readSseEvents(chunksOf(encoder.encode('data: x')), 1024))).toBe(
      'unterminated',
    )
  })

  it('US-18: a TypeError raised by the body passes through unchanged', async () => {
    const failure = new TypeError('body broke')
    async function* broken(): AsyncGenerator<Uint8Array> {
      yield encoder.encode('data: a\n\n')
      throw failure
    }
    await expect(collect(readSseEvents(broken(), 1024))).rejects.toBe(failure)
  })

  it('US-18: a protocol failure closes the body', async () => {
    let closed = false
    async function* body(): AsyncGenerator<Uint8Array> {
      try {
        yield encoder.encode('data: far too long\n\n')
        yield encoder.encode('data: never read\n\n')
      } finally {
        closed = true
      }
    }
    expect(await failureOf(readSseEvents(body(), 4))).toBe('event-too-large')
    expect(closed).toBe(true)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'US-18: rejects the event byte limit %s synchronously with a RangeError',
    limit => {
      expect(() => readSseEvents(chunksOf(), limit)).toThrow(RangeError)
    },
  )
})
