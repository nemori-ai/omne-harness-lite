import { defaultBackoff } from '@omne-harness/client-assembly'
import type { NotificationProtocol } from '@omne-harness/notification-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  INITIAL,
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
  readonly #observations = new Map<number, AbortController>()
  readonly #timers = new Set<() => void>()
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
    if (this.#holders === 1) this.dispatch({ kind: 'watch' })
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

  dispose(): void {
    this.#disposed = true
    this.#stop()
    this.#listeners.clear()
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
    for (const controller of this.#observations.values()) controller.abort()
    this.#observations.clear()
    for (const cancel of this.#timers) cancel()
    this.#timers.clear()
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
    const cancel = this.#schedule(defaultBackoff.delayMs(attempt - 1), () => {
      this.#timers.delete(cancel)
      this.dispatch({ kind: 'reconnect-due', generation })
    })
    this.#timers.add(cancel)
  }

  async #observe(generation: number): Promise<void> {
    const controller = new AbortController()
    this.#observations.set(generation, controller)
    const frames = this.#client.observe['observe-changes'](
      { tenant: this.#tenant },
      { signal: controller.signal },
    )
    try {
      for (;;) {
        const next = await frames.next()
        if (next.done === true) {
          this.dispatch({ kind: 'observation-ended', generation, end: next.value })
          return
        }
        this.dispatch({ kind: 'frame', generation, about: next.value.about })
      }
    } catch {
      this.dispatch({ kind: 'observation-ended', generation, end: { kind: 'uncertain' } })
    } finally {
      if (this.#observations.get(generation) === controller) this.#observations.delete(generation)
    }
  }
}
