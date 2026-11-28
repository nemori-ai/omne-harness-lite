import type { LiveFact, LiveSession } from '@omne-harness/model-contract/provider'
import type { RouteAccounting } from '../config.ts'
import { commandMessage, factsOf, LIVE_CLOSE, mediaMessage } from './wire.ts'

/** The part of a WebSocket a session uses; Node's own `WebSocket` is one. */
export type LiveSocket = Readonly<{
  send(data: string): void
  close(): void
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: Readonly<{ data?: unknown }>) => void,
  ): void
}>
export type LiveSocketFactory = (url: URL, headers: Readonly<Record<string, string>>) => LiveSocket

export type LiveSessionInput = Readonly<{
  url: URL
  headers: Readonly<Record<string, string>>
  start: Readonly<Record<string, unknown>>
  accounting: Pick<RouteAccounting, 'place' | 'costUnit' | 'generation'>
  socket: LiveSocketFactory
  signal: AbortSignal
  /** The socket is gone: its connection seat is free again. Called once. */
  ended(): void
}>

type Phase = 'connecting' | 'open' | 'gone'

/** One live session over one socket: its messages read as facts, commands and media said as messages. */
export function openLiveSession(input: LiveSessionInput): LiveSession {
  const queue: LiveFact[] = []
  const waiting: ((result: IteratorResult<LiveFact>) => void)[] = []
  let phase: Phase = 'connecting'
  let socket: LiveSocket | null = null

  const push = (fact: LiveFact) => {
    const next = waiting.shift()
    if (next === undefined) queue.push(fact)
    else next({ done: false, value: fact })
  }
  const finish = () => {
    if (phase === 'gone') return
    phase = 'gone'
    input.signal.removeEventListener('abort', finish)
    socket?.close()
    for (const next of waiting.splice(0)) next({ done: true, value: undefined })
    input.ended()
  }
  const say = (message: Readonly<Record<string, unknown>>) => socket?.send(JSON.stringify(message))

  try {
    socket = input.socket(input.url, input.headers)
    socket.addEventListener('open', () => {
      if (phase !== 'connecting') return
      phase = 'open'
      say(input.start)
    })
    socket.addEventListener('message', ({ data }) => {
      if (phase === 'gone' || typeof data !== 'string') return
      let message: unknown
      try {
        message = JSON.parse(data)
      } catch {
        return
      }
      for (const fact of factsOf(message, input.accounting)) push(fact)
    })
    socket.addEventListener('close', finish)
    socket.addEventListener('error', finish)
    input.signal.addEventListener('abort', finish)
    if (input.signal.aborted) finish()
  } catch {
    finish()
  }

  return {
    facts: {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          const fact = queue.shift()
          if (fact !== undefined) return Promise.resolve({ done: false, value: fact })
          if (phase === 'gone') return Promise.resolve({ done: true, value: undefined })
          return new Promise(resolve => waiting.push(resolve))
        },
        return: () => {
          finish()
          return Promise.resolve({ done: true, value: undefined })
        },
      }),
    },
    input: {
      send(command, id) {
        if (phase !== 'open') return 'closed'
        const message = commandMessage(command, id)
        if (message === null)
          push({
            kind: 'command',
            id,
            outcome: { rejected: { code: null, message: 'content-not-text' } },
          })
        else say(message)
        return 'sent'
      },
      media(frame) {
        const message = phase === 'open' ? mediaMessage(frame) : null
        if (message === null) return 'dropped'
        say(message)
        return 'sent'
      },
      close() {
        if (phase === 'open') say(LIVE_CLOSE)
      },
    },
  }
}
