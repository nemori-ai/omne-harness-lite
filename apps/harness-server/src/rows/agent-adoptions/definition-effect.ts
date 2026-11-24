import type { Context } from '@deepseek-ai/cordis'
import {
  definitionImpact,
  definitionPlaces,
  type AgentDefinition,
  type DefinitionFacts,
} from '@omne-harness/agent-contract'
import { agentDefinitionsPoint } from '@omne-harness/agent-cordis-contract/cordis'
import {
  judgePackageContent,
  type CategoryEffect,
  type JsonValue,
  type PublishContent,
} from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { toolToolsPoint } from '@omne-harness/tool-cordis-contract/cordis'
import { releaseOf } from '../../entry/tool-release.ts'
import { askerLayersOf } from '../tenant-assets/asker-layers.ts'
import { heldStandingOf, rejectionText } from '../tenant-assets/held-standing.ts'
import { heldReadingOf } from '../tool-host/held-now.ts'
import { heldToolStanding } from '../tool-host/held-tools.ts'
import { DEFINITION_CATEGORY, writtenDefinitionOf } from './held-definitions.ts'
import { TOOL_CATEGORY } from './table.ts'

const POINT = agentDefinitionsPoint.name
const TOOL_POINT = toolToolsPoint.name
const NOT_A_DIRECTORY = 'a definition made here is published from a directory'

/** Whether a tool is there for a tenant now: one of the release, or one it holds in force. Null: that cannot be read. */
function toolThere(ctx: Context, tenant: TenantId | undefined, name: string): boolean | null {
  const release = releaseOf(ctx)
  if (release.kind !== 'trusted' || tenant === undefined) return null
  if (release.manifest.entries.some(entry => entry.asset.name === name)) return true
  const standing = heldToolStanding(heldReadingOf(ctx), tenant, name)
  return standing.kind === 'unavailable' ? null : standing.kind === 'held'
}

/** What a definition writes that bears on whether it works: its resident tools, and the references that do nothing yet. */
function referencesOf(ctx: Context, tenant: TenantId | undefined, definition: AgentDefinition) {
  const tools = definition.references.filter(
    reference => reference.capability.category === TOOL_CATEGORY,
  )
  return {
    residents: tools
      .filter(reference => reference.resident === true)
      .map(({ capability }) => ({
        name: capability.name,
        there: toolThere(ctx, tenant, capability.name),
      })),
    inert: definition.references
      .filter(reference => reference.capability.category !== TOOL_CATEGORY)
      .map(({ capability }) => `${capability.category}/${capability.name}`),
  }
}

/** What the definition category tells of its own: what publishing a directory would do, and whether a held one can be used. */
export function definitionEffectOf(
  ctx: Context,
  official: (name: string) => boolean,
): CategoryEffect {
  async function factsOf(
    tenantRef: string,
    name: string,
    body: JsonValue | string,
  ): Promise<DefinitionFacts> {
    const none = { name, official: official(name), residents: [], inert: [] }
    if (typeof body === 'string') return { ...none, refused: body }
    const written = await writtenDefinitionOf(body)
    if (typeof written === 'string') return { ...none, refused: written }
    const tenant = tenantCodec.parse(tenantRef)
    const references = referencesOf(ctx, tenant.ok ? tenant.value : undefined, written)
    return { ...none, refused: null, ...references }
  }
  async function bodyIn(name: string, content: PublishContent): Promise<JsonValue | string> {
    const contract = ctx.get(assetCategoriesKey)?.view.lookup(DEFINITION_CATEGORY)
    if (contract === undefined) return 'the definition category is not there now'
    if (content.kind !== 'directory') return NOT_A_DIRECTORY
    const judged = await judgePackageContent(contract, content.from, name)
    return 'ok' in judged ? judged.ok.body : rejectionText(judged.failure)
  }
  return {
    impact: {
      async of({ tenant, capability, change, content }) {
        const { name } = capability
        if (change !== 'publish' || content === undefined) {
          const going = change === 'disable' || change === 'remove'
          const says = going
            ? '→ work can no longer be handed to it, and no session is made with it'
            : '→ work can be handed to it again'
          const line = { mark: going ? '-' : '+', of: null, point: POINT, key: name, says } as const
          return { kind: 'changes', lines: [line], loads: null, advice: null }
        }
        const facts = await factsOf(tenant, name, await bodyIn(name, content))
        return { kind: 'changes', ...definitionImpact(POINT, TOOL_POINT, facts), loads: null }
      },
    },
    placement: {
      async of({ tenant, capability }) {
        const { name } = capability
        const held = heldStandingOf(ctx, capability, tenant)
        const owner = tenantCodec.parse(tenant)
        const layers = owner.ok
          ? await askerLayersOf(ctx, DEFINITION_CATEGORY)({ tenant: owner.value })
          : undefined
        const body =
          held === undefined || layers === undefined ? undefined : await layers.body(held.candidate)
        const facts = await factsOf(tenant, name, body ?? 'its body cannot be read now')
        const told = definitionPlaces(POINT, TOOL_POINT, held?.standing, facts)
        return { kind: 'placed', ...told, clients: null }
      },
    },
  }
}
