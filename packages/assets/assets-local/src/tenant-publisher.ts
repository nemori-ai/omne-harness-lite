import {
  digestBytes,
  isReadBody,
  pinBody,
  type CapabilityId,
  type JsonValue,
  type PackageRejection,
  type PublishContent,
  type TenantPublisher,
  type TenantPublishOutcome,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { digest } from './encoding.ts'
import { publishedAssetRef, type PackageHolding, type PackagePublishResult } from './packages.ts'
import type { Failure, Holding } from './schema.ts'
import type { AssetsLocal, AssetsMutationResult } from './types.ts'

/** The owner of the source a tenant publication gives its holding. */
export const TENANT_PUBLISHING_OWNER = 'assets.tenant-publishing'

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' } as const)
const CONFLICT = Object.freeze({ kind: 'conflict' } as const)
const invalid = (reason: string): TenantPublishOutcome => Object.freeze({ kind: 'invalid', reason })

const REJECTIONS: Readonly<Record<Failure['reason'], TenantPublishOutcome>> = Object.freeze({
  invalid_input: invalid('invalid-input'),
  limit_exceeded: invalid('limit-exceeded'),
  forbidden: Object.freeze({ kind: 'denied' }),
  unavailable: UNAVAILABLE,
  closing: UNAVAILABLE,
  unsupported: UNAVAILABLE,
  missing_definition: UNAVAILABLE,
  invalid_selection: UNAVAILABLE,
  revision_conflict: CONFLICT,
  version_conflict: CONFLICT,
  identity_conflict: CONFLICT,
  holding_exists: CONFLICT,
  holding_removed: CONFLICT,
  operation_conflict: Object.freeze({ kind: 'operation-conflict' }),
  unknown_category: Object.freeze({ kind: 'unknown-category' }),
})

function rejected(reason: string): TenantPublishOutcome {
  return Object.hasOwn(REJECTIONS, reason) ? REJECTIONS[reason as Failure['reason']] : UNAVAILABLE
}

function packageRejected(rejection: PackageRejection): TenantPublishOutcome {
  switch (rejection.kind) {
    case 'not-configured':
      return UNAVAILABLE
    case 'unknown-category':
      return REJECTIONS.unknown_category
    case 'not-a-directory-category':
      return invalid('not-a-directory-category')
    case 'limit-exceeded':
      return invalid(`limit-exceeded:${rejection.limit}`)
    case 'invalid-package':
      return invalid(rejection.reason)
    case 'source-failed':
      return rejection.failure === 'unavailable'
        ? UNAVAILABLE
        : invalid(`source-failed:${rejection.failure}`)
    case 'record-rejected':
      return rejected(rejection.reason)
  }
}

function published(ref: string, version: string, changed: boolean): TenantPublishOutcome {
  return { kind: 'published', version, holdingRef: ref, changed }
}

function packageOutcome(result: PackagePublishResult, ref: string): TenantPublishOutcome {
  switch (result.kind) {
    case 'published':
      return published(ref, result.version, result.changed)
    case 'conflict':
      return CONFLICT
    case 'unknown':
      return result
    case 'rejected':
      return packageRejected(result.rejection)
  }
}

function mutationOutcome(
  result: AssetsMutationResult,
  ref: string,
  version: string,
): TenantPublishOutcome {
  switch (result.kind) {
    case 'committed':
      return published(ref, version, result.changed)
    case 'unknown':
      return result
    case 'rejected':
      return rejected(result.reason)
  }
}

/** A holding minted by a publication: the same operation always mints the same reference. */
export function newHoldingRef(operationId: string): string {
  return `held-${digest(operationId).slice(0, 32)}`
}

/** Where a holding came from: a tenant publication, or the deployment that installed it. */
export function originOf(holding: Pick<Holding, 'sourceLayout'>): 'customized' | 'official' {
  return holding.sourceLayout.some(source => source.ownerRef === TENANT_PUBLISHING_OWNER)
    ? 'customized'
    : 'official'
}

/** The tenant source of a published holding: the tenant can set and clear its settings. */
function tenantHolding(tenantRef: string, holdingRef: string): PackageHolding {
  return {
    holdingRef,
    sources: [
      {
        sourceId: 'tenant',
        ownerRef: TENANT_PUBLISHING_OWNER,
        scope: { kind: 'tenant', subjectRef: tenantRef },
      },
    ],
    grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
  }
}

type Placement = Readonly<{ holdingRef: string }> | Readonly<{ refused: TenantPublishOutcome }>

/** A new version goes to the holding that is held now; with none held, the publication mints one. */
async function placementOf(
  local: AssetsLocal,
  capability: CapabilityId,
  operationId: string,
): Promise<Placement> {
  const held = await local.readHeldCapability({ capability })
  if (held.kind === 'rejected') return { refused: rejected(held.reason) }
  if (held.kind === 'absent') return { holdingRef: newHoldingRef(operationId) }
  if (originOf(held.holding) === 'official') return { refused: invalid('held-by-deployment') }
  return { holdingRef: held.holding.holdingRef }
}

export function createTenantPublisher(local: AssetsLocal, tenantRef: string): TenantPublisher {
  async function publishData(
    operationId: string,
    capability: CapabilityId,
    body: JsonValue,
    holding: PackageHolding,
  ) {
    if (!isReadBody(body)) return invalid('body-not-read')
    const ref = publishedAssetRef(capability)
    const version = digestBytes(new TextEncoder().encode(writeJsonText(body)))
    const asset = await local.readAsset({ assetRef: ref })
    if (asset.kind === 'rejected') return rejected(asset.reason)
    const result = await local.publishAndHold({
      operationId,
      assetRef: ref,
      expectedRevision: asset.kind === 'asset' ? asset.asset.revision : 0,
      pinned: pinBody({ identity: capability, version, source: 'tenant-publishing', body }),
      holding: { scopeRef: tenantRef, ...holding },
    })
    return mutationOutcome(result, holding.holdingRef, version)
  }
  async function publishContent(
    operationId: string,
    capability: CapabilityId,
    content: PublishContent,
    holding: PackageHolding,
  ) {
    if (content.kind === 'data') return publishData(operationId, capability, content.body, holding)
    const result = await local.packages.publish({
      capability,
      from: content.from,
      operationId,
      holding,
    })
    return packageOutcome(result, holding.holdingRef)
  }
  return Object.freeze({
    async publish({ operationId, capability, content }) {
      const placement = await placementOf(local, capability, operationId)
      if ('refused' in placement) return placement.refused
      const holding = tenantHolding(tenantRef, placement.holdingRef)
      return publishContent(operationId, capability, content, holding)
    },
  })
}
