import {
  capabilityId,
  type AssetContent,
  type AssetRow,
  type CategoryView,
  type JsonValue,
  type StoreChange,
  type StorePublication,
  type TenantLayerStore,
} from '@omne-harness/assets'
import { tenantLayerSource } from './layer.ts'
import { originOf } from './origin.ts'
import { manifestOf } from './packages.ts'
import type { PublicationRecall } from './results.ts'
import { publishRejected } from './tenant-publisher.ts'
import type { Failure } from './schema.ts'
import type { AssetsListResult, AssetsLocal, AssetsOperationResult } from './types.ts'

type Listed = Extract<AssetsListResult, { kind: 'page' }>['items'][number]

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' } as const)

function rowOf(item: Listed): AssetRow {
  const capability = capabilityId(item.category, item.name)
  if (!capability.ok) throw new TypeError('A held asset has an incomplete capability')
  return {
    capability: capability.id,
    layer: 'tenant',
    asset: item.assetRef,
    version: item.version,
    selection: item.selection,
    enabled: item.enabled,
    holding: item.holdingRef,
    origin: item.origin,
    summary: item.summary,
  }
}

/** A directory version shows its files, never their bytes; a data version shows its body. */
function contentOf(directory: boolean, body: JsonValue): AssetContent {
  const manifest = directory ? manifestOf(body) : undefined
  return manifest === undefined
    ? { kind: 'data', body }
    : {
        kind: 'directory',
        entries: manifest.entries.map(({ path, bytes }) => ({ path, bytes })),
      }
}

const CHANGE_REJECTIONS: Partial<Record<Failure['reason'], StoreChange>> = {
  revision_conflict: { kind: 'conflict' },
  holding_removed: { kind: 'conflict' },
  missing_definition: { kind: 'conflict' },
  operation_conflict: { kind: 'operation-conflict' },
}

function publicationOf(recalled: PublicationRecall): StorePublication {
  switch (recalled.kind) {
    case 'published': {
      const capability = capabilityId(recalled.category, recalled.name)
      if (!capability.ok) return UNAVAILABLE
      const { version, holdingRef, changed } = recalled
      return { kind: 'published', capability: capability.id, version, holdingRef, changed }
    }
    case 'not_found':
      return { kind: 'not-found' }
    case 'unknown':
      return recalled
    case 'rejected':
      return publishRejected(recalled.reason)
  }
}

function changeOf(result: AssetsOperationResult): StoreChange | Readonly<{ kind: 'not-found' }> {
  switch (result.kind) {
    case 'committed':
      return { kind: 'committed', changed: result.changed }
    case 'not_found':
      return { kind: 'not-found' }
    case 'unknown':
      return { kind: 'unknown' }
    case 'rejected':
      return CHANGE_REJECTIONS[result.reason] ?? UNAVAILABLE
  }
}

/** The tenant layer of one tenant's local assets, as the management service reads and changes it. */
export function createTenantLayerStore(
  local: AssetsLocal,
  tenantRef: string,
  categories: Pick<CategoryView, 'lookup'>,
): TenantLayerStore {
  return Object.freeze({
    async list(request) {
      const read = await local.listHeld(request)
      if (read.kind === 'rejected')
        return read.reason === 'invalid_input' ? { kind: 'invalid' } : UNAVAILABLE
      return { kind: 'page', items: read.items.map(rowOf), next: read.next }
    },
    async held(capability) {
      const read = await local.readHeldCapability({ capability })
      if (read.kind === 'rejected') return UNAVAILABLE
      if (read.kind === 'absent' || read.selected === null) return { kind: 'absent' }
      const { holding, selected } = read
      const stored = await local.readSummary({
        assetRef: holding.assetRef,
        version: selected.version,
      })
      if (stored.kind !== 'summary') return UNAVAILABLE
      const directory = categories.lookup(capability.category)?.layout !== undefined
      return {
        kind: 'held',
        row: {
          capability,
          layer: 'tenant',
          asset: holding.assetRef,
          version: selected.version,
          selection: holding.selection.kind,
          enabled: holding.enabled,
          holding: holding.holdingRef,
          origin: originOf(holding),
          summary: stored.summary,
        },
        revision: holding.revision,
        content: contentOf(directory, selected.body),
        settings: selected.definitionRef !== null,
      }
    },
    async holding(holdingRef) {
      const read = await local.readHolding({ holdingRef, scopeRef: tenantRef })
      if (read.kind === 'rejected') return UNAVAILABLE
      if (read.kind === 'absent') return { kind: 'absent' }
      const { state, enabled, revision } = read.holding
      return { kind: 'holding', state, enabled, origin: originOf(read.holding), revision }
    },
    async change({ operationId, holdingRef, expectedRevision, change }) {
      const result = await local.changeHolding({
        operationId,
        holdingRef,
        scopeRef: tenantRef,
        expectedRevision,
        change,
      })
      const answer = changeOf(result)
      return answer.kind === 'not-found' ? UNAVAILABLE : answer
    },
    async recall(input) {
      return changeOf(await local.recallChange(input))
    },
    async recallPublication(operationId) {
      return publicationOf(await local.recallPublication(operationId))
    },
    uploads: local.uploads,
    layer: tenantLayerSource(local),
  } satisfies TenantLayerStore)
}
