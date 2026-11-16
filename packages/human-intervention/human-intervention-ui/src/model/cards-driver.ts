import { defaultBackoff } from '@omne-harness/client-assembly'
import type { HumanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { INITIAL, step, type Effect, type Event, type Reply, type State } from './cards-machine.ts'

export type Schedule = (delayMs: number, run: () => void) => () => void

export type CardsDriverDeps = Readonly<{
  client: ClientOf<HumanInterventionProtocol>
  tenant: TenantId
  newId?: () => string
  schedule?: Schedule
}>

const PAGE_LIMIT = 100

const timeout: Schedule = (delayMs, run) => {
  const handle = setTimeout(run, delayMs)
  return () => clearTimeout(handle)
}

function notSent<T>(call: () => Promise<T>): Promise<T | { readonly outcome: 'unavailable' }> {
  return Promise.resolve()
    .then(call)
    .catch(() => ({ outcome: 'unavailable' as const }))
}

export class CardsDriver {
  #state: State = INITIAL
  readonly #listeners = new Set<() => void>()
  readonly #client: ClientOf<HumanInterventionProtocol>
  readonly #tenant: TenantId
  readonly #newId: () => string
  readonly #schedule: Schedule
  readonly #observations = new Map<number, AbortController>()
  readonly #timers = new Set<() => void>()
  #holders = 0
  #disposed = false

  constructor(deps: CardsDriverDeps) {
    this.#client = deps.client
    this.#tenant = deps.tenant
    this.#newId = deps.newId ?? (() => crypto.randomUUID())
    this.#schedule = deps.schedule ?? timeout
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getState = (): State => this.#state

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

  readList(): void {
    this.dispatch({ kind: 'read-list' })
  }

  submit(key: string, reply: Reply): void {
    this.dispatch({ kind: 'submit', key, reply, replyId: this.#newId() })
  }

  confirm(key: string): void {
    this.dispatch({ kind: 'confirm', key })
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
    const tenant = this.#tenant
    switch (effect.kind) {
      case 'list': {
        const { token, cursor } = effect
        void notSent(() =>
          client['list-cards']({
            tenant,
            filter: { states: ['pending'] },
            cursor,
            limit: PAGE_LIMIT,
          }),
        ).then(answer => this.dispatch({ kind: 'list-answered', token, answer }))
        return
      }
      case 'submit':
      case 'query': {
        const { key, sent } = effect
        const body = { tenant, ...sent }
        void notSent(() =>
          effect.kind === 'submit'
            ? client['submit-reply'](body)
            : client['query-submit-reply'](body),
        ).then(answer =>
          this.dispatch({ kind: 'reply-answered', key, replyId: sent.replyId, answer }),
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
    const frames = this.#client.observe['observe-cards'](
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
        this.dispatch({ kind: 'frame', generation })
      }
    } catch {
      this.dispatch({ kind: 'observation-ended', generation, end: { kind: 'uncertain' } })
    } finally {
      if (this.#observations.get(generation) === controller) this.#observations.delete(generation)
    }
  }
}
