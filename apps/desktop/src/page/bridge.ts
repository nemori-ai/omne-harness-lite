import type { LoginState } from '@omne-harness/client-assembly/cordis'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallReport, ObserveEnd, Transport } from '@omne-harness/sdk/core'
import type {
  HostBridge,
  LoginCredentials,
  LoginResult,
  LogoutResult,
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

export function connectPageBridge(options: { readonly origin: string }): Promise<PageBridge> {
  const url = (path: string): string => new URL(path, options.origin).toString()
  const closed = new AbortController()
  const listeners = new Set<(state: LoginState) => void>()
  let state: LoginState | undefined
  let ready: (bridge: PageBridge) => void = () => {}

  async function post(path: string, body: string, signal?: AbortSignal): Promise<Response> {
    return fetch(url(path), {
      method: 'POST',
      headers: JSON_HEADERS,
      body,
      cache: 'no-store',
      ...(signal === undefined ? {} : { signal }),
    })
  }

  const transport: Transport = {
    async call(request) {
      if (request.signal?.aborted === true) return NOT_SENT
      let response: Response
      try {
        response = await post(BRIDGE.call, writeCall(request), request.signal)
      } catch {
        return UNCERTAIN
      }
      if (!response.ok) return refusedBeforeForwarding(response) ? NOT_SENT : UNCERTAIN
      return response.text().then(readReport, () => UNCERTAIN)
    },
    async *observe(request): AsyncGenerator<JsonValue, ObserveEnd> {
      const { signal } = request
      let response: Response
      try {
        response = await post(BRIDGE.observe, writeObserve(request), signal)
      } catch {
        return signal.aborted ? { kind: 'aborted' } : { kind: 'uncertain' }
      }
      if (!response.ok)
        return refusedBeforeForwarding(response) ? { kind: 'not-sent' } : { kind: 'uncertain' }
      const events = sseData(response)
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
        await events.return('ended')
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
        const response = await fetch(url(BRIDGE.loginState), {
          cache: 'no-store',
          signal: closed.signal,
        })
        if (response.ok)
          for await (const data of sseData(response)) {
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
      const response = await post(BRIDGE.login, writeCredentials(credentials))
      if (!response.ok) return refusedBeforeForwarding(response) ? 'unavailable' : 'unknown'
      return readResult(await response.text(), LOGIN_RESULTS) ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  async function logout(): Promise<LogoutResult> {
    try {
      const response = await post(BRIDGE.logout, '{}')
      if (!response.ok) return 'unknown'
      return readResult(await response.text(), LOGOUT_RESULTS) ?? 'unknown'
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
