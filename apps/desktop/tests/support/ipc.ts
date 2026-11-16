import type { LoginSession } from '../../src/main-core/index.ts'
import { serveHostIpc, type HostCall, type HostPage } from '../../src/electron-host/ipc-host.ts'
import {
  HOST_IPC,
  type HostAnswer,
  type HostObserveEvent,
  type HostObserveReply,
  type HostSubscribeReply,
  type OmneHost,
} from '../../src/shared/host-bridge.ts'

export const APP_URL = 'omne-app://app/'

type Sent = { readonly channel: string; readonly payload: unknown }

export class FakePage implements HostPage {
  readonly sent: Sent[] = []
  readonly goneListeners: (() => void)[] = []
  readonly taps: ((sent: Sent) => void)[] = []
  constructor(readonly id: number) {}
  send(channel: string, payload: unknown): void {
    const sent = { channel, payload }
    this.sent.push(sent)
    for (const tap of this.taps) tap(sent)
  }
  onGone(listener: () => void): void {
    this.goneListeners.push(listener)
  }
  gone(): void {
    for (const listener of this.goneListeners.splice(0)) listener()
  }
  events(channel: string): unknown[] {
    return this.sent.filter(item => item.channel === channel).map(item => item.payload)
  }
}

export type Invoke = (
  channel: string,
  page: FakePage,
  args?: unknown[],
  from?: { readonly frameUrl: string | undefined },
) => Promise<unknown>

export function serveFakeIpc(session: LoginSession): {
  readonly handlers: Map<string, (call: HostCall, ...args: unknown[]) => unknown>
  readonly invoke: Invoke
} {
  const handlers = new Map<string, (call: HostCall, ...args: unknown[]) => unknown>()
  serveHostIpc({
    session,
    appUrl: APP_URL,
    ipc: { handle: (channel, handler) => handlers.set(channel, handler) },
  })
  const invoke: Invoke = (
    channel,
    page,
    args = [],
    from = { frameUrl: `${APP_URL}index.html` },
  ) => {
    const handler = handlers.get(channel)
    if (handler === undefined) throw new Error(`no handler for ${channel}`)
    return Promise.resolve(handler({ frameUrl: from.frameUrl, page }, ...args))
  }
  return { handlers, invoke }
}

/** What the preload script builds out of the invoke channels, run against the real main-process side. */
export function omneHostOver(session: LoginSession, page = new FakePage(1)): OmneHost {
  const { invoke } = serveFakeIpc(session)
  const observers = new Map<number, (event: string) => void>()
  const early = new Map<number, string[]>()
  const states = new Set<(state: string) => void>()
  page.taps.push(({ channel, payload }) => {
    if (channel === HOST_IPC.loginStateEvent)
      for (const listener of states) listener(payload as string)
    if (channel !== HOST_IPC.observeEvent) return
    const event = payload as HostObserveEvent
    const listener = observers.get(event.id)
    if (listener === undefined) early.set(event.id, [...(early.get(event.id) ?? []), event.text])
    else listener(event.text)
  })
  return {
    call: request => invoke(HOST_IPC.call, page, [request]) as Promise<HostAnswer>,
    login: credentials => invoke(HOST_IPC.login, page, [credentials]) as Promise<HostAnswer>,
    logout: () => invoke(HOST_IPC.logout, page) as Promise<HostAnswer>,
    async observe(request, listener) {
      const reply = (await invoke(HOST_IPC.observe, page, [request])) as HostObserveReply
      if ('refused' in reply) return undefined
      observers.set(reply.id, listener)
      for (const text of early.get(reply.id) ?? []) listener(text)
      early.delete(reply.id)
      return {
        close() {
          observers.delete(reply.id)
          void invoke(HOST_IPC.observeClose, page, [reply.id])
        },
      }
    },
    async loginState(listener) {
      states.add(listener)
      const reply = (await invoke(HOST_IPC.loginState, page)) as HostSubscribeReply
      if ('refused' in reply) return undefined
      return { close: () => void states.delete(listener) }
    },
  }
}
