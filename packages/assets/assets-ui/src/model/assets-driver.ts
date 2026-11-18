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
import type { CreateAnswer, CreateRequest } from './creation.ts'

/** One file of a directory to upload, by its path inside the directory. */
export type LocalFile = Readonly<{ path: string; bytes: Uint8Array }>

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
  readonly #files = new Map<string, readonly LocalFile[]>()
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

  /** A new asset: the bytes of a directory stay here, only its manifest goes into the state. */
  create(request: CreateRequest, files: readonly LocalFile[] = []): void {
    const operation = this.#newId()
    if (request.kind === 'directory') this.#files.set(operation, files)
    this.dispatch({ kind: 'create', operation, request })
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
      case 'create': {
        const { operation, request } = effect
        void this.#create(operation, request).then(answer => {
          this.#files.delete(operation)
          this.dispatch({ kind: 'create-answered', operation, answer })
        })
        return
      }
      case 'recall-create': {
        const { operation, request } = effect
        const asked =
          request.kind === 'data'
            ? ({ kind: 'create-asset', category, name: request.name, body: request.body } as const)
            : ({ kind: 'commit-asset-upload' } as const)
        void notSent(() =>
          client['query-asset-operation']({ tenant, operation, request: asked }),
        ).then(answer => this.dispatch({ kind: 'confirm-create-answered', operation, answer }))
        return
      }
    }
  }

  async #create(operation: string, request: CreateRequest): Promise<CreateAnswer> {
    const { client, tenant, category } = this.#deps
    const { name } = request
    if (request.kind === 'data')
      return notSent(() =>
        client['create-asset']({ tenant, operation, category, name, body: request.body }),
      )
    const manifest = request.manifest
    const begun = await notSent(() =>
      client['begin-asset-upload']({ tenant, operation, category, name, manifest }),
    )
    if (begun.outcome !== 'succeeded') return begun
    const { partBytes, received } = begun.body
    let acked = received.reduce((sum, entry) => sum + entry.bytes, 0)
    this.dispatch({ kind: 'create-progress', operation, received: acked })
    for (const file of this.#files.get(operation) ?? []) {
      let offset = received.find(entry => entry.path === file.path)?.bytes ?? 0
      while (offset < file.bytes.length) {
        const part = file.bytes.subarray(offset, offset + partBytes)
        const sent = await notSent(() =>
          client['append-asset-upload']({
            tenant,
            upload: operation,
            path: file.path,
            offset,
            bytes: part,
          }),
        )
        if (sent.outcome !== 'succeeded') return sent
        if (sent.body.received <= offset) return { outcome: 'stalled' }
        acked += sent.body.received - offset
        offset = sent.body.received
        this.dispatch({ kind: 'create-progress', operation, received: acked })
      }
    }
    return notSent(() => client['commit-asset-upload']({ tenant, upload: operation }))
  }
}
