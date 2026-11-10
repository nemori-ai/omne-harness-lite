import type {
  AssetsLocal,
  AssetsHoldingResult,
  AssetsVersionResult,
} from '@omne-harness/assets-local'
import type { SettingsTarget } from '@omne-harness/settings'
import { canonicalDigest } from '@omne-harness/tool'
import { TOOL_GOVERNANCE_OWNER } from '../../entry/tool-permission-release.ts'
import type { ToolReleaseEntry } from '../../entry/tool-release-manifest.ts'
import { toolAssetPublication } from './tool-assets.ts'

export type ToolAssetInstallation =
  | Readonly<{ kind: 'ready'; target: SettingsTarget }>
  | Readonly<{ kind: 'inactive'; target: SettingsTarget }>
  | Readonly<{ kind: 'unavailable'; phase: 'publication' | 'holding' }>

type Installation = Readonly<{
  owner: AssetsLocal
  tenantRef: string
  entry: ToolReleaseEntry
}>
type Publication = ReturnType<typeof toolAssetPublication>

function matchesPublication(result: AssetsVersionResult, publication: Publication): boolean {
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

async function publish(input: Installation, publication: Publication): Promise<boolean> {
  const { owner } = input
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
    operationId: canonicalDigest({
      owner: TOOL_GOVERNANCE_OWNER,
      tenant: input.tenantRef,
      command,
    }),
  })
  if (result.kind === 'rejected' && result.reason !== 'revision_conflict') return false
  // A lost receipt or concurrent publisher is resolved by the original immutable publication.
  return matchesPublication(await owner.readVersion(lookup), publication)
}

async function hold(input: Installation, publication: Publication, target: SettingsTarget) {
  const lookup = { holdingRef: target.targetRef, scopeRef: target.scopeRef }
  let current = await input.owner.readHolding(lookup)
  if (current.kind !== 'absent') return current
  const command = {
    ...lookup,
    assetRef: publication.assetRef,
    selection: { kind: 'pinned' as const, version: publication.pinned.version },
    sources: [
      {
        sourceId: 'tenant',
        ownerRef: TOOL_GOVERNANCE_OWNER,
        scope: { kind: 'tenant' as const, subjectRef: input.tenantRef },
      },
    ],
    grants: [{ sourceId: 'tenant', actions: ['set' as const, 'clear' as const] }],
  }
  const result = await input.owner.hold({
    ...command,
    operationId: canonicalDigest({ owner: TOOL_GOVERNANCE_OWNER, command }),
  })
  if (result.kind === 'rejected' && result.reason !== 'holding_exists') return result
  current = await input.owner.readHolding(lookup)
  return current
}

async function select(
  input: Installation,
  publication: Publication,
  target: SettingsTarget,
  current: Extract<AssetsHoldingResult, { kind: 'holding' }>,
): Promise<ToolAssetInstallation> {
  if (current.holding.assetRef !== publication.assetRef)
    return { kind: 'unavailable', phase: 'holding' }
  if (current.holding.state === 'removed' || !current.holding.enabled)
    return { kind: 'inactive', target }
  if (current.selected?.version === publication.pinned.version) return { kind: 'ready', target }
  const command = {
    holdingRef: target.targetRef,
    scopeRef: target.scopeRef,
    expectedRevision: current.holding.revision,
    change: {
      kind: 'selectVersion' as const,
      selection: { kind: 'pinned' as const, version: publication.pinned.version },
    },
  }
  const result = await input.owner.changeHolding({
    ...command,
    operationId: canonicalDigest({ owner: TOOL_GOVERNANCE_OWNER, command }),
  })
  if (result.kind !== 'committed') return { kind: 'unavailable', phase: 'holding' }
  return { kind: 'ready', target }
}

/** Installs an application-owned holding; callers supply the verified release and tenant owner. */
export async function installToolAsset(input: Installation): Promise<ToolAssetInstallation> {
  const publication = toolAssetPublication(input.entry)
  const target = toolAssetTarget(input.entry, input.tenantRef)
  if (!(await publish(input, publication))) return { kind: 'unavailable', phase: 'publication' }
  const current = await hold(input, publication, target)
  return current.kind === 'holding'
    ? select(input, publication, target, current)
    : { kind: 'unavailable', phase: 'holding' }
}

/** The address is shared by installation and consumers; only the Assets owner proves it exists. */
export function toolAssetTarget(entry: ToolReleaseEntry, tenantRef: string): SettingsTarget {
  return {
    policyId: 'asset',
    scopeRef: tenantRef,
    targetRef: `harness.preinstalled.tool.${entry.asset.name}`,
  }
}
