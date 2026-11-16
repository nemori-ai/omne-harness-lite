import type { HumanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { INITIAL, step, type Effect, type Event, type Reply, type State } from './cards-machine.ts'

export type CardsDriverDeps = Readonly<{
  client: ClientOf<HumanInterventionProtocol>
  tenant: TenantId
  newId?: () => string
}>

const PAGE_LIMIT = 100

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
  #disposed = false

  constructor(deps: CardsDriverDeps) {
    this.#client = deps.client
    this.#tenant = deps.tenant
    this.#newId = deps.newId ?? (() => crypto.randomUUID())
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getState = (): State => this.#state

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
    }
  }
}
