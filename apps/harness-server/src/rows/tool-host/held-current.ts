import type { Context } from '@deepseek-ai/cordis'
import { capabilityId, type HeldReading } from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { tenantEquals, type Access, type TenantId } from '@omne-harness/legal-identity'
import {
  sameBindingKey,
  type ToolAuthority,
  type ToolBindingKey,
} from '@omne-harness/tool-contract/provider'
import { toolBindingsKey, toolGenerationsKey } from '@omne-harness/tool-cordis-contract/cordis'
import { TOOL_CATEGORY, heldToolAuthority, heldToolStanding } from './held-tools.ts'

export type CurrentHeldTool =
  | Readonly<{ kind: 'held'; authority: ToolAuthority }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

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

const heldBy = (key: ToolBindingKey, tenant: TenantId, name: string): boolean =>
  key.layer.kind === 'tenant' && tenantEquals(key.layer.tenant, tenant) && key.asset.name === name

/** The versions of a tenant's tool that are loaded and are not the one it holds in force now. */
function staleKeys(ctx: Context, tenant: TenantId, name: string, current: ToolBindingKey | null) {
  const rows = ctx.get(toolBindingsKey)?.snapshot({ scope: 'system' })
  if (rows === undefined || 'failure' in rows) return []
  return rows.ok
    .map(row => row.key)
    .filter(key => heldBy(key, tenant, name) && (current === null || !sameBindingKey(key, current)))
}

/** The tool a tenant holds in force under a name, loaded; a version it no longer holds is taken down first. */
export async function currentHeldTool(
  ctx: Context,
  access: Access<unknown>,
  name: string,
): Promise<CurrentHeldTool> {
  const standing = heldToolStanding(heldReadingOf(ctx), access.tenant, name)
  if (standing.kind === 'unavailable')
    return { kind: 'unavailable', diagnostic: `what the tenant holds as ${name} cannot be read` }
  const generations = ctx.get(toolGenerationsKey)
  if (generations === undefined)
    return { kind: 'unavailable', diagnostic: 'the tool generations coordinator is absent' }
  const authority =
    standing.kind === 'held' ? heldToolAuthority(access.tenant, name, standing.candidate) : null
  const key = authority === null ? null : { layer: authority.layer, asset: authority.asset }
  for (const stale of staleKeys(ctx, access.tenant, name, key))
    await generations.unload({ key: stale }).catch(() => undefined)
  if (authority === null) return { kind: 'none' }
  const loaded = await generations.ensureLoaded({ authority, access })
  if ('ok' in loaded) return { kind: 'held', authority }
  const { failure } = loaded
  return {
    kind: 'unavailable',
    diagnostic: `the tool ${name} could not be loaded: ${failure.kind}${'reason' in failure ? ` (${failure.reason})` : 'diagnostic' in failure ? ` (${failure.diagnostic})` : ''}`,
  }
}
