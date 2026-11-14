import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { INITIAL, step, type Effect, type Event, type State } from './settings-machine.ts'

export type SettingsDriverDeps = Readonly<{
  client: ClientOf<AssetsProtocol>
  tenant: TenantId
  newId?: () => string
}>

const PAGE_LIMIT = 100

function notSent<T>(call: () => Promise<T>): Promise<T | { readonly outcome: 'unavailable' }> {
  return Promise.resolve()
    .then(call)
    .catch(() => ({ outcome: 'unavailable' as const }))
}

export class SettingsDriver {
  #state: State = INITIAL
  readonly #listeners = new Set<() => void>()
  readonly #client: ClientOf<AssetsProtocol>
  readonly #tenant: TenantId
  readonly #newId: () => string
  #disposed = false

  constructor(deps: SettingsDriverDeps) {
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

  set(key: string, pick: string): void {
    this.dispatch({ kind: 'set', key, pick, operation: this.#newId() })
  }

  clear(key: string): void {
    this.dispatch({ kind: 'clear', key, operation: this.#newId() })
  }

  confirm(key: string): void {
    this.dispatch({ kind: 'confirm', key })
  }

  retryRow(key: string): void {
    this.dispatch({ kind: 'retry-row', key })
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
        const { token, after } = effect
        void notSent(() => client['list-settings']({ tenant, after, limit: PAGE_LIMIT })).then(
          answer => this.dispatch({ kind: 'list-answered', token, answer }),
        )
        return
      }
      case 'describe': {
        const { key, token, target } = effect
        void notSent(() => client['describe-setting']({ tenant, ...target })).then(answer =>
          this.dispatch({ kind: 'describe-answered', key, token, answer }),
        )
        return
      }
      case 'write': {
        const { key, target, sent } = effect
        const { operation, expectedRevision, request } = sent
        const body = { tenant, ...target, operation, expectedRevision }
        const options = { messageId: operation }
        void notSent(() =>
          request.kind === 'set'
            ? client['set-setting'](
                { ...body, value: { kind: 'permission', pick: request.pick } },
                options,
              )
            : client['clear-setting'](body, options),
        ).then(answer => this.dispatch({ kind: 'write-answered', key, operation, answer }))
        return
      }
    }
  }
}
