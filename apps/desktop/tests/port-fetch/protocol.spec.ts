import { MessageChannel } from 'node:worker_threads'

import { afterEach, describe, expect, it } from 'vitest'

import { createPortFetch } from '../../src/port-fetch/client.ts'
import { fromNodePort } from '../../src/port-fetch/ports.ts'
import {
  errorFrame,
  isPortMessage,
  LIMITS,
  parsePortMessage,
  PROTOCOL_VERSION,
} from '../../src/port-fetch/protocol.ts'
import { servePort } from '../../src/port-fetch/server.ts'

const head = {
  type: 'request',
  id: 1,
  v: PROTOCOL_VERSION,
  method: 'GET',
  url: 'http://app.desktop/',
  headers: [],
  hasBody: false,
}
const handler = () => new Response('ok')
const responseHead = {
  type: 'response',
  id: 1,
  status: 200,
  statusText: 'OK',
  headers: [],
  hasBody: true,
}

describe('parsePortMessage', () => {
  it('ignores what is not a frame of ours: non-objects, unknown types, unusable ids', () => {
    for (const value of [null, 1, 'request', [], { type: 'hello', id: 1 }, { id: 1 }]) {
      expect(parsePortMessage(value)).toBeUndefined()
    }
    for (const id of [Number.NaN, Infinity, -1, 1.5, '1', 2 ** 53, undefined]) {
      expect(parsePortMessage({ type: 'request-end', id })).toBeUndefined()
    }
  })

  it('accepts well-formed frames of every type and returns only their known fields', () => {
    const frames = [
      head,
      { type: 'request-chunk', id: 1, chunk: new Uint8Array([1]) },
      { type: 'request-end', id: 1 },
      responseHead,
      { type: 'response-chunk', id: 1, chunk: Buffer.from('x') },
      { type: 'response-end', id: 1 },
      { type: 'ack', id: 1, bytes: 0 },
      { type: 'cancel', id: 1 },
      { type: 'cancel', id: 1, reason: 'bye' },
      { type: 'error', id: 1, message: 'm', code: 'busy', name: 'Error' },
    ]
    for (const frame of frames)
      expect(parsePortMessage(frame)).toEqual({ ok: true, message: frame })
    expect(parsePortMessage({ ...head, extra: 1 })).toEqual({ ok: true, message: head })
    expect(parsePortMessage({ type: 'error', id: 1, message: 'm', stack: 'at x' })).toEqual({
      ok: true,
      message: { type: 'error', id: 1, message: 'm' },
    })
  })

  it('rejects malformed fields with the id, so the request can be failed', () => {
    const invalid = [
      { type: 'request-chunk', id: 3, chunk: [1, 2, 3] },
      { type: 'request-chunk', id: 3, chunk: new ArrayBuffer(3) },
      { type: 'response-chunk', id: 3 },
      { type: 'ack', id: 3, bytes: -1 },
      { type: 'ack', id: 3, bytes: 1.5 },
      { type: 'ack', id: 3, bytes: Infinity },
      { type: 'ack', id: 3, bytes: '1' },
      { ...head, id: 3, method: '' },
      { ...head, id: 3, method: 'x'.repeat(LIMITS.methodLength + 1) },
      { ...head, id: 3, url: 42 },
      { ...head, id: 3, url: 'x'.repeat(LIMITS.urlLength + 1) },
      { ...head, id: 3, hasBody: 'yes' },
      { ...head, id: 3, headers: {} },
      { ...head, id: 3, headers: [['a']] },
      { ...head, id: 3, headers: [['a', 1]] },
      {
        ...head,
        id: 3,
        headers: Array.from({ length: LIMITS.headerCount + 1 }, (_, i) => [`h${i}`, 'v']),
      },
      { ...head, id: 3, headers: [['a', 'x'.repeat(LIMITS.headerLength)]] },
      { ...responseHead, id: 3, status: 0 },
      { ...responseHead, id: 3, status: 600 },
      { ...responseHead, id: 3, status: 200.5 },
      { ...responseHead, id: 3, status: '200' },
      { ...responseHead, id: 3, statusText: undefined },
      { type: 'cancel', id: 3, reason: 1 },
      { type: 'error', id: 3 },
      { type: 'error', id: 3, message: 'm', code: 1 },
      { type: 'error', id: 3, message: 'm', name: {} },
    ]
    for (const frame of invalid) {
      expect(parsePortMessage(frame)).toMatchObject({ ok: false, id: 3 })
      expect(isPortMessage(frame)).toBe(false)
    }
  })

  it('accepts the maximum header count and length', () => {
    const many = Array.from({ length: LIMITS.headerCount }, (_, i) => [`h${i}`, 'v'])
    expect(parsePortMessage({ ...head, headers: many })?.ok).toBe(true)
    expect(
      parsePortMessage({ ...head, headers: [['a', 'x'.repeat(LIMITS.headerLength - 1)]] })?.ok,
    ).toBe(true)
  })

  it('checks the direction: each side only accepts what the other sends', () => {
    expect(parsePortMessage(responseHead, 'server')).toMatchObject({ ok: false, id: 1 })
    expect(parsePortMessage({ type: 'response-end', id: 1 }, 'server')).toMatchObject({ ok: false })
    expect(parsePortMessage(head, 'client')).toMatchObject({ ok: false, id: 1 })
    expect(parsePortMessage({ type: 'cancel', id: 1 }, 'client')).toMatchObject({ ok: false })
    expect(
      parsePortMessage({ type: 'request-chunk', id: 1, chunk: new Uint8Array() }, 'client'),
    ).toMatchObject({
      ok: false,
    })
    for (const side of ['client', 'server'] as const) {
      expect(parsePortMessage({ type: 'ack', id: 1, bytes: 1 }, side)?.ok).toBe(true)
      expect(parsePortMessage({ type: 'error', id: 1, message: 'm' }, side)?.ok).toBe(true)
    }
  })

  it('requires the same protocol version; a head without one is version 1', () => {
    expect(parsePortMessage({ ...head, v: PROTOCOL_VERSION + 1 }, 'server')).toMatchObject({
      ok: false,
      id: 1,
      reason: expect.stringMatching(/protocol version 2/),
    })
    expect(parsePortMessage({ ...head, v: '1' }, 'server')).toMatchObject({ ok: false })
    const { v: _, ...unversioned } = head
    expect(parsePortMessage(unversioned, 'server')).toEqual({
      ok: true,
      message: { ...unversioned, v: 1 },
    })
  })

  it('truncates diagnostic strings instead of carrying them whole', () => {
    const long = 'x'.repeat(10_000)
    const parsed = parsePortMessage({ type: 'error', id: 1, message: long, code: long, name: long })
    expect(parsed).toMatchObject({ ok: true })
    if (!parsed?.ok || parsed.message.type !== 'error') throw new Error('unreachable')
    expect(parsed.message.message).toHaveLength(LIMITS.messageLength)
    expect(parsed.message.code).toHaveLength(LIMITS.codeLength)
    expect(parsed.message.name).toHaveLength(LIMITS.nameLength)
    const cancel = parsePortMessage({ type: 'cancel', id: 1, reason: long })
    expect(cancel?.ok && cancel.message.type === 'cancel' && cancel.message.reason?.length).toBe(
      LIMITS.messageLength,
    )
  })
})

describe('errorFrame', () => {
  it('carries a capped message, the name and the code, never the stack', () => {
    const err = new TypeError('y'.repeat(5000))
    const frame = errorFrame(7, err, 'fetch-failed')
    expect(frame).toEqual({
      type: 'error',
      id: 7,
      message: 'y'.repeat(LIMITS.messageLength),
      name: 'TypeError',
      code: 'fetch-failed',
    })
    expect(errorFrame(7, 'plain', 'busy')).toEqual({
      type: 'error',
      id: 7,
      message: 'plain',
      code: 'busy',
    })
  })
})

describe('options are validated up front', () => {
  const channels: MessageChannel[] = []
  afterEach(() => {
    for (const channel of channels.splice(0)) {
      channel.port1.close()
      channel.port2.close()
    }
  })
  const port = () => {
    const channel = new MessageChannel()
    channels.push(channel)
    return fromNodePort(channel.port1)
  }

  const nonsense: Record<string, unknown>[] = [
    { windowBytes: 0 },
    { windowBytes: -1 },
    { windowBytes: 1.5 },
    { windowBytes: Number.NaN },
    { windowBytes: Infinity },
    { windowBytes: '1024' },
    { maxChunkBytes: 0 },
    { windowBytes: 1024, maxChunkBytes: 2048 },
    { maxConcurrentRequests: 0 },
    { maxConcurrentRequests: 2.5 },
    { maxQueuedBytes: -1 },
    { ackCoalesce: null },
    { ackCoalesce: { bytes: 0, delayMs: 1 } },
    { ackCoalesce: { bytes: 1024, delayMs: -1 } },
    { ackCoalesce: { bytes: 1024, delayMs: Infinity } },
    { ackCoalesce: { delayMs: 1 } },
    { ackCoalesce: { bytes: 1024 } },
  ]
  const timeouts: Record<string, unknown>[] = [
    'headersTimeoutMs',
    'idleTimeoutMs',
    'timeoutMs',
  ].flatMap(name => [0, -1, Number.NaN, Infinity, 2 ** 31, '10'].map(value => ({ [name]: value })))

  it('createPortFetch throws synchronously on nonsense', () => {
    for (const options of [...nonsense, ...timeouts]) {
      expect(() => createPortFetch(port(), options)).toThrow(/must|required/)
    }
    expect(() =>
      createPortFetch(port(), {
        windowBytes: 4096,
        maxChunkBytes: 4096,
        timeoutMs: 1,
        ackCoalesce: { bytes: 1, delayMs: 0 },
      }),
    ).not.toThrow()
  })

  it('servePort throws synchronously on nonsense', () => {
    for (const options of nonsense) {
      expect(() => servePort(port(), handler, options)).toThrow(/must|required/)
    }
    expect(() =>
      servePort(port(), handler, { windowBytes: 4096, maxChunkBytes: 1 }).close(),
    ).not.toThrow()
  })
})
