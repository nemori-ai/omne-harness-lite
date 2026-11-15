import type { LoginState } from '@omne-harness/client-assembly/cordis'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallReport, ObserveEnd, Transport } from '@omne-harness/sdk/core'
import type {
  HostBridge,
  HostAnswer,
  HostChannel,
  LoginCredentials,
  LoginResult,
  LogoutResult,
  ObserveOpening,
  ObserveStream,
  OmneHost,
} from '../shared/host-bridge.ts'
import {
  BRIDGE,
  readLoginState,
  readObserveEvent,
  readReport,
  readResult,
  writeCall,
  writeCredentials,
  writeObserve,
} from '../shared/wire.ts'
import { sseData } from './sse.ts'

export type PageBridge = HostBridge & {
  close(): void
}

const NOT_SENT: CallReport = Object.freeze({ kind: 'not-sent' })
const UNCERTAIN: CallReport = Object.freeze({ kind: 'uncertain' })
const JSON_HEADERS = { 'content-type': 'application/json' }
const LOGIN_RESULTS: readonly LoginResult[] = ['signed-in', 'auth-failed', 'unknown', 'unavailable']
const LOGOUT_RESULTS: readonly LogoutResult[] = ['signed-out', 'unknown']

const retryDelayMs = (attempt: number): number => Math.min(200 * 2 ** attempt, 5_000)

/** A refusal before forwarding (4xx) proves nothing left for the server; anything else may have. */
const refusedBeforeForwarding = (response: Response): boolean =>
  response.status >= 400 && response.status < 500

export function httpHostChannel(origin: string): HostChannel {
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

  async function answer(path: string, body: string, signal?: AbortSignal): Promise<HostAnswer> {
    const response = await post(path, body, signal)
    if (response.ok) return { text: await response.text() }
    if (refusedBeforeForwarding(response)) return { refused: true }
    throw new Error('the host failed')
  }

  return {
    call: (request, signal) => answer(BRIDGE.call, request, signal),
    async observe(request, signal) {
      const response = await post(BRIDGE.observe, request, signal)
      if (response.ok) return { stream: sseData(response) }
      if (refusedBeforeForwarding(response)) return { refused: true }
      throw new Error('the host failed')
    },
    login: credentials => answer(BRIDGE.login, credentials),
    logout: () => answer(BRIDGE.logout, '{}'),
    async *loginState(signal) {
      const response = await fetch(url(BRIDGE.loginState), { cache: 'no-store', signal })
      if (response.ok) yield* sseData(response)
    },
  }
}

type EventQueue = {
  readonly push: (item: string) => void
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
    onEnd(callback) {
      if (ended) callback()
      else endings.push(callback)
    },
    stream,
  }
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return pending
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason)
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function ipcHostChannel(host: OmneHost): HostChannel {
  return {
    call: (request, signal) => abortable(host.call(request), signal),
    async observe(request, signal) {
      const queue = eventQueue(signal)
      const handle = await host.observe(request, queue.push)
      if (handle === undefined) return { refused: true }
      queue.onEnd(() => handle.close())
      return { stream: queue.stream }
    },
    login: credentials => host.login(credentials),
    logout: () => host.logout(),
    async *loginState(signal) {
      const queue = eventQueue(signal)
      const handle = await host.loginState(queue.push)
      if (handle === undefined) return
      queue.onEnd(() => handle.close())
      yield* queue.stream
    },
  }
}

export function connectPageBridge(channel: HostChannel): Promise<PageBridge> {
  const closed = new AbortController()
  const listeners = new Set<(state: LoginState) => void>()
  let state: LoginState | undefined
  let ready: (bridge: PageBridge) => void = () => {}

  const transport: Transport = {
    async call(request) {
      if (request.signal?.aborted === true) return NOT_SENT
      let answer: HostAnswer
      try {
        answer = await channel.call(writeCall(request), request.signal)
      } catch {
        return UNCERTAIN
      }
      return 'refused' in answer ? NOT_SENT : readReport(answer.text)
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
          if ('end' in event) return event.end
          yield event.frame
        }
      } finally {
        await events.return?.()
      }
    },
  }

  function enter(next: LoginState): void {
    if (state === next) return
    const first = state === undefined
    state = next
    if (first) ready(bridge)
    for (const listener of Array.from(listeners)) listener(next)
  }

  async function follow(): Promise<void> {
    for (let attempt = 0; !closed.signal.aborted; attempt += 1) {
      try {
        for await (const data of channel.loginState(closed.signal)) {
          const next = readLoginState(data)
          if (next !== undefined) enter(next)
          attempt = 0
        }
      } catch {}
      if (closed.signal.aborted) return
      await new Promise(resolve => setTimeout(resolve, retryDelayMs(attempt)))
    }
  }

  async function login(credentials: LoginCredentials): Promise<LoginResult> {
    try {
      const answer = await channel.login(writeCredentials(credentials))
      if ('refused' in answer) return 'unavailable'
      return readResult(answer.text, LOGIN_RESULTS) ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  async function logout(): Promise<LogoutResult> {
    try {
      const answer = await channel.logout()
      if ('refused' in answer) return 'unknown'
      return readResult(answer.text, LOGOUT_RESULTS) ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  const bridge: PageBridge = {
    transport,
    loginState: {
      // The bridge is handed out only after the first state arrived; `??` only narrows the type.
      state: () => state ?? 'signed-out',
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    login,
    logout,
    close: () => closed.abort(),
  }

  return new Promise(resolve => {
    ready = resolve
    void follow()
  })
}
