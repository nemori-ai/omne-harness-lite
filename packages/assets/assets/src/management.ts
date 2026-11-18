import type { CategoryView } from './category-point.ts'
import { evaluate, type Evaluation } from './evaluate.ts'
import type { CapabilityId, JsonValue } from './identity.ts'
import { collectCandidates, type AssetEntry, type AssetLayerSource } from './layers.ts'
import { MAX_ASSET_PAGE } from './layers.ts'
import type { TenantActing } from './publishing.ts'
import type { AssetSummary } from './summary.ts'

/** Where a holding came from: a tenant publication is customized, a deployment's is official. */
export type AssetOrigin = 'customized' | 'official'

export type AssetRow = AssetEntry &
  Readonly<{ holding: string; origin: AssetOrigin; summary: AssetSummary | null }>

export type AssetRowPage = Readonly<{
  kind: 'page'
  items: readonly AssetRow[]
  next: string | null
  completeness: 'complete' | 'partial'
}>

export type ManagedList =
  | AssetRowPage
  | Readonly<{ kind: 'denied' | 'unavailable' | 'invalid' | 'unknown-category' }>

export type AssetContent =
  | Readonly<{ kind: 'data'; body: JsonValue }>
  | Readonly<{ kind: 'directory'; entries: readonly Readonly<{ path: string; bytes: number }>[] }>

export type AssetStanding =
  | Readonly<{ kind: 'selected' }>
  | Readonly<{ kind: 'filtered'; reason: 'disabled' | 'ineligible' | 'blocked'; by?: string }>
  | Readonly<{ kind: 'unavailable'; layer: string }>

export type ManagedAsset =
  | Readonly<{
      kind: 'asset'
      row: AssetRow
      revision: number
      content: AssetContent
      standing: AssetStanding
      settings: boolean
    }>
  | Readonly<{ kind: 'absent' | 'denied' | 'unavailable' }>

export type HoldingChange =
  | Readonly<{ kind: 'remove' }>
  | Readonly<{ kind: 'setEnabled'; enabled: boolean }>

export type HoldingOutcome =
  | Readonly<{ kind: 'changed' | 'no-change' | 'absent' | 'denied' | 'unavailable' | 'conflict' }>
  | Readonly<{ kind: 'operation-conflict' }>
  | Readonly<{ kind: 'not-writable'; reason: 'official' | 'removed' }>
  | Readonly<{ kind: 'unknown'; operationId: string }>

/** What the store answers for a change it was given, or for the receipt of an operation. */
export type StoreChange =
  | Readonly<{ kind: 'committed'; changed: boolean }>
  | Readonly<{ kind: 'conflict' | 'operation-conflict' | 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/** The tenant layer as the management service needs it; a local store adapts its records. */
export type TenantLayerStore = Readonly<{
  list(
    request: Readonly<{ category: string; after: string | null; limit: number }>,
  ): Promise<
    | Readonly<{ kind: 'page'; items: readonly AssetRow[]; next: string | null }>
    | Readonly<{ kind: 'invalid' | 'unavailable' }>
  >
  held(capability: CapabilityId): Promise<
    | Readonly<{
        kind: 'held'
        row: AssetRow
        revision: number
        content: AssetContent
        settings: boolean
      }>
    | Readonly<{ kind: 'absent' | 'unavailable' }>
  >
  holding(holdingRef: string): Promise<
    | Readonly<{
        kind: 'holding'
        state: 'held' | 'removed'
        enabled: boolean
        origin: AssetOrigin
        revision: number
      }>
    | Readonly<{ kind: 'absent' | 'unavailable' }>
  >
  change(
    input: Readonly<{
      operationId: string
      holdingRef: string
      expectedRevision: number
      change: HoldingChange
    }>,
  ): Promise<StoreChange>
  /** The receipt of an earlier change under this operation; another input is an operation conflict. */
  recall(
    input: Readonly<{ operationId: string; holdingRef: string; change: HoldingChange }>,
  ): Promise<StoreChange | Readonly<{ kind: 'not-found' }>>
  layer: AssetLayerSource
}>

type Scope<P> = Readonly<{ tenant: string; principal: P }>

export type TenantManagement<P> = Readonly<{
  list(
    input: Scope<P> & Readonly<{ category: string; after: string | null; limit: number }>,
  ): Promise<ManagedList>
  describe(input: Scope<P> & Readonly<{ capability: CapabilityId }>): Promise<ManagedAsset>
  setEnabled(
    input: Scope<P> & Readonly<{ operationId: string; holding: string; enabled: boolean }>,
  ): Promise<HoldingOutcome>
  remove(
    input: Scope<P> & Readonly<{ operationId: string; holding: string }>,
  ): Promise<HoldingOutcome>
}>

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' } as const)

function standingOf(evaluation: Evaluation): AssetStanding {
  if (evaluation.kind === 'winner') return { kind: 'selected' }
  if (evaluation.kind === 'unavailable') return { kind: 'unavailable', layer: evaluation.layer }
  const first = evaluation.filtered[0]
  if (first === undefined) return { kind: 'unavailable', layer: 'tenant' }
  return first.by === undefined
    ? { kind: 'filtered', reason: first.reason }
    : { kind: 'filtered', reason: first.reason, by: first.by }
}

function storeOutcome(answer: StoreChange, operationId: string): HoldingOutcome {
  switch (answer.kind) {
    case 'committed':
      return { kind: answer.changed ? 'changed' : 'no-change' }
    case 'unknown':
      return { kind: 'unknown', operationId }
    default:
      return { kind: answer.kind }
  }
}

/** Table two: what a holding in this state answers to this change, before anything is written. */
function decided(
  holding: Readonly<{ state: 'held' | 'removed'; enabled: boolean; origin: AssetOrigin }>,
  change: HoldingChange,
): HoldingOutcome | undefined {
  if (holding.origin === 'official') return { kind: 'not-writable', reason: 'official' }
  if (holding.state === 'removed')
    return change.kind === 'remove'
      ? { kind: 'no-change' }
      : { kind: 'not-writable', reason: 'removed' }
  if (change.kind === 'setEnabled' && holding.enabled === change.enabled)
    return { kind: 'no-change' }
  return undefined
}

export function createTenantManagement<P>(ports: {
  acting: TenantActing<P>
  categories: Pick<CategoryView, 'describe'>
  storeOf(tenant: string): Promise<TenantLayerStore | undefined>
}): TenantManagement<P> {
  async function admitted(scope: Scope<P>) {
    try {
      return await ports.acting.admit({ principal: scope.principal, tenant: scope.tenant })
    } catch {
      return 'unavailable' as const
    }
  }
  /** The store of a tenant whose principal may act for it, or the refusal to answer instead. */
  async function storeFor(
    scope: Scope<P>,
  ): Promise<TenantLayerStore | Readonly<{ kind: 'denied' | 'unavailable' }>> {
    const answer = await admitted(scope)
    if (answer !== 'admitted') return { kind: answer }
    try {
      return (await ports.storeOf(scope.tenant)) ?? UNAVAILABLE
    } catch {
      return UNAVAILABLE
    }
  }
  async function changeHolding(
    scope: Scope<P> & Readonly<{ operationId: string; holding: string }>,
    change: HoldingChange,
  ): Promise<HoldingOutcome> {
    const store = await storeFor(scope)
    if ('kind' in store) return store
    const { operationId, holding: holdingRef } = scope
    let expectedRevision: number
    try {
      const recalled = await store.recall({ operationId, holdingRef, change })
      if (recalled.kind !== 'not-found') return storeOutcome(recalled, operationId)
      const holding = await store.holding(holdingRef)
      if (holding.kind !== 'holding') return { kind: holding.kind }
      const refused = decided(holding, change)
      if (refused !== undefined) return refused
      expectedRevision = holding.revision
    } catch {
      return UNAVAILABLE
    }
    try {
      const answer = await store.change({ operationId, holdingRef, expectedRevision, change })
      return storeOutcome(answer, operationId)
    } catch {
      return { kind: 'unknown', operationId }
    }
  }
  return Object.freeze({
    async list(input) {
      const store = await storeFor(input)
      if ('kind' in store) return store
      if (ports.categories.describe(input.category) === undefined)
        return { kind: 'unknown-category' }
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ASSET_PAGE)
        return { kind: 'invalid' }
      try {
        const { category, after, limit } = input
        const read = await store.list({ category, after, limit })
        return read.kind === 'page' ? { ...read, completeness: 'complete' } : read
      } catch {
        return UNAVAILABLE
      }
    },
    async describe(input) {
      const store = await storeFor(input)
      if ('kind' in store) return store
      try {
        const held = await store.held(input.capability)
        if (held.kind !== 'held') return held
        const layers = await collectCandidates([store.layer], input.capability)
        const standing = standingOf(evaluate({ layers, eligible: () => 'yes' }))
        const { row, revision, content, settings } = held
        return { kind: 'asset', row, revision, content, standing, settings }
      } catch {
        return UNAVAILABLE
      }
    },
    setEnabled: input => changeHolding(input, { kind: 'setEnabled', enabled: input.enabled }),
    remove: input => changeHolding(input, { kind: 'remove' }),
  })
}
