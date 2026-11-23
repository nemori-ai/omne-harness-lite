import type { Context } from '@deepseek-ai/cordis'
import { capabilityId, listAssets, MAX_ASSET_PAGE, type HeldReading } from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import {
  sameBindingKey,
  type ToolAuthority,
  type ToolBindingKey,
} from '@omne-harness/tool-contract/provider'
import { toolBindingsKey, toolGenerationsKey } from '@omne-harness/tool-cordis-contract/cordis'
import { tenantAssetsKey } from '../tenant-assets/service.ts'
import { TOOL_CATEGORY, heldToolAuthority, heldToolStanding, ownLayer } from './held-tools.ts'

export type CurrentHeldTool =
  | Readonly<{ kind: 'held'; authority: ToolAuthority }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unfit'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** A load that failed for now, as against one that the held version itself makes fail. */
const PASSING = ['unavailable', 'draining', 'missing']

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

/** The names of the tools a tenant holds, enabled or not; undefined when its assets cannot be listed. */
export async function heldToolNames(
  ctx: Context,
  tenant: TenantId,
): Promise<readonly string[] | undefined> {
  const encoded = tenantCodec.encode(tenant)
  const service = ctx.get(tenantAssetsKey)
  if (!encoded.ok || service === undefined) return undefined
  if ((await service.open(encoded.value)) === undefined)
    return (await service.standing(encoded.value)) === 'unregistered' ? [] : undefined
  const names = new Set<string>()
  let after: string | null = null
  do {
    const answer = await listAssets(service.layerSources(encoded.value), {
      category: TOOL_CATEGORY,
      after,
      limit: MAX_ASSET_PAGE,
    })
    if (answer.state !== 'read' || answer.page.completeness === 'partial') return undefined
    for (const item of answer.page.items)
      if (item.layer === 'tenant') names.add(item.capability.name)
    after = answer.page.next
  } while (after !== null)
  return [...names]
}

const heldBy = (key: ToolBindingKey, tenant: TenantId, name: string): boolean =>
  ownLayer(key.layer, tenant) && key.asset.name === name

function loadedAndNoLongerHeld(
  ctx: Context,
  tenant: TenantId,
  name: string,
  current: ToolBindingKey | null,
) {
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
  for (const stale of loadedAndNoLongerHeld(ctx, access.tenant, name, key))
    await generations.unload({ key: stale }).catch(() => undefined)
  if (authority === null) return { kind: 'none' }
  const loaded = await generations.ensureLoaded({ authority, access })
  if ('ok' in loaded) return { kind: 'held', authority }
  const { failure } = loaded
  const detail =
    'reason' in failure
      ? ` (${failure.reason})`
      : 'diagnostic' in failure
        ? ` (${failure.diagnostic})`
        : ''
  const said = `the tool ${name} could not be loaded: ${failure.kind}${detail}`
  return PASSING.includes(failure.kind)
    ? { kind: 'unavailable', diagnostic: said }
    : { kind: 'unfit', reason: said }
}

/** The key of the tool a tenant holds in force under a name now, read where it stands; null when it holds none. */
export function heldKeyNow(ctx: Context, tenant: TenantId, name: string): ToolBindingKey | null {
  const standing = heldToolStanding(heldReadingOf(ctx), tenant, name)
  if (standing.kind !== 'held') return null
  const { layer, asset } = heldToolAuthority(tenant, name, standing.candidate)
  return { layer, asset }
}

/** Whether a key is the tool its tenant holds in force now: the layer of that tenant, the same version. */
export function isHeldNow(ctx: Context, tenant: TenantId, key: ToolBindingKey): boolean {
  if (!ownLayer(key.layer, tenant)) return false
  const now = heldKeyNow(ctx, tenant, key.asset.name)
  return now !== null && sameBindingKey(now, key)
}
