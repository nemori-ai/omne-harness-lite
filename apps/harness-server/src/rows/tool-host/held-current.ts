import type { Context } from '@deepseek-ai/cordis'
import {
  capabilityId,
  collectCandidates,
  evaluate,
  listAssets,
  MAX_ASSET_PAGE,
} from '@omne-harness/assets'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import {
  sameBindingKey,
  type ToolAuthority,
  type ToolBindingKey,
} from '@omne-harness/tool-contract/provider'
import { toolBindingsKey, toolGenerationsKey } from '@omne-harness/tool-cordis-contract/cordis'
import { askerLayersOf, type LayerAsker } from '../tenant-assets/asker-layers.ts'
import { inWorkspace } from '../tenant-assets/layers.ts'
import { turnOfAccess, type Turn } from '../tenant-assets/turn.ts'
import {
  TOOL_CATEGORY,
  heldToolAuthority,
  heldToolStanding,
  ownLayer,
  type HeldToolStanding,
} from './held-tools.ts'
import { heldReadingOf } from './held-now.ts'
import { rememberWorkspaceTool } from './workspace-tools.ts'

export type CurrentHeldTool =
  | Readonly<{ kind: 'held'; authority: ToolAuthority }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unfit'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** A load that failed for now, as against one that the held version itself makes fail. */
const PASSING = ['unavailable', 'draining', 'missing']

const layersOf = (ctx: Context, asker: LayerAsker) => askerLayersOf(ctx, TOOL_CATEGORY)(asker)

/** The names of the tools a tenant holds, enabled or not, and with a turn those of its workspace; undefined when they cannot be listed. */
export async function heldToolNames(
  ctx: Context,
  tenant: TenantId,
  turn: Turn | null = null,
): Promise<readonly string[] | undefined> {
  const layers = await layersOf(ctx, turn === null ? { tenant } : { tenant, turn })
  if (layers === undefined) return undefined
  const names = new Set<string>()
  let after: string | null = null
  do {
    const answer = await listAssets(layers.sources, {
      category: TOOL_CATEGORY,
      after,
      limit: MAX_ASSET_PAGE,
    })
    if (answer.state !== 'read' || answer.page.completeness === 'partial') return undefined
    for (const item of answer.page.items)
      if (item.layer !== 'official') names.add(item.capability.name)
    after = answer.page.next
  } while (after !== null)
  return [...names]
}

export async function heldReadable(ctx: Context, access: Access<unknown>): Promise<boolean> {
  const turn = await turnOfAccess(ctx, access)
  return turn !== undefined && (await heldToolNames(ctx, access.tenant, turn)) !== undefined
}

/** What stands under a name in a turn: the layers are evaluated as that turn reads them, and a workspace winner is kept in mind. */
async function standingIn(
  ctx: Context,
  tenant: TenantId,
  name: string,
  turn: Turn,
): Promise<HeldToolStanding> {
  const capability = capabilityId(TOOL_CATEGORY, name)
  if (!capability.ok) return { kind: 'none' }
  const layers = await layersOf(ctx, { tenant, turn })
  if (layers === undefined) return { kind: 'unavailable' }
  const answer = evaluate({
    layers: await collectCandidates(layers.sources, capability.id),
    eligible: () => 'yes',
  })
  if (answer.kind === 'unavailable') return { kind: 'unavailable' }
  if (answer.kind !== 'winner' || answer.layer === 'official') return { kind: 'none' }
  const { candidate } = answer
  if (!inWorkspace(candidate.asset)) return { kind: 'held', candidate }
  const body = await layers.body(candidate)
  if (body === undefined) return { kind: 'unavailable' }
  rememberWorkspaceTool(ctx, tenant, candidate, body)
  return { kind: 'held', candidate }
}

/** The versions of the same tool, from the same place, that are loaded and are not the one in force now. */
function loadedAndNoLongerHeld(
  ctx: Context,
  tenant: TenantId,
  name: string,
  current: ToolBindingKey | null,
) {
  const rows = ctx.get(toolBindingsKey)?.snapshot({ scope: 'system' })
  if (rows === undefined || 'failure' in rows) return []
  const from = current?.asset.adoption.revision
  return rows.ok
    .map(row => row.key)
    .filter(key => ownLayer(key.layer, tenant) && key.asset.name === name)
    .filter(key =>
      from === undefined
        ? !inWorkspace(key.asset.adoption.revision)
        : key.asset.adoption.revision === from && !sameBindingKey(key, current!),
    )
}

/** The tool in force under a name, loaded: the one the tenant holds, or in a turn the one of its workspace. No `turn`: that of the access. */
export async function currentHeldTool(
  ctx: Context,
  access: Access<unknown>,
  name: string,
  turn?: Turn | null,
): Promise<CurrentHeldTool> {
  const at = turn === undefined ? await turnOfAccess(ctx, access) : turn
  const standing =
    at === undefined
      ? ({ kind: 'unavailable' } as const)
      : at === null
        ? heldToolStanding(heldReadingOf(ctx), access.tenant, name)
        : await standingIn(ctx, access.tenant, name, at)
  if (standing.kind === 'unavailable')
    return { kind: 'unavailable', diagnostic: `what the tenant holds as ${name} cannot be read` }
  const generations = ctx.get(toolGenerationsKey)
  if (generations === undefined)
    return { kind: 'unavailable', diagnostic: 'the tool generations coordinator is absent' }
  const authority =
    standing.kind === 'held' ? heldToolAuthority(access.tenant, name, standing.candidate) : null
  const key = authority === null ? null : { layer: authority.layer, asset: authority.asset }
  // With a turn, the tenant's own tool of this name may serve its other sessions: it is left loaded.
  if (!(key === null && at !== null))
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
