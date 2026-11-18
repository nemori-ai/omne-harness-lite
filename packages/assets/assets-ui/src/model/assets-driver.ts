import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  INITIAL_ASSETS,
  stepAssets,
  type AssetRequest,
  type AssetsEffect,
  type AssetsEvent,
  type AssetsState,
} from './assets-machine.ts'

export type AssetsDriverDeps = Readonly<{
  client: ClientOf<AssetsProtocol>
  tenant: TenantId
  category: string
  newId?: () => string
}>

const PAGE_LIMIT = 100

function notSent<T>(call: () => Promise<T>): Promise<T | { readonly outcome: 'unavailable' }> {
  return Promise.resolve()
    .then(call)
    .catch(() => ({ outcome: 'unavailable' as const }))
}

/** The assets of one category of one tenant: runs what the machine asks for and tells listeners. */
export class AssetsDriver {
  #state: AssetsState = INITIAL_ASSETS
  readonly #listeners = new Set<() => void>()
  readonly #deps: AssetsDriverDeps
  readonly #newId: () => string
  #disposed = false

  constructor(deps: AssetsDriverDeps) {
    this.#deps = deps
    this.#newId = deps.newId ?? (() => crypto.randomUUID())
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getState = (): AssetsState => this.#state

  start(): void {
    this.dispatch({ kind: 'read-category' })
    this.dispatch({ kind: 'read-list' })
  }

  change(name: string, request: AssetRequest): void {
    this.dispatch({ kind: 'change', name, request, operation: this.#newId() })
  }

  dispose(): void {
    this.#disposed = true
    this.#listeners.clear()
  }

  dispatch(event: AssetsEvent): void {
    if (this.#disposed) return
    const next = stepAssets(this.#state, event)
    const changed = next.state !== this.#state
    this.#state = next.state
    for (const effect of next.effects) this.#run(effect)
    if (changed) for (const listener of this.#listeners) listener()
  }

  #run(effect: AssetsEffect): void {
    const { client, tenant, category } = this.#deps
    switch (effect.kind) {
      case 'list': {
        const { token, after } = effect
        void notSent(() =>
          client['list-assets']({ tenant, category, after, limit: PAGE_LIMIT }),
        ).then(answer => this.dispatch({ kind: 'list-answered', token, answer }))
        return
      }
      case 'category':
        void notSent(() => client['describe-category']({ category })).then(answer =>
          this.dispatch({ kind: 'category-answered', answer }),
        )
        return
      case 'describe': {
        const { name, token } = effect
        void notSent(() => client['describe-asset']({ tenant, category, name })).then(answer =>
          this.dispatch({ kind: 'detail-answered', name, token, answer }),
        )
        return
      }
      case 'change': {
        const { name, sent } = effect
        const { operation, holding, request } = sent
        const call = () =>
          request.kind === 'remove'
            ? client['remove-asset']({ tenant, operation, holding })
            : client['set-asset-enabled']({
                tenant,
                operation,
                holding,
                enabled: request.kind === 'enable',
              })
        void notSent(call).then(answer =>
          this.dispatch({ kind: 'change-answered', name, operation, answer }),
        )
        return
      }
      case 'recall': {
        const { name, sent } = effect
        const { operation, holding, request } = sent
        const asked =
          request.kind === 'remove'
            ? ({ kind: 'remove-asset', holding } as const)
            : ({ kind: 'set-asset-enabled', holding, enabled: request.kind === 'enable' } as const)
        void notSent(() =>
          client['query-asset-operation']({ tenant, operation, request: asked }),
        ).then(answer => this.dispatch({ kind: 'confirm-answered', name, operation, answer }))
        return
      }
    }
  }
}
