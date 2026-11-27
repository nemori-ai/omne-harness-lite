import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import { decodeModelOperationId, type ModelOperationId } from '@omne-harness/model-contract'
import type { LiveFact } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import { openLiveSession, type LiveSocket } from '../src/live/session.ts'

const op = (label: string): ModelOperationId => {
  const decoded = decodeModelOperationId(`mop_${label}`)
  if (!('ok' in decoded)) throw new Error(label)
  return decoded.ok
}
const text = (value: string): ContentBlock => {
  const visibility = { toHuman: true, toModel: true }
  const judged = judgeContentBlock({ kind: 'text', id: 'say', text: value, visibility })
  if (!('ok' in judged)) throw new Error('invalid text block')
  return judged.ok
}
const START = { type: 'session.start', event_id: 'start' }

function world(options: Readonly<{ throws?: boolean; stopped?: boolean }> = {}) {
  const sent: unknown[] = []
  const listeners = new Map<string, ((event: { data?: unknown }) => void)[]>()
  const seen = { url: '', headers: {} as Readonly<Record<string, string>>, closes: 0, ends: 0 }
  const socket: LiveSocket = {
    send: data => void sent.push(JSON.parse(data)),
    close: () => {
      seen.closes += 1
    },
    addEventListener: (type, listener) =>
      void listeners.set(type, [...(listeners.get(type) ?? []), listener]),
  }
  const emit = (type: string, data?: unknown) =>
    listeners.get(type)?.forEach(listener => listener({ data }))
  const stop = new AbortController()
  if (options.stopped === true) stop.abort()
  const session = openLiveSession({
    url: new URL('wss://live.test.invalid/v1/live/sessions'),
    headers: { authorization: 'Bearer synthetic' },
    start: START,
    accounting: { place: 'live.test.invalid', costUnit: 'USD' },
    socket: (url, headers) => {
      if (options.throws === true) throw new Error('synthetic-connect-failure')
      seen.url = url.href
      seen.headers = headers
      return socket
    },
    signal: stop.signal,
    ended: () => {
      seen.ends += 1
    },
  })
  const facts = session.facts[Symbol.asyncIterator]()
  return {
    session,
    facts,
    sent,
    seen,
    stop,
    open: () => emit('open'),
    say: (message: unknown) => emit('message', JSON.stringify(message)),
    raw: (data: unknown) => emit('message', data),
    gone: () => emit('close'),
    failed: () => emit('error'),
  }
}
async function drain(facts: AsyncIterator<LiveFact>) {
  const all: LiveFact[] = []
  for (;;) {
    const next = await facts.next()
    if (next.done === true) return all
    all.push(next.value)
  }
}

describe('a live session over one socket', () => {
  it('connects with the headers, starts the session once open, and reads the messages as facts', async () => {
    const w = world()
    expect(w.seen).toMatchObject({
      url: 'wss://live.test.invalid/v1/live/sessions',
      headers: { authorization: 'Bearer synthetic' },
    })
    expect(w.sent).toEqual([])
    w.open()
    expect(w.sent).toEqual([START])
    w.say({ type: 'session.started', session: { expires_at: null } })
    w.raw('not json')
    w.say({ type: 'session.closed', usage: { seconds: 3 } })
    w.gone()
    const facts = await drain(w.facts)
    expect(facts.map(fact => fact.kind)).toEqual(['opened', 'account', 'closed'])
    expect(w.seen.ends).toBe(1)
  })

  it('says a command once open, refuses one before, and answers one it cannot carry as refused', async () => {
    const w = world()
    const say = { type: 'say', use: 'context', about: null, content: [text('noted')] } as const
    expect(w.session.input.send(say, op('early'))).toBe('closed')
    w.open()
    expect(w.session.input.send(say, op('said'))).toBe('sent')
    expect(w.sent.at(-1)).toEqual({
      type: 'session.thinking.append',
      event_id: op('said'),
      delegation_id: null,
      content: 'noted',
    })
    const picture = { ...say, content: [{ kind: 'image' }] } as never
    expect(w.session.input.send(picture, op('picture'))).toBe('sent')
    expect(await w.facts.next()).toEqual({
      done: false,
      value: {
        kind: 'command',
        id: op('picture'),
        outcome: { rejected: { code: null, message: 'content-not-text' } },
      },
    })
    w.gone()
    expect(w.session.input.send(say, op('late'))).toBe('closed')
  })

  it('sends voice while open, drops it before and after, and drops another modality', () => {
    const w = world()
    const voice = { modality: 'voice', bytes: new Uint8Array([1]) } as const
    expect(w.session.input.media(voice)).toBe('dropped')
    w.open()
    expect(w.session.input.media(voice)).toBe('sent')
    expect(w.session.input.media({ modality: 'image', bytes: new Uint8Array([1]) })).toBe('dropped')
    w.failed()
    expect(w.session.input.media(voice)).toBe('dropped')
    expect(
      w.sent.filter(message => (message as { type: string }).type !== 'session.start'),
    ).toHaveLength(1)
  })

  it('asks the upstream to close only while open', () => {
    const w = world()
    w.session.input.close()
    w.open()
    w.session.input.close()
    expect(w.sent.at(-1)).toEqual({ type: 'session.close', event_id: 'close' })
    expect(w.sent).toHaveLength(2)
  })

  it('lets go of the socket when the reader stops, or the call stops, and ends once', async () => {
    const reader = world()
    reader.open()
    const pending = reader.facts.next()
    expect(await reader.facts.return?.()).toEqual({ done: true, value: undefined })
    expect(await pending).toEqual({ done: true, value: undefined })
    expect(reader.seen.closes).toBe(1)
    reader.gone()
    expect(reader.seen.ends).toBe(1)

    const stopped = world()
    stopped.stop.abort()
    expect(stopped.seen.closes).toBe(1)
    expect(await drain(stopped.facts)).toEqual([])
    expect(stopped.seen.ends).toBe(1)
  })

  it('hands a message to a reader already waiting for it, and none that comes after the socket is gone', async () => {
    const w = world()
    w.open()
    const waiting = w.facts.next()
    w.say({ type: 'session.paused' })
    expect(await waiting).toEqual({
      done: false,
      value: { kind: 'event', event: { t: 'asleep', on: true } },
    })
    w.gone()
    w.say({ type: 'session.resumed' })
    expect(await drain(w.facts)).toEqual([])
  })

  it('takes a call stopped before its session was made as gone at once, without starting it', async () => {
    const w = world({ stopped: true })
    expect(w.seen.closes).toBe(1)
    expect(w.seen.ends).toBe(1)
    w.open()
    expect(w.sent).toEqual([])
    expect(await drain(w.facts)).toEqual([])
  })

  it('takes a socket that cannot be made as a connection gone at once', async () => {
    const w = world({ throws: true })
    expect(await drain(w.facts)).toEqual([])
    expect(w.seen.ends).toBe(1)
    expect(w.session.input.media({ modality: 'voice', bytes: new Uint8Array([1]) })).toBe('dropped')
  })
})
