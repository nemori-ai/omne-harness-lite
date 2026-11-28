import type { AssetsLocal } from '@omne-harness/assets-local'
import type { AssetTarget } from '@omne-harness/settings'
import { TOOL_GOVERNANCE_OWNER } from '../../entry/tool-permission-release.ts'
import type { ToolRelease } from '../../entry/tool-release.ts'
import type { ToolReleaseEntry } from '../../entry/tool-release-manifest.ts'
import {
  installReleaseAsset,
  preinstalledTarget,
  type ReleaseAssetInstallation,
} from './release-asset-installation.ts'
import { toolAssetPublication } from './tool-assets.ts'

export type ToolAssetInstallation = ReleaseAssetInstallation

export async function installToolAsset(
  input: Readonly<{ owner: AssetsLocal; tenantRef: string; entry: ToolReleaseEntry }>,
): Promise<ToolAssetInstallation> {
  return installReleaseAsset({
    owner: input.owner,
    tenantRef: input.tenantRef,
    ownerRef: TOOL_GOVERNANCE_OWNER,
    publication: toolAssetPublication(input.entry),
    target: toolAssetTarget(input.entry, input.tenantRef),
  })
}

export function toolAssetTarget(entry: ToolReleaseEntry, tenantRef: string): AssetTarget {
  return preinstalledTarget('tool', entry.asset.name, tenantRef)
}

/** The asset targets a release governs in a tenant: their definitions come from the release. */
export function releaseToolTargets(
  release: ToolRelease | undefined,
  tenantRef: string,
): readonly AssetTarget[] {
  return release?.kind === 'trusted'
    ? release.manifest.entries.map(entry => toolAssetTarget(entry, tenantRef))
    : []
}
