import type { JsonLimits } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import { readProtocolFrames, type FrameOptions } from '../src/frames.ts'
import { readSseEvents, SseProtocolError } from '../src/sse.ts'

const json: JsonLimits = {
  maxBytes: 4096,
  maxDepth: 16,
  maxItems: 256,
  maxMembers: 64,
  maxStringLength: 1024,
  maxNumberLength: 64,
}
const withDone: FrameOptions = { endMarker: '[DONE]', json }

async function* eventsOf(...events: readonly string[]): AsyncGenerator<string> {
  yield* events
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = []
  for await (const item of items) result.push(item)
  return result
}

describe('reading SSE event data as protocol frames', () => {
  it('US-20: reads each data text as a lossless JSON frame, keeping a large integer lexeme', async () => {
    const frames = await collect(
      readProtocolFrames(eventsOf('{"id":12345678901234567890123}', '[1.50e+400]'), withDone),
    )
    expect(frames).toEqual([
      {
        ok: {
          kind: 'data',
          value: {
            kind: 'object',
            entries: [{ key: 'id', value: { kind: 'number', lexeme: '12345678901234567890123' } }],
          },
        },
      },
      {
        ok: {
          kind: 'data',
          value: { kind: 'array', items: [{ kind: 'number', lexeme: '1.50e+400' }] },
        },
      },
    ])
  })

  it('US-21: the end-marker text becomes its own frame', async () => {
    const frames = await collect(readProtocolFrames(eventsOf('{}', '[DONE]'), withDone))
    expect(frames).toEqual([
      { ok: { kind: 'data', value: { kind: 'object', entries: [] } } },
      { ok: { kind: 'end-marker' } },
    ])
  })

  it('US-21: any event after the end-marker fails once and ends the frames', async () => {
    const frames = await collect(
      readProtocolFrames(eventsOf('[DONE]', '{"late":true}', '{"later":true}'), withDone),
    )
    expect(frames).toEqual([{ ok: { kind: 'end-marker' } }, { failure: 'event-after-end' }])
  })

  it('US-21: a second end-marker is also an event after the end', async () => {
    const frames = await collect(readProtocolFrames(eventsOf('[DONE]', '[DONE]'), withDone))
    expect(frames).toEqual([{ ok: { kind: 'end-marker' } }, { failure: 'event-after-end' }])
  })

  it('US-21: the end of the events without an end-marker yields no terminal frame', async () => {
    const frames = await collect(readProtocolFrames(eventsOf('{"partial":1}'), withDone))
    expect(frames).toEqual([
      {
        ok: {
          kind: 'data',
          value: {
            kind: 'object',
            entries: [{ key: 'partial', value: { kind: 'number', lexeme: '1' } }],
          },
        },
      },
    ])
  })

  it('US-21: no events yield no frame', async () => {
    expect(await collect(readProtocolFrames(eventsOf(), withDone))).toEqual([])
  })

  it('US-21: without a configured end-marker its text is read as JSON and fails', async () => {
    const frames = await collect(readProtocolFrames(eventsOf('[DONE]'), { endMarker: null, json }))
    expect(frames).toEqual([{ failure: 'invalid-json' }])
  })

  it('US-20: the configured end-marker text is the only one recognized', async () => {
    const frames = await collect(
      readProtocolFrames(eventsOf('"stop"', '[DONE]'), { endMarker: '"stop"', json }),
    )
    expect(frames).toEqual([{ ok: { kind: 'end-marker' } }, { failure: 'event-after-end' }])
  })

  it.each([
    ['malformed JSON', '{"a":'],
    ['empty data', ''],
    ['a duplicate key', '{"a":1,"a":2}'],
    ['trailing content', '{} {}'],
  ])('US-20: %s fails as invalid-json and ends the frames', async (_name, data) => {
    const frames = await collect(readProtocolFrames(eventsOf(data, '{}'), withDone))
    expect(frames).toEqual([{ failure: 'invalid-json' }])
  })

  it('US-20: data over the caller JSON limits fails as invalid-json', async () => {
    const tight: FrameOptions = { endMarker: '[DONE]', json: { ...json, maxNumberLength: 3 } }
    const frames = await collect(readProtocolFrames(eventsOf('[1234]'), tight))
    expect(frames).toEqual([{ failure: 'invalid-json' }])
  })

  it('US-20: a failure stops reading and closes the event source', async () => {
    let pulled = 0
    let closed = false
    async function* events(): AsyncGenerator<string> {
      try {
        for (const data of ['not json', '{}', '{}']) {
          pulled += 1
          yield data
        }
      } finally {
        closed = true
      }
    }
    await collect(readProtocolFrames(events(), withDone))
    expect(pulled).toBe(1)
    expect(closed).toBe(true)
  })

  it('US-20: an SSE protocol failure passes through the frames unchanged', async () => {
    const body = (async function* () {
      yield new TextEncoder().encode('data: {}\n\ndata: 1')
    })()
    const seen: unknown[] = []
    const reading = (async () => {
      for await (const frame of readProtocolFrames(readSseEvents(body, 1024), withDone))
        seen.push(frame)
    })()
    await expect(reading).rejects.toBeInstanceOf(SseProtocolError)
    expect(seen).toEqual([{ ok: { kind: 'data', value: { kind: 'object', entries: [] } } }])
  })

  it('US-17: bytes cut inside a multi-byte character become the same frames', async () => {
    const bytes = new TextEncoder().encode('data: {"t":"你好"}\r\n\r\ndata: [DONE]\n\n')
    for (let cut = 1; cut < bytes.length; cut += 1) {
      const body = (async function* () {
        yield bytes.slice(0, cut)
        yield bytes.slice(cut)
      })()
      const frames = await collect(readProtocolFrames(readSseEvents(body, 1024), withDone))
      expect(frames, `cut at ${cut}`).toEqual([
        {
          ok: {
            kind: 'data',
            value: {
              kind: 'object',
              entries: [{ key: 't', value: { kind: 'string', value: '你好' } }],
            },
          },
        },
        { ok: { kind: 'end-marker' } },
      ])
    }
  })
})
