import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SseStream } from '../src/observation-hub/sse.ts'
import { holdResponse, type HeldResponse } from './support/held-response.ts'

const HEARTBEAT_MS = 100

let held: HeldResponse | undefined
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(async () => {
  vi.useRealTimers()
  await held?.dispose()
  held = undefined
})

async function open(firstEvent?: string, headers?: Record<string, string>) {
  held = await holdResponse()
  const stream = new SseStream(held.res, HEARTBEAT_MS)
  stream.open(200, firstEvent, headers)
  return { stream, held }
}

describe('the bytes of an event stream', () => {
  it('opens with an event-stream head and the extra headers', async () => {
    held = await holdResponse()
    const writeHead = vi.spyOn(held.res, 'writeHead')
    const stream = new SseStream(held.res, HEARTBEAT_MS)
    stream.open(200, undefined, { 'omne-message-id': 'm-1' })
    expect(writeHead).toHaveBeenCalledExactlyOnceWith(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'omne-message-id': 'm-1',
    })
    stream.end()
    await held.ended
    expect(held.received()).toBe('')
  })

  it('writes each event as one data line and an empty line, in order, the first one with the head', async () => {
    const { stream, held: response } = await open('{"first":true}')
    stream.event('{"a":1}')
    stream.event('plain')
    stream.end()
    await response.ended
    expect(response.received()).toBe('data: {"first":true}\n\ndata: {"a":1}\n\ndata: plain\n\n')
  })

  it('counts the queued bytes of a frame in utf-8 and releases the waiters when they are written', async () => {
    const { stream } = await open()
    expect(stream.queuedFrameBytes).toBe(0)
    await expect(stream.written()).resolves.toBeUndefined()
    stream.event('é')
    expect(stream.queuedFrameBytes).toBe('data: é\n\n'.length + 1)
    const written = stream.written()
    await written
    expect(stream.queuedFrameBytes).toBe(0)
  })

  it('refuses an event before the head, and a second head', async () => {
    held = await holdResponse()
    const stream = new SseStream(held.res, HEARTBEAT_MS)
    expect(() => stream.event('x')).toThrow(
      new TypeError('server-entry: SSE event before the first event'),
    )
    stream.open(200)
    expect(() => stream.open(200)).toThrow(new TypeError('server-entry: SSE stream opened twice'))
    stream.end()
  })
})

describe('the heartbeat', () => {
  it('writes one comment line after a quiet interval, and not a tick before', async () => {
    const { stream, held: response } = await open()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS - 1)
    stream.end()
    await response.ended
    expect(response.received()).toBe('')
  })

  it('writes the comment at the interval and stays out of the frame bytes', async () => {
    const { stream, held: response } = await open()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(stream.queuedFrameBytes).toBe(0)
    stream.end()
    await response.ended
    expect(response.received()).toBe(': heartbeat\n\n')
  })

  it('restarts the quiet interval after each written event', async () => {
    const { stream, held: response } = await open()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS - 1)
    stream.event('a')
    await stream.written()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS - 1)
    stream.event('b')
    await stream.written()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    stream.end()
    await response.ended
    expect(response.received()).toBe('data: a\n\ndata: b\n\n: heartbeat\n\n')
  })

  it('arms the heartbeat once the first event is out, and writes none after the end', async () => {
    const { stream, held: response } = await open('first')
    await stream.written()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    stream.end()
    stream.end()
    await vi.advanceTimersByTimeAsync(10 * HEARTBEAT_MS)
    await response.ended
    expect(response.received()).toBe('data: first\n\n: heartbeat\n\n')
  })
})
