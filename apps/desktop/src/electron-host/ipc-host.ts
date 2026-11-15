import type { LoginSession } from '../main-core/index.ts'
import {
  HOST_IPC,
  type HostAnswer,
  type HostObserveReply,
  type HostSubscribeReply,
} from '../shared/host-bridge.ts'
import {
  readCall,
  readCredentials,
  readObserve,
  writeLoginState,
  writeObserveEvent,
  writeReport,
  writeResult,
} from '../shared/wire.ts'

export interface HostPage {
  readonly id: number
  send(channel: string, payload: unknown): void
  /** Calls `listener` once, when this load of the page is closed, reloaded or crashed. */
  onGone(listener: () => void): void
}

export type HostCall = { readonly frameUrl: string | undefined; readonly page: HostPage }

export interface HostIpc {
  handle(channel: string, handler: (call: HostCall, ...args: unknown[]) => unknown): void
}

export type IpcHostOptions = {
  readonly session: LoginSession
  readonly ipc: HostIpc
  readonly appUrl: string
}

const REFUSED = Object.freeze({ refused: true as const })

type Observation = {
  readonly controller: AbortController
  readonly frames: ReturnType<LoginSession['transport']['observe']>
}

type PageState = {
  readonly lifetime: AbortController
  readonly observations: Map<number, Observation>
  unsubscribe: (() => void) | undefined
}

export function serveHostIpc(options: IpcHostOptions): void {
  const { session, ipc, appUrl } = options
  const pages = new Map<number, PageState>()
  let lastObservation = 0

  function release(id: number): void {
    const state = pages.get(id)
    if (state === undefined) return
    pages.delete(id)
    state.lifetime.abort()
    for (const observation of state.observations.values()) stop(observation)
    state.observations.clear()
    state.unsubscribe?.()
  }

  function stateOf(page: HostPage): PageState {
    const known = pages.get(page.id)
    if (known !== undefined) return known
    const state: PageState = {
      lifetime: new AbortController(),
      observations: new Map(),
      unsubscribe: undefined,
    }
    pages.set(page.id, state)
    page.onGone(() => release(page.id))
    return state
  }

  function stop(observation: Observation): void {
    observation.controller.abort()
    void observation.frames.return({ kind: 'aborted' })
  }

  async function pump(page: HostPage, id: number, state: PageState): Promise<void> {
    const observation = state.observations.get(id)
    if (observation === undefined) return
    const send = (text: string): void => page.send(HOST_IPC.observeEvent, { id, text })
    try {
      for (;;) {
        const next = await observation.frames.next()
        if (!state.observations.has(id)) return
        if (next.done === true) {
          state.observations.delete(id)
          return send(writeObserveEvent({ end: next.value }))
        }
        send(writeObserveEvent({ frame: next.value }))
      }
    } catch {
      if (state.observations.delete(id)) send(writeObserveEvent({ end: { kind: 'uncertain' } }))
    }
  }

  const textOf = (args: readonly unknown[]): string | undefined =>
    typeof args[0] === 'string' ? args[0] : undefined

  async function call(page: HostPage, args: readonly unknown[]): Promise<HostAnswer> {
    const text = textOf(args)
    const message = text === undefined ? undefined : readCall(text)
    if (message === undefined) return REFUSED
    const { signal } = stateOf(page).lifetime
    return { text: writeReport(await session.transport.call({ ...message, signal })) }
  }

  function observe(page: HostPage, args: readonly unknown[]): HostObserveReply {
    const text = textOf(args)
    const message = text === undefined ? undefined : readObserve(text)
    if (message === undefined) return REFUSED
    const state = stateOf(page)
    lastObservation += 1
    const id = lastObservation
    const controller = new AbortController()
    const frames = session.transport.observe({ ...message, signal: controller.signal })
    state.observations.set(id, { controller, frames })
    void pump(page, id, state)
    return { id }
  }

  function observeClose(page: HostPage, args: readonly unknown[]): boolean {
    const state = pages.get(page.id)
    const id = args[0]
    if (state === undefined || typeof id !== 'number') return false
    const observation = state.observations.get(id)
    if (observation === undefined) return false
    state.observations.delete(id)
    stop(observation)
    return true
  }

  async function login(args: readonly unknown[]): Promise<HostAnswer> {
    const text = textOf(args)
    const credentials = text === undefined ? undefined : readCredentials(text)
    if (credentials === undefined) return REFUSED
    return { text: writeResult(await session.login(credentials)) }
  }

  async function logout(): Promise<HostAnswer> {
    return { text: writeResult(await session.logout()) }
  }

  function loginState(page: HostPage): HostSubscribeReply {
    const state = stateOf(page)
    const push = (current: Parameters<typeof writeLoginState>[0]): void =>
      page.send(HOST_IPC.loginStateEvent, writeLoginState(current))
    state.unsubscribe ??= session.subscribe(push)
    push(session.state())
    return { subscribed: true }
  }

  const trusted = (call: HostCall): boolean =>
    call.frameUrl !== undefined && call.frameUrl.startsWith(appUrl)

  function declare(
    channel: string,
    refusal: unknown,
    handler: (page: HostPage, args: readonly unknown[]) => unknown,
  ): void {
    ipc.handle(channel, (from, ...args) => (trusted(from) ? handler(from.page, args) : refusal))
  }

  declare(HOST_IPC.call, REFUSED, call)
  declare(HOST_IPC.observe, REFUSED, observe)
  declare(HOST_IPC.observeClose, false, observeClose)
  declare(HOST_IPC.login, REFUSED, (_page, args) => login(args))
  declare(HOST_IPC.logout, REFUSED, logout)
  declare(HOST_IPC.loginState, REFUSED, loginState)
}
