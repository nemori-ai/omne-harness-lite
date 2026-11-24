import type { Context } from '@deepseek-ai/cordis'
import { capabilityId, type HeldReading } from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { sameBindingKey, type ToolBindingKey } from '@omne-harness/tool-contract/provider'
import { inWorkspace } from '../tenant-assets/layers.ts'
import { TOOL_CATEGORY, heldToolAuthority, heldToolStanding, ownLayer } from './held-tools.ts'
import { workspaceToolBody } from './workspace-tools.ts'

/** What the registry holds of the tool category under a name for one tenant, read where it stands: no wait. */
export function heldReadingOf(
  ctx: Context,
): (name: string, tenantRef: string) => HeldReading | undefined {
  return (name, tenantRef) => {
    const capability = capabilityId(TOOL_CATEGORY, name)
    const categories = ctx.get(assetCategoriesKey)
    return capability.ok && categories !== undefined
      ? categories.held(capability.id, tenantRef)
      : undefined
  }
}

/** Whether a key is a tool in force for its tenant now: the version it holds, or one a turn of it adopted from its workspace. */
export function isHeldNow(ctx: Context, tenant: TenantId, key: ToolBindingKey): boolean {
  if (!ownLayer(key.layer, tenant)) return false
  const { revision, digest } = key.asset.adoption
  if (inWorkspace(revision))
    return workspaceToolBody(ctx, tenant, { asset: revision, version: digest }) !== undefined
  const now = heldKeyNow(ctx, tenant, key.asset.name)
  return now !== null && sameBindingKey(now, key)
}

/** The key of the tool a tenant holds in force under a name now, apart from any turn; null when it holds none. */
export function heldKeyNow(ctx: Context, tenant: TenantId, name: string): ToolBindingKey | null {
  const standing = heldToolStanding(heldReadingOf(ctx), tenant, name)
  if (standing.kind !== 'held') return null
  const { layer, asset } = heldToolAuthority(tenant, name, standing.candidate)
  return { layer, asset }
}
