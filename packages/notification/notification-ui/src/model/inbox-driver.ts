import { defaultBackoff } from '@omne-harness/client-assembly'
import type { NotificationProtocol } from '@omne-harness/notification-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  INITIAL,
  deniedEnd,
  step,
  type Effect,
  type Event,
  type Filter,
  type MarkOperation,
  type State,
} from './inbox-machine.ts'

export type Schedule = (delayMs: number, run: () => void) => () => void

export type InboxDriverDeps = Readonly<{
  client: ClientOf<NotificationProtocol>
  tenant: TenantId
  schedule?: Schedule
}>

const PAGE_LIMIT = 100
/** The panel is the inbox of the person the tenant is. */
const RECIPIENT = { kind: 'person' } as const

const timeout: Schedule = (delayMs, run) => {
  const handle = setTimeout(run, delayMs)
  return () => clearTimeout(handle)
}

/** A call that threw never reached the server as far as the panel knows. */
function notSent<T>(call: () => Promise<T>): Promise<T | { readonly outcome: 'unavailable' }> {
  return Promise.resolve()
    .then(call)
    .catch(() => ({ outcome: 'unavailable' as const }))
}

/** Runs the inbox machine of one tenant against the protocol client. */
export class InboxDriver {
  #state: State = INITIAL
  readonly #listeners = new Set<() => void>()
  readonly #client: ClientOf<NotificationProtocol>
  readonly #tenant: TenantId
  readonly #schedule: Schedule
  /** At most one observation is open and at most one reconnect is waiting. */
  #observation: AbortController | undefined
  #cancelRetry: (() => void) | undefined
  #holders = 0
  #disposed = false

  constructor(deps: InboxDriverDeps) {
    this.#client = deps.client
    this.#tenant = deps.tenant
    this.#schedule = deps.schedule ?? timeout
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getState = (): State => this.#state

  /** Watches while anything on screen holds it. */
  retain = (): (() => void) => {
    this.#holders += 1
    this.dispatch({ kind: 'watch' })
    let held = true
    return () => {
      if (!held) return
      held = false
      this.#holders -= 1
      if (this.#holders === 0) this.dispatch({ kind: 'unwatch' })
    }
  }

  refresh(): void {
    this.dispatch({ kind: 'refresh' })
  }

  filter(filter: Filter): void {
    this.dispatch({ kind: 'filter', filter })
  }

  mark(key: string, operation: MarkOperation): void {
    this.dispatch({ kind: 'mark', key, operation })
  }

  open(key: string): void {
    this.dispatch({ kind: 'open', key })
  }

  close(): void {
    this.dispatch({ kind: 'close' })
  }

  /** Reads the opened notification again after its body could not be read. */
  reread(): void {
    this.dispatch({ kind: 'reread' })
  }

  dispose(): void {
    this.#disposed = true
    this.#stop()
  }

  dispatch(event: Event): void {
    if (this.#disposed) return
    const next = step(this.#state, event)
    const changed = next.state !== this.#state
    this.#state = next.state
    for (const effect of next.effects) this.#run(effect)
    if (changed) for (const listener of this.#listeners) listener()
  }

  #stop(): void {
    this.#observation?.abort()
    this.#cancelRetry?.()
  }

  #run(effect: Effect): void {
    const client = this.#client
    const target = { tenant: this.#tenant, recipient: RECIPIENT }
    switch (effect.kind) {
      case 'list': {
        const { token, filter, after } = effect
        void notSent(() =>
          client['list-inbox']({ ...target, filter, after, limit: PAGE_LIMIT }),
        ).then(answer => this.dispatch({ kind: 'list-answered', token, answer }))
        return
      }
      case 'mark': {
        const { key, ref, operation } = effect
        void notSent(() => client.mark({ ...target, ...ref, operation })).then(answer =>
          this.dispatch({ kind: 'mark-answered', key, answer }),
        )
        return
      }
      case 'read': {
        const { token, ref } = effect
        void notSent(() => client['read-notification']({ ...target, ...ref })).then(answer =>
          this.dispatch({ kind: 'read-answered', token, answer }),
        )
        return
      }
      case 'sources': {
        const { token } = effect
        void notSent(() => client['list-sources']({ tenant: this.#tenant })).then(answer =>
          this.dispatch({ kind: 'sources-answered', token, answer }),
        )
        return
      }
      case 'observe':
        void this.#observe(effect.generation)
        return
      case 'stop-observing':
        this.#stop()
        return
      case 'reconnect-later':
        this.#reconnectLater(effect.generation, effect.attempt)
        return
    }
  }

  #reconnectLater(generation: number, attempt: number): void {
    this.#cancelRetry = this.#schedule(defaultBackoff.delayMs(attempt - 1), () =>
      this.dispatch({ kind: 'reconnect-due', generation }),
    )
  }

  async #observe(generation: number): Promise<void> {
    const controller = new AbortController()
    this.#observation = controller
    const frames = this.#client.observe['observe-changes'](
      { tenant: this.#tenant },
      { signal: controller.signal },
    )
    try {
      for (;;) {
        const next = await frames.next()
        if (next.done === true) {
          const denied = deniedEnd(next.value)
          this.dispatch({ kind: 'observation-ended', generation, denied })
          return
        }
        this.dispatch({ kind: 'frame', generation, about: next.value.about })
      }
    } catch {
      this.dispatch({ kind: 'observation-ended', generation, denied: false })
    }
  }
}
