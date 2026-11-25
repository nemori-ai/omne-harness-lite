import type { CategoryView } from './category-point.ts'
import { evaluate, type Evaluation } from './evaluate.ts'
import type { CapabilityId, JsonValue } from './identity.ts'
import { collectCandidates, type AssetEntry, type AssetLayerSource } from './layers.ts'
import { MAX_ASSET_PAGE } from './layers.ts'
import type { PackageReader } from './package.ts'
import {
  officialCursor,
  officialOf,
  officialRow,
  officialSettings,
  readListCursor,
  readOfficial,
  sameCapability,
  tenantCursor,
  type OfficialAssets,
} from './official.ts'
import { copyTree } from './read-body.ts'
import {
  creationRefusal,
  type PublishContent,
  type TenantActing,
  type TenantPublishing,
  type TenantPublishOutcome,
} from './publishing.ts'
import type { AssetSummary } from './summary.ts'

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

export type HeldFiles =
  | Readonly<{ kind: 'files'; version: string; from: PackageReader }>
  | Readonly<{ kind: 'body'; version: string; body: JsonValue }>
  | Readonly<{ kind: 'absent' | 'unavailable' }>

export type HoldingChange =
  | Readonly<{ kind: 'remove' }>
  | Readonly<{ kind: 'setEnabled'; enabled: boolean }>

export type HoldingOutcome =
  | Readonly<{ kind: 'changed' | 'no-change' | 'absent' | 'denied' | 'unavailable' | 'conflict' }>
  | Readonly<{ kind: 'operation-conflict' }>
  | Readonly<{ kind: 'not-writable'; reason: 'official' | 'removed' }>
  | Readonly<{ kind: 'unknown'; operationId: string }>

export type UploadEntry = Readonly<{ path: string; bytes: number }>

export type UploadBegin =
  | Readonly<{ kind: 'accepted'; partBytes: number; received: readonly UploadEntry[] }>
  | Readonly<{
      kind: 'denied' | 'unavailable' | 'unknown-category' | 'operation-conflict' | 'busy'
    }>
  | Readonly<{ kind: 'invalid'; reason: string }>

export type UploadAppend =
  | Readonly<{ kind: 'received'; bytes: number }>
  | Readonly<{ kind: 'absent' | 'denied' | 'unavailable' }>
  | Readonly<{ kind: 'invalid'; reason: string }>

export type UploadCommit =
  | TenantPublishOutcome
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'incomplete'; missing: readonly string[] }>

export type ManagedRequest =
  | Readonly<{ kind: 'create'; capability: CapabilityId }>
  | Readonly<{ kind: 'begin'; capability: CapabilityId; entries: readonly UploadEntry[] }>
  | Readonly<{ kind: 'commit' }>
  | Readonly<{ kind: 'setEnabled'; holding: string; enabled: boolean }>
  | Readonly<{ kind: 'remove'; holding: string }>

export type RecallOutcome =
  | UploadBegin
  | UploadCommit
  | HoldingOutcome
  | Readonly<{ kind: 'not-committed' }>

export type StorePublication =
  | Readonly<{
      kind: 'published'
      capability: CapabilityId
      version: string
      holdingRef: string
      changed: boolean
    }>
  | Exclude<TenantPublishOutcome, Readonly<{ kind: 'published' }>>
  | Readonly<{ kind: 'not-found' }>

type UploadRequest = Readonly<{
  operationId: string
  capability: CapabilityId
  entries: readonly UploadEntry[]
}>

export type StoreUploads = Readonly<{
  begin(input: UploadRequest): Promise<Exclude<UploadBegin, Readonly<{ kind: 'denied' }>>>
  /** `begin` without making anything: an upload that is not there answers absent. */
  resume(
    input: UploadRequest,
  ): Promise<
    | Readonly<{ kind: 'accepted'; partBytes: number; received: readonly UploadEntry[] }>
    | Readonly<{ kind: 'operation-conflict' }>
    | Readonly<{ kind: 'unavailable' }>
    | Readonly<{ kind: 'absent' }>
  >
  append(
    input: Readonly<{ operationId: string; path: string; offset: number; bytes: Uint8Array }>,
  ): Promise<Exclude<UploadAppend, Readonly<{ kind: 'denied' }>>>
  reader(
    operationId: string,
  ): Promise<
    | Readonly<{ kind: 'ready'; capability: CapabilityId; from: PackageReader }>
    | Readonly<{ kind: 'incomplete'; missing: readonly string[] }>
    | Readonly<{ kind: 'absent' | 'unavailable' }>
  >
  discard(operationId: string): Promise<void>
}>

export type StoreChange =
  | Readonly<{ kind: 'committed'; changed: boolean }>
  | Readonly<{ kind: 'conflict' | 'operation-conflict' | 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

export type StoreOperation =
  | Readonly<{
      kind: 'publish'
      capability: CapabilityId
      version: string
      outcome: TenantPublishOutcome
    }>
  | Readonly<{
      kind: 'change'
      holding: string
      capability: CapabilityId | null
      change: HoldingChange
      answer: StoreChange
    }>
  | Readonly<{ kind: 'not-found' | 'unavailable' }>

export type RecalledOperation =
  | Readonly<{
      kind: 'publish'
      capability: CapabilityId
      version: string
      outcome: TenantPublishOutcome
    }>
  | Readonly<{
      kind: 'setEnabled'
      holding: string
      capability: CapabilityId | null
      enabled: boolean
      outcome: HoldingOutcome
    }>
  | Readonly<{
      kind: 'remove'
      holding: string
      capability: CapabilityId | null
      outcome: HoldingOutcome
    }>

export type OperationRecall =
  | RecalledOperation
  | Readonly<{ kind: 'absent' | 'denied' | 'unavailable' }>

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
  files(capability: CapabilityId): Promise<HeldFiles>
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
  recallPublication(operationId: string): Promise<StorePublication>
  recallById(operationId: string): Promise<StoreOperation>
  uploads: StoreUploads
  layers: readonly AssetLayerSource[]
}>

type Scope<P> = Readonly<{ tenant: string; principal: P }>

export type TenantManagement<P> = Readonly<{
  list(
    input: Scope<P> & Readonly<{ category: string; after: string | null; limit: number }>,
  ): Promise<ManagedList>
  describe(input: Scope<P> & Readonly<{ capability: CapabilityId }>): Promise<ManagedAsset>
  files(
    input: Scope<P> & Readonly<{ capability: CapabilityId }>,
  ): Promise<HeldFiles | Readonly<{ kind: 'denied' }>>
  setEnabled(
    input: Scope<P> & Readonly<{ operationId: string; holding: string; enabled: boolean }>,
  ): Promise<HoldingOutcome>
  remove(
    input: Scope<P> & Readonly<{ operationId: string; holding: string }>,
  ): Promise<HoldingOutcome>
  createFromData(
    input: Scope<P> & Readonly<{ operationId: string; capability: CapabilityId; body: JsonValue }>,
  ): Promise<TenantPublishOutcome>
  beginUpload(input: Scope<P> & UploadRequest): Promise<UploadBegin>
  appendUpload(
    input: Scope<P> &
      Readonly<{ operationId: string; path: string; offset: number; bytes: Uint8Array }>,
  ): Promise<UploadAppend>
  createFromUpload(input: Scope<P> & Readonly<{ operationId: string }>): Promise<UploadCommit>
  /** The outcome of an earlier committing request under this operation, without making it again. */
  recall(
    input: Scope<P> & Readonly<{ operationId: string; request: ManagedRequest }>,
  ): Promise<RecallOutcome>
  /** What the operation under this id was and its outcome, with nothing but the id. */
  recallById(input: Scope<P> & Readonly<{ operationId: string }>): Promise<OperationRecall>
}>

type Ports<P> = Readonly<{
  acting: TenantActing<P>
  categories: Pick<CategoryView, 'describe' | 'lookup'>
  publishing: TenantPublishing<P>
  storeOf(tenant: string): Promise<TenantLayerStore | undefined>
  /** The store for a write that may be the first of a tenant; without it a write uses storeOf. */
  writableStoreOf?(tenant: string): Promise<TenantLayerStore | undefined>
  official: OfficialAssets
}>
type StoreFor<P> = (
  scope: Scope<P>,
) => Promise<TenantLayerStore | Readonly<{ kind: 'denied' | 'unavailable' }>>
type Publish<P> = (
  scope: Scope<P> & Readonly<{ operationId: string; capability: CapabilityId }>,
  content: PublishContent,
) => Promise<TenantPublishOutcome>

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' } as const)
const BODY_NOT_READ = Object.freeze({ kind: 'invalid', reason: 'body-not-read' } as const)
const NOT_COMMITTED = Object.freeze({ kind: 'not-committed' } as const)

type Held = Readonly<{ asset: string; version: string }>

const isHeld = (candidate: Held, held: Held): boolean =>
  candidate.asset === held.asset && candidate.version === held.version

function standingOf(evaluation: Evaluation, held: Held): AssetStanding {
  if (evaluation.kind === 'unavailable') return { kind: 'unavailable', layer: evaluation.layer }
  if (evaluation.kind === 'winner' && isHeld(evaluation.candidate, held))
    return { kind: 'selected' }
  const out = evaluation.filtered.find(filtered => isHeld(filtered.candidate, held))
  if (out === undefined) return { kind: 'unavailable', layer: 'tenant' }
  return out.by === undefined
    ? { kind: 'filtered', reason: out.reason }
    : { kind: 'filtered', reason: out.reason, by: out.by }
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

function publicationOutcome(
  found: Exclude<StorePublication, Readonly<{ kind: 'not-found' }>>,
): TenantPublishOutcome {
  if (found.kind !== 'published') return found
  const { version, holdingRef, changed } = found
  return { kind: 'published', version, holdingRef, changed }
}

function storeForOf<P>(ports: Ports<P>, use: 'read' | 'write' = 'read'): StoreFor<P> {
  const storeOf = (tenant: string) =>
    use === 'write' && ports.writableStoreOf !== undefined
      ? ports.writableStoreOf(tenant)
      : ports.storeOf(tenant)
  return async scope => {
    let answer: 'admitted' | 'denied' | 'unavailable'
    try {
      answer = await ports.acting.admit({ principal: scope.principal, tenant: scope.tenant })
    } catch {
      return UNAVAILABLE
    }
    if (answer !== 'admitted') return { kind: answer }
    try {
      return (await storeOf(scope.tenant)) ?? UNAVAILABLE
    } catch {
      return UNAVAILABLE
    }
  }
}

function publisherOf<P>(ports: Ports<P>): Publish<P> {
  return async (scope, content) => {
    const { tenant, principal, operationId, capability } = scope
    try {
      return await ports.publishing.publish({ tenant, principal, operationId, capability, content })
    } catch {
      return { kind: 'unknown', operationId }
    }
  }
}

async function list<P>(
  storeFor: StoreFor<P>,
  ports: Ports<P>,
  input: Parameters<TenantManagement<P>['list']>[0],
): Promise<ManagedList> {
  const store = await storeFor(input)
  if ('kind' in store) return store
  const listing = ports.categories.describe(input.category)
  if (listing === undefined) return { kind: 'unknown-category' }
  if ('unusable' in listing) return UNAVAILABLE
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ASSET_PAGE)
    return { kind: 'invalid' }
  const cursor = readListCursor(input.after)
  if (cursor === undefined) return { kind: 'invalid' }
  const { category, limit } = input
  try {
    return cursor.part === 'tenant'
      ? await tenantPage(store, category, cursor.after, limit, [])
      : await officialPage(store, ports, category, cursor.after, limit)
  } catch {
    return UNAVAILABLE
  }
}

async function officialPage<P>(
  store: TenantLayerStore,
  ports: Ports<P>,
  category: string,
  after: string | null,
  limit: number,
): Promise<ManagedList> {
  const all = readOfficial(ports.official)
  if (all === undefined) return UNAVAILABLE
  const rows: AssetRow[] = []
  for (const asset of officialOf(all, category, after)) {
    const held = await store.held(asset.capability)
    if (held.kind === 'unavailable') return UNAVAILABLE
    if (held.kind === 'held' && held.row.origin === 'official') continue
    rows.push(officialRow(ports.categories, asset))
  }
  if (rows.length > limit) {
    const kept = rows.slice(0, limit)
    const last = kept.at(-1)
    const next = last === undefined ? null : officialCursor(last.capability.name)
    return { kind: 'page', items: kept, next, completeness: 'complete' }
  }
  if (rows.length === limit)
    return { kind: 'page', items: rows, next: tenantCursor(null), completeness: 'complete' }
  return tenantPage(store, category, null, limit - rows.length, rows)
}

async function tenantPage(
  store: TenantLayerStore,
  category: string,
  after: string | null,
  limit: number,
  before: readonly AssetRow[],
): Promise<ManagedList> {
  const read = await store.list({ category, after, limit })
  if (read.kind !== 'page') return read
  const next = read.next === null ? null : tenantCursor(read.next)
  return { kind: 'page', items: [...before, ...read.items], next, completeness: 'complete' }
}

async function describe<P>(
  storeFor: StoreFor<P>,
  ports: Ports<P>,
  input: Parameters<TenantManagement<P>['describe']>[0],
): Promise<ManagedAsset> {
  const store = await storeFor(input)
  if ('kind' in store) return store
  try {
    const held = await store.held(input.capability)
    if (held.kind === 'absent') return await describeOfficial(store, ports, input.capability)
    if (held.kind !== 'held') return held
    const layers = await collectCandidates(store.layers, input.capability)
    const { row, revision, content, settings } = held
    const standing = standingOf(evaluate({ layers, eligible: () => 'yes' }), row)
    return { kind: 'asset', row, revision, content, standing, settings }
  } catch {
    return UNAVAILABLE
  }
}

async function describeOfficial<P>(
  store: TenantLayerStore,
  ports: Ports<P>,
  capability: CapabilityId,
): Promise<ManagedAsset> {
  const all = readOfficial(ports.official)
  if (all === undefined) return UNAVAILABLE
  const asset = all.find(each => sameCapability(each.capability, capability))
  if (asset === undefined) return { kind: 'absent' }
  const layers = await collectCandidates(store.layers, capability)
  return {
    kind: 'asset',
    row: officialRow(ports.categories, asset),
    revision: 0,
    content: { kind: 'data', body: asset.body },
    standing: standingOf(evaluate({ layers, eligible: () => 'yes' }), asset),
    settings: officialSettings(ports.categories, asset),
  }
}

async function files<P>(
  storeFor: StoreFor<P>,
  official: OfficialAssets,
  input: Parameters<TenantManagement<P>['files']>[0],
): Promise<HeldFiles | Readonly<{ kind: 'denied' }>> {
  const store = await storeFor(input)
  if ('kind' in store) return store
  try {
    const read = await store.files(input.capability)
    if (read.kind !== 'absent') return read
    const all = readOfficial(official)
    if (all === undefined) return UNAVAILABLE
    const asset = all.find(each => sameCapability(each.capability, input.capability))
    if (asset === undefined) return read
    return asset.files === undefined
      ? { kind: 'body', version: asset.version, body: asset.body }
      : { kind: 'files', version: asset.version, from: asset.files }
  } catch {
    return UNAVAILABLE
  }
}

function officialChange(official: OfficialAssets, holdingRef: string): HoldingOutcome {
  const all = readOfficial(official)
  if (all === undefined) return UNAVAILABLE
  return all.some(asset => asset.asset === holdingRef)
    ? { kind: 'not-writable', reason: 'official' }
    : { kind: 'absent' }
}

async function changeHolding<P>(
  storeFor: StoreFor<P>,
  official: OfficialAssets,
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
    if (holding.kind === 'absent') return officialChange(official, holdingRef)
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

async function beginUpload<P>(
  storeFor: StoreFor<P>,
  categories: Ports<P>['categories'],
  input: Scope<P> & UploadRequest,
): Promise<UploadBegin> {
  const store = await storeFor(input)
  if ('kind' in store) return store
  const listing = categories.describe(input.capability.category)
  if (listing === undefined) return { kind: 'unknown-category' }
  if ('unusable' in listing) return UNAVAILABLE
  const refused = creationRefusal(listing.creation, 'directory')
  if (refused !== undefined) return { kind: 'invalid', reason: refused }
  const { operationId, capability, entries } = input
  try {
    return await store.uploads.begin({ operationId, capability, entries })
  } catch {
    return UNAVAILABLE
  }
}

async function appendUpload<P>(
  storeFor: StoreFor<P>,
  input: Parameters<TenantManagement<P>['appendUpload']>[0],
): Promise<UploadAppend> {
  const store = await storeFor(input)
  if ('kind' in store) return store
  const { operationId, path, offset, bytes } = input
  try {
    return await store.uploads.append({ operationId, path, offset, bytes })
  } catch {
    return UNAVAILABLE
  }
}

/** Table one, commit: the receipt first, then the staged files, then the publication. */
async function createFromUpload<P>(
  storeFor: StoreFor<P>,
  publish: Publish<P>,
  input: Scope<P> & Readonly<{ operationId: string }>,
): Promise<UploadCommit> {
  const store = await storeFor(input)
  if ('kind' in store) return store
  let ready: Readonly<{ capability: CapabilityId; from: PackageReader }>
  try {
    const found = await store.recallPublication(input.operationId)
    if (found.kind !== 'not-found') return publicationOutcome(found)
    const staged = await store.uploads.reader(input.operationId)
    if (staged.kind !== 'ready') return staged
    ready = staged
  } catch {
    return UNAVAILABLE
  }
  const outcome = await publish(
    { ...input, capability: ready.capability },
    { kind: 'directory', from: ready.from },
  )
  if (outcome.kind === 'published') await store.uploads.discard(input.operationId).catch(() => {})
  return outcome
}

async function recallPublished(
  store: TenantLayerStore,
  operationId: string,
  request: Extract<ManagedRequest, Readonly<{ kind: 'create' | 'commit' }>>,
): Promise<RecallOutcome> {
  const found = await store.recallPublication(operationId)
  if (found.kind !== 'not-found') {
    const other =
      request.kind === 'create' &&
      found.kind === 'published' &&
      (found.capability.category !== request.capability.category ||
        found.capability.name !== request.capability.name)
    return other ? { kind: 'operation-conflict' } : publicationOutcome(found)
  }
  if (request.kind === 'create') return NOT_COMMITTED
  const staged = await store.uploads.reader(operationId)
  if (staged.kind === 'unavailable') return staged
  return staged.kind === 'absent' ? { kind: 'absent' } : NOT_COMMITTED
}

async function recallIn(
  store: TenantLayerStore,
  operationId: string,
  request: ManagedRequest,
): Promise<RecallOutcome> {
  switch (request.kind) {
    case 'create':
    case 'commit':
      return recallPublished(store, operationId, request)
    case 'begin': {
      const { capability, entries } = request
      const resumed = await store.uploads.resume({ operationId, capability, entries })
      return resumed.kind === 'absent' ? NOT_COMMITTED : resumed
    }
    case 'setEnabled':
    case 'remove': {
      const change: HoldingChange =
        request.kind === 'remove'
          ? { kind: 'remove' }
          : { kind: 'setEnabled', enabled: request.enabled }
      const found = await store.recall({ operationId, holdingRef: request.holding, change })
      return found.kind === 'not-found' ? NOT_COMMITTED : storeOutcome(found, operationId)
    }
  }
}

async function recall<P>(
  storeFor: StoreFor<P>,
  input: Parameters<TenantManagement<P>['recall']>[0],
): Promise<RecallOutcome> {
  const store = await storeFor(input)
  if ('kind' in store) return store
  try {
    return await recallIn(store, input.operationId, input.request)
  } catch {
    return UNAVAILABLE
  }
}

function recalledOf(found: StoreOperation, operationId: string): OperationRecall {
  switch (found.kind) {
    case 'not-found':
      return { kind: 'absent' }
    case 'unavailable':
      return UNAVAILABLE
    case 'publish':
      return found
    case 'change': {
      const { holding, capability, change, answer } = found
      const outcome = storeOutcome(answer, operationId)
      return change.kind === 'remove'
        ? { kind: 'remove', holding, capability, outcome }
        : { kind: 'setEnabled', holding, capability, enabled: change.enabled, outcome }
    }
  }
}

async function recallById<P>(
  storeFor: StoreFor<P>,
  input: Scope<P> & Readonly<{ operationId: string }>,
): Promise<OperationRecall> {
  const store = await storeFor(input)
  if ('kind' in store) return store
  try {
    return recalledOf(await store.recallById(input.operationId), input.operationId)
  } catch {
    return UNAVAILABLE
  }
}

export function createTenantManagement<P>(ports: Ports<P>): TenantManagement<P> {
  const storeFor = storeForOf(ports)
  const writableStoreFor = storeForOf(ports, 'write')
  const publish = publisherOf(ports)
  return Object.freeze({
    list: input => list(storeFor, ports, input),
    describe: input => describe(storeFor, ports, input),
    files: input => files(storeFor, ports.official, input),
    setEnabled: input =>
      changeHolding(storeFor, ports.official, input, {
        kind: 'setEnabled',
        enabled: input.enabled,
      }),
    remove: input => changeHolding(storeFor, ports.official, input, { kind: 'remove' }),
    createFromData: input => {
      const body = copyTree(input.body, true)
      if (body === undefined) return Promise.resolve(BODY_NOT_READ)
      return publish(input, { kind: 'data', body })
    },
    beginUpload: input => beginUpload(writableStoreFor, ports.categories, input),
    appendUpload: input => appendUpload(storeFor, input),
    createFromUpload: input => createFromUpload(storeFor, publish, input),
    recall: input => recall(storeFor, input),
    recallById: input => recallById(storeFor, input),
  })
}
