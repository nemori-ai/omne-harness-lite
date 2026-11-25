import type { PinnedBody } from '@omne-harness/assets'
import type {
  AssetsLocal,
  AssetsHoldingResult,
  AssetsVersionResult,
} from '@omne-harness/assets-local'
import type { AssetTarget } from '@omne-harness/settings'
import { canonicalDigest } from '@omne-harness/tool'

/** What a release brings into a tenant: one pinned body under an asset reference. */
export type ReleasePublication = Readonly<{
  assetRef: string
  pinned: PinnedBody
  publicationRef: Readonly<{
    assetRef: string
    category: string
    name: string
    version: string
    source: string
    bodyDigest: string
  }>
}>

export type ReleaseAssetInstallation =
  | Readonly<{ kind: 'ready'; target: AssetTarget }>
  | Readonly<{ kind: 'inactive'; target: AssetTarget }>
  | Readonly<{ kind: 'unavailable'; phase: 'publication' | 'holding' }>

type Installation = Readonly<{
  owner: AssetsLocal
  tenantRef: string
  /** Who installs: the owner of the holding's source, and the namespace of its operation identities. */
  ownerRef: string
  publication: ReleasePublication
  target: AssetTarget
}>

function matchesPublication(result: AssetsVersionResult, publication: ReleasePublication): boolean {
  if (result.kind !== 'version') return false
  const value = result.version
  return (
    canonicalDigest({
      assetRef: value.assetRef,
      category: value.category,
      name: value.name,
      version: value.version,
      source: value.source,
      bodyDigest: canonicalDigest(value.body).slice(7),
    }) === canonicalDigest(publication.publicationRef)
  )
}

async function publish(input: Installation): Promise<boolean> {
  const { owner, publication } = input
  const lookup = { assetRef: publication.assetRef, version: publication.pinned.version }
  const asset = await owner.readAsset({ assetRef: publication.assetRef })
  if (asset.kind === 'rejected') return false
  if (asset.kind === 'asset') {
    const version = await owner.readVersion(lookup)
    if (version.kind !== 'absent') return matchesPublication(version, publication)
  }
  const command = {
    assetRef: publication.assetRef,
    pinned: publication.pinned,
    expectedRevision: asset.kind === 'asset' ? asset.asset.revision : 0,
  }
  const result = await owner.publish({
    ...command,
    operationId: canonicalDigest({ owner: input.ownerRef, tenant: input.tenantRef, command }),
  })
  if (result.kind === 'rejected' && result.reason !== 'revision_conflict') return false
  return matchesPublication(await owner.readVersion(lookup), publication)
}

async function hold(input: Installation) {
  const { target, publication } = input
  const lookup = { holdingRef: target.holdingRef, scopeRef: target.scopeRef }
  const current = await input.owner.readHolding(lookup)
  if (current.kind !== 'absent') return current
  const command = {
    ...lookup,
    assetRef: publication.assetRef,
    selection: { kind: 'pinned' as const, version: publication.pinned.version },
    sources: [
      {
        sourceId: 'tenant',
        ownerRef: input.ownerRef,
        scope: { kind: 'tenant' as const, subjectRef: input.tenantRef },
      },
    ],
    grants: [{ sourceId: 'tenant', actions: ['set' as const, 'clear' as const] }],
  }
  const result = await input.owner.hold({
    ...command,
    operationId: canonicalDigest({ owner: input.ownerRef, command }),
  })
  if (result.kind === 'rejected' && result.reason !== 'holding_exists') return result
  return input.owner.readHolding(lookup)
}

async function select(
  input: Installation,
  current: Extract<AssetsHoldingResult, { kind: 'holding' }>,
): Promise<ReleaseAssetInstallation> {
  const { target, publication } = input
  if (current.holding.assetRef !== publication.assetRef)
    return { kind: 'unavailable', phase: 'holding' }
  if (current.holding.state === 'removed') return { kind: 'inactive', target }
  if (current.selected?.version !== publication.pinned.version) {
    const command = {
      holdingRef: target.holdingRef,
      scopeRef: target.scopeRef,
      expectedRevision: current.holding.revision,
      change: {
        kind: 'selectVersion' as const,
        selection: { kind: 'pinned' as const, version: publication.pinned.version },
      },
    }
    const result = await input.owner.changeHolding({
      ...command,
      operationId: canonicalDigest({ owner: input.ownerRef, command }),
    })
    if (result.kind !== 'committed') return { kind: 'unavailable', phase: 'holding' }
  }
  return current.holding.enabled ? { kind: 'ready', target } : { kind: 'inactive', target }
}

/** Publishes, holds and pins what a release brings into one tenant; every step is recognised on repeat. */
export async function installReleaseAsset(input: Installation): Promise<ReleaseAssetInstallation> {
  if (!(await publish(input))) return { kind: 'unavailable', phase: 'publication' }
  const current = await hold(input)
  return current.kind === 'holding'
    ? select(input, current)
    : { kind: 'unavailable', phase: 'holding' }
}

/** The holding a release installs for one of its assets in a tenant. */
export function preinstalledTarget(category: string, name: string, tenantRef: string): AssetTarget {
  return {
    kind: 'asset',
    holdingRef: `harness.preinstalled.${category}.${name}`,
    scopeRef: tenantRef,
  }
}
