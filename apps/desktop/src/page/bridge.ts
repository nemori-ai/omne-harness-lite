import type { LoginState } from '@omne-harness/client-assembly/cordis'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallReport, ObserveEnd, ProtocolKey, Transport } from '@omne-harness/sdk/core'
import type {
  ForwardingBridge,
  ChannelAnswer,
  ForwardingChannel,
  LoginCredentials,
  LoginResult,
  LogoutResult,
  ObserveOpening,
  ObserveStream,
} from '../shared/channel.ts'
import {
  BRIDGE,
  readForwardingProtocols,
  readLoginStanding,
  readObserveEvent,
  readPageEvent,
  readReport,
  readResult,
  writeAttach,
  writeCall,
  writeCredentials,
  writeDetach,
  writeObserve,
} from '../shared/wire.ts'
import { sseData } from './sse.ts'

export type PageBridge = ForwardingBridge & {
  forwardingProtocols(): readonly ProtocolKey[] | null
  onExpired(show: () => void): () => void
  close(): void
}

const NOT_SENT: CallReport = Object.freeze({ kind: 'not-sent' })
const UNCERTAIN: CallReport = Object.freeze({ kind: 'uncertain' })
const JSON_HEADERS = { 'content-type': 'application/json' }
const LOGIN_RESULTS: readonly LoginResult[] = ['signed-in', 'auth-failed', 'unknown', 'unavailable']
const LOGOUT_RESULTS: readonly LogoutResult[] = ['signed-out', 'unknown']

const retryDelayMs = (attempt: number): number => Math.min(200 * 2 ** attempt, 5_000)

const refusedBeforeForwarding = (response: Response): boolean =>
  response.status >= 400 && response.status < 500

function pageStream(address: string, page: string) {
  const queues = new Map<string, EventQueue>()
  const reconnected = new Set<() => void>()
  let opened: Promise<void> | undefined
  let broke = false

  async function pump(response: Response): Promise<void> {
    try {
      for await (const data of sseData(response)) {
        const event = readPageEvent(data)
        const queue = event === undefined ? undefined : queues.get(event.id)
        if (event === undefined || queue === undefined) continue
        if (event.last) queues.delete(event.id)
        queue.push(event.event)
      }
    } catch {}
    opened = undefined
    broke = true
    for (const queue of queues.values()) queue.end()
    queues.clear()
  }

  async function open(): Promise<void> {
    const response = await fetch(`${address}?page=${encodeURIComponent(page)}`, {
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('the event stream was refused')
    void pump(response)
    if (broke) for (const listener of Array.from(reconnected)) listener()
    broke = false
  }

  return {
    page,
    async attach(id: string, queue: EventQueue): Promise<void> {
      opened ??= open().catch((error: unknown) => {
        opened = undefined
        throw error
      })
      await opened
      queues.set(id, queue)
    },
    detach: (id: string): boolean => queues.delete(id),
    onReconnect(listener: () => void): () => void {
      reconnected.add(listener)
      return () => void reconnected.delete(listener)
    },
  }
}

export function httpChannel(
  origin: string,
  newId: () => string = () => crypto.randomUUID(),
): ForwardingChannel {
  const url = (path: string): string => new URL(path, origin).toString()

  async function post(path: string, body: string, signal?: AbortSignal): Promise<Response> {
    return fetch(url(path), {
      method: 'POST',
      headers: JSON_HEADERS,
      body,
      cache: 'no-store',
      ...(signal === undefined ? {} : { signal }),
    })
  }

  async function answer(path: string, body: string, signal?: AbortSignal): Promise<ChannelAnswer> {
    const response = await post(path, body, signal)
    if (response.ok) return { text: await response.text() }
    if (refusedBeforeForwarding(response)) return { refused: true }
    throw new Error('the forwarding layer failed')
  }

  const stream = pageStream(url(BRIDGE.events), newId())

  return {
    call: (request, signal) => answer(BRIDGE.call, request, signal),
    async observe(request, signal) {
      const id = newId()
      const queue = eventQueue(signal)
      await stream.attach(id, queue)
      let response: Response
      try {
        response = await post(BRIDGE.observe, writeAttach(stream.page, id, request), signal)
      } catch (error) {
        stream.detach(id)
        throw error
      }
      if (!response.ok) {
        stream.detach(id)
        if (refusedBeforeForwarding(response)) return { refused: true }
        throw new Error('the forwarding layer failed')
      }
      queue.onEnd(() => {
        if (stream.detach(id))
          void post(BRIDGE.unobserve, writeDetach(stream.page, id)).catch(() => undefined)
      })
      return { stream: queue.stream }
    },
    login: credentials => answer(BRIDGE.login, credentials),
    logout: () => answer(BRIDGE.logout, '{}'),
    loginStanding: () => answer(BRIDGE.loginStanding, '{}'),
    onReconnect: listener => stream.onReconnect(listener),
  }
}

type EventQueue = {
  readonly push: (item: string) => void
  readonly end: () => void
  readonly onEnd: (callback: () => void) => void
  readonly stream: ObserveStream & AsyncIterable<string>
}

function eventQueue(signal: AbortSignal): EventQueue {
  const items: string[] = []
  const endings: (() => void)[] = []
  let waiting: ((result: IteratorResult<string, undefined>) => void) | undefined
  let ended = false

  function end(): void {
    if (ended) return
    ended = true
    waiting?.({ done: true, value: undefined })
    waiting = undefined
    for (const callback of endings.splice(0)) callback()
  }
  if (signal.aborted) end()
  else signal.addEventListener('abort', end, { once: true })

  const stream: EventQueue['stream'] = {
    next() {
      const item = items.shift()
      if (item !== undefined) return Promise.resolve({ done: false, value: item })
      if (ended) return Promise.resolve({ done: true, value: undefined })
      return new Promise(resolve => {
        waiting = resolve
      })
    },
    return() {
      end()
      return Promise.resolve({ done: true, value: undefined })
    },
    [Symbol.asyncIterator]() {
      return stream
    },
  }
  return {
    push(item) {
      if (ended) return
      if (waiting === undefined) items.push(item)
      else {
        const resolve = waiting
        waiting = undefined
        resolve({ done: false, value: item })
      }
    },
    end,
    onEnd(callback) {
      if (ended) callback()
      else endings.push(callback)
    },
    stream,
  }
}

function endedDenied(end: ObserveEnd): boolean {
  return (
    (end.kind === 'refused' && end.outcome === 'denied') ||
    (end.kind === 'ended' && end.reason === 'denied')
  )
}

/** The transport over a channel. `denied` is told of each `denied`: one is not an expired login. */
function channelTransport(channel: ForwardingChannel, denied: () => void): Transport {
  return {
    async call(request) {
      if (request.signal?.aborted === true) return NOT_SENT
      let answer: ChannelAnswer
      try {
        answer = await channel.call(writeCall(request), request.signal)
      } catch {
        return UNCERTAIN
      }
      if ('refused' in answer) return NOT_SENT
      const report = readReport(answer.text)
      if (report.kind === 'answered' && report.outcome === 'denied') denied()
      return report
    },
    async *observe(request): AsyncGenerator<JsonValue, ObserveEnd> {
      const { signal } = request
      let opening: ObserveOpening
      try {
        opening = await channel.observe(writeObserve(request), signal)
      } catch {
        return signal.aborted ? { kind: 'aborted' } : { kind: 'uncertain' }
      }
      if ('refused' in opening) return { kind: 'not-sent' }
      const events = opening.stream
      try {
        for (;;) {
          const next = await events.next()
          if (next.done === true)
            return signal.aborted ? { kind: 'aborted' } : { kind: 'uncertain' }
          const event = readObserveEvent(next.value)
          if ('end' in event) {
            if (endedDenied(event.end)) denied()
            return event.end
          }
          yield event.frame
        }
      } finally {
        await events.return?.()
      }
    },
  }
}

// The page owns the login state. It asks the forwarding layer for the login's standing at start,
// after a `denied`, and after a login whose answer settled nothing.
export function connectPageBridge(channel: ForwardingChannel): Promise<PageBridge> {
  let closed = false
  const listeners = new Set<(state: LoginState) => void>()
  const expiredListeners = new Set<() => void>()
  let state: LoginState = 'signed-out'
  let forwardingProtocols: readonly ProtocolKey[] | null = null
  let asking: Promise<boolean> | undefined
  let changes = 0

  function enter(next: LoginState): void {
    if (state === next) return
    state = next
    changes += 1
    for (const listener of Array.from(listeners)) listener(next)
  }

  function ask(): Promise<boolean> {
    asking ??= (async () => {
      const asked = changes
      try {
        const answer = await channel.loginStanding()
        const standing = 'refused' in answer ? undefined : readLoginStanding(answer.text)
        if (standing === undefined || 'refused' in answer) return false
        forwardingProtocols = readForwardingProtocols(answer.text)
        // The state moved while the answer was on its way: the answer speaks of an older login.
        if (changes !== asked) return true
        enter(standing.state)
        if (standing.note === 'expired') for (const show of Array.from(expiredListeners)) show()
        return true
      } catch {
        return false
      } finally {
        asking = undefined
      }
    })()
    return asking
  }

  // The stream breaking can mean the forwarding layer went away; what it says of the login may differ.
  const stopReconnect = channel.onReconnect?.(() => {
    if (state === 'signed-in') void ask()
  })

  const transport = channelTransport(channel, () => {
    if (state === 'signed-in') void ask()
  })

  async function login(credentials: LoginCredentials): Promise<LoginResult> {
    if (state !== 'signed-out') return 'unavailable'
    enter('signing-in')
    let result: LoginResult = 'unknown'
    try {
      const answer = await channel.login(writeCredentials(credentials))
      result =
        'refused' in answer ? 'unavailable' : (readResult(answer.text, LOGIN_RESULTS) ?? 'unknown')
    } catch {}
    if (result === 'signed-in') enter('signed-in')
    else {
      enter('signed-out')
      // The answer settled nothing: the cookie may be there already. The standing decides.
      if (result !== 'auth-failed' && (await ask()) && bridge.loginState.state() === 'signed-in')
        return 'signed-in'
    }
    return result
  }

  async function logout(): Promise<LogoutResult> {
    if (state === 'signed-out') return 'signed-out'
    if (state !== 'signed-in') return 'unknown'
    enter('signing-out')
    let result: LogoutResult = 'unknown'
    try {
      const answer = await channel.logout()
      if (!('refused' in answer)) result = readResult(answer.text, LOGOUT_RESULTS) ?? 'unknown'
    } catch {}
    enter('signed-out')
    return result
  }

  const bridge: PageBridge = {
    transport,
    loginState: {
      state: () => state,
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    login,
    logout,
    forwardingProtocols: () => forwardingProtocols,
    onExpired(show) {
      expiredListeners.add(show)
      return () => {
        expiredListeners.delete(show)
      }
    },
    close() {
      closed = true
      stopReconnect?.()
    },
  }

  return (async () => {
    for (let attempt = 0; !closed; attempt += 1) {
      if (await ask()) break
      await new Promise(resolve => setTimeout(resolve, retryDelayMs(attempt)))
    }
    return bridge
  })()
}
