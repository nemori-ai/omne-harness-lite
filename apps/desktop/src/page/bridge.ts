// The page's `HostBridge` (seam four): `fetch` against the host's same-origin addresses. It is the
// client core's `Transport` and the client assembly's `LoginStateSource`. It never sees a login
// proof: no answer of the host carries one.
import type { LoginState } from '@omne-harness/client-assembly/cordis'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallReport, ObserveEnd, Transport } from '@omne-harness/sdk/core'
import type { HostBridge, LoginResult, LogoutResult } from '../shared/host-bridge.ts'
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
  /** Stops following the login state. */
  close(): void
}

export type PageBridgeOptions = {
  /** The host's origin; in the browser, `location.origin`. */
  readonly origin: string
  /** Waits before following the login state again after its stream broke. */
  readonly retryDelayMs?: (attempt: number) => number
}

const NOT_SENT: CallReport = Object.freeze({ kind: 'not-sent' })
const UNCERTAIN: CallReport = Object.freeze({ kind: 'uncertain' })
const JSON_HEADERS = { 'content-type': 'application/json' }

const defaultRetry = (attempt: number): number => Math.min(200 * 2 ** attempt, 5_000)

/** A refusal before forwarding (4xx) proves nothing left for the server; anything else may have. */
const refusedBeforeForwarding = (response: Response): boolean =>
  response.status >= 400 && response.status < 500

/** Connects to the host; resolves once the first login state arrived. */
export function connectPageBridge(options: PageBridgeOptions): Promise<PageBridge> {
  const url = (path: string): string => new URL(path, options.origin).toString()
  const retry = options.retryDelayMs ?? defaultRetry
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

  /** Follows the login state stream; follows it again after it breaks. */
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
      } catch {
        // The host is not there right now; try again below.
      }
      if (closed.signal.aborted) return
      await new Promise(resolve => setTimeout(resolve, retry(attempt)))
    }
  }

  async function login(credentials: Parameters<HostBridge['login']>[0]): Promise<LoginResult> {
    try {
      const response = await post(BRIDGE.login, writeCredentials(credentials))
      if (!response.ok) return refusedBeforeForwarding(response) ? 'unavailable' : 'unknown'
      const results: readonly LoginResult[] = ['signed-in', 'auth-failed', 'unknown', 'unavailable']
      return readResult(await response.text(), results) ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  async function logout(): Promise<LogoutResult> {
    try {
      const response = await post(BRIDGE.logout, '{}')
      if (!response.ok) return 'unknown'
      const results: readonly LogoutResult[] = ['signed-out', 'unknown']
      return readResult(await response.text(), results) ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  const bridge: PageBridge = {
    transport,
    loginState: {
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
