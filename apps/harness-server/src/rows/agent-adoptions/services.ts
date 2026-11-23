import type { Context } from '@deepseek-ai/cordis'
import {
  capabilityId,
  collectCandidates,
  evaluate,
  listAssets,
  MAX_ASSET_PAGE,
} from '@omne-harness/assets'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { agentEvaluator } from '@omne-harness/agent'
import {
  definitionListing,
  judgeAdoption,
  type AgentAdoptions,
  type AgentDefinitionListing,
} from '@omne-harness/agent-contract'
import { AgentAdoptionsService } from '@omne-harness/agent-cordis-contract/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { workspaceSourcesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import {
  DefinitionMappingsService,
  type DefinitionAsker,
  type DefinitionMappingEntry,
  type DefinitionMappings,
  type DefinitionReading,
} from './definition-mappings.ts'
import { DEFINITION_CATEGORY, type DefinitionReadingInput } from './held-definitions.ts'
import {
  tenantLayers,
  turnLayers,
  type AssetLayers,
  type WorkspaceLayerPorts,
} from '../tenant-assets/layers.ts'
import type { Adoption } from '@omne-harness/session-contract'
import { AgentDefinitionCatalogService } from './definition-catalog.ts'
import { officialAssetRef } from '../../assets/official-holdings.ts'
import { tenantAssetsKey } from '../tenant-assets/service.ts'
import type { MappingTable } from './table.ts'

export { DEFINITION_CATEGORY }

/** The layers of a tenant that has no assets yet: it holds nothing, which is read, not unknown. */
const NOTHING_HELD: AssetLayers = Object.freeze({
  sources: Object.freeze([]),
  body: async () => undefined,
  readerOf: () => {
    throw new Error('a tenant without assets has no package to read')
  },
})

/** The layers a tenant reads a definition from, and with a turn the workspace as that turn adopted it. */
export function definitionLayersOf(ctx: Context): DefinitionReadingInput['layers'] {
  const workspace: WorkspaceLayerPorts = {
    sources: () => ctx.get(workspaceSourcesKey),
    contractOf: category => ctx.get(assetCategoriesKey)?.view.lookup(category),
  }
  return async ({ tenant, turn }) => {
    const encoded = tenantCodec.encode(tenant)
    const service = ctx.get(tenantAssetsKey)
    if (!encoded.ok || service === undefined) return undefined
    const assets = await service.open(encoded.value)
    if (assets === undefined)
      return (await service.standing(encoded.value)) === 'unregistered' ? NOTHING_HELD : undefined
    const held = tenantLayers(assets, service.layerSources(encoded.value), () =>
      workspace.contractOf(DEFINITION_CATEGORY),
    )
    return turn === undefined ? held : turnLayers(held, workspace, turn.access, turn.key)
  }
}

/** The names a tenant holds or the workspace of a turn carries in the definition category; undefined when a layer cannot be listed. */
async function heldNames(layers: AssetLayers): Promise<readonly string[] | undefined> {
  const names = new Set<string>()
  let after: string | null = null
  do {
    const answer = await listAssets(layers.sources, {
      category: DEFINITION_CATEGORY,
      after,
      limit: MAX_ASSET_PAGE,
    })
    if (answer.state !== 'read' || answer.page.completeness === 'partial') return undefined
    for (const item of answer.page.items) names.add(item.capability.name)
    after = answer.page.next
  } while (after !== null)
  return [...names]
}

/** What a tenant can hand work to now: the definitions of the table in force for it, and the ones it holds or its turn's workspace carries. */
export class AgentDefinitionCatalogImpl extends AgentDefinitionCatalogService {
  private readonly listings: readonly AgentDefinitionListing[]
  private readonly reading: DefinitionReading
  private readonly layers: DefinitionReadingInput['layers']
  constructor(ctx: Context, table: MappingTable, reading: DefinitionReading) {
    super(ctx)
    this.listings = table.listings
    this.reading = reading
    this.layers = definitionLayersOf(ctx)
  }
  async visibleTo(
    tenant: TenantId,
    turn?: DefinitionAsker['turn'],
  ): Promise<readonly AgentDefinitionListing[] | undefined> {
    const encoded = tenantCodec.encode(tenant)
    const sources = encoded.ok
      ? this.ctx.get(tenantAssetsKey)?.layerSources(encoded.value)
      : undefined
    if (sources === undefined) return undefined
    const seen: AgentDefinitionListing[] = []
    for (const listing of this.listings) {
      const capability = capabilityId(DEFINITION_CATEGORY, listing.name)
      if (!capability.ok) return undefined
      const layers = await collectCandidates(sources, capability.id)
      const answer = evaluate({ layers, eligible: () => 'yes' })
      if (answer.kind === 'unavailable') return undefined
      const official = officialAssetRef(DEFINITION_CATEGORY, listing.name)
      if (answer.kind === 'winner' && answer.candidate.asset === official) seen.push(listing)
    }
    const held = await this.heldBy({ tenant, ...(turn === undefined ? {} : { turn }) })
    return held === undefined ? undefined : [...seen, ...held]
  }

  private async heldBy(
    asker: DefinitionAsker,
  ): Promise<readonly AgentDefinitionListing[] | undefined> {
    const layers = await this.layers(asker)
    const names = layers === undefined ? undefined : await heldNames(layers)
    if (names === undefined) return undefined
    const official = new Set(this.listings.map(listing => listing.name))
    const seen: AgentDefinitionListing[] = []
    for (const name of names) {
      if (official.has(name)) continue
      const read = await this.reading.named(asker, name)
      if (read.kind === 'unavailable') return undefined
      if (read.kind === 'found') seen.push(definitionListing(read.side.definition))
    }
    return seen
  }
}

export class DefinitionMappingsImpl extends DefinitionMappingsService {
  readonly identity: string
  readonly table: DefinitionMappings
  readonly named: DefinitionReading['named']
  readonly adopted: DefinitionReading['adopted']
  readonly modesFor: DefinitionReading['modesFor']
  constructor(ctx: Context, table: DefinitionMappings, reading: DefinitionReading) {
    super(ctx)
    this.table = table
    this.identity = table.identity
    this.named = reading.named
    this.adopted = reading.adopted
    this.modesFor = reading.modesFor
  }
  entries(): readonly DefinitionMappingEntry[] {
    return this.table.entries()
  }
  byName(name: string): DefinitionMappingEntry | undefined {
    return this.table.byName(name)
  }
  byCandidate(candidate: Adoption): DefinitionMappingEntry | undefined {
    return this.table.byCandidate(candidate)
  }
}

type Resolved = Awaited<ReturnType<AgentAdoptions<unknown>['resolve']>>

const OWNER = '@omne-harness/harness-server'

export class AgentAdoptionsImpl extends AgentAdoptionsService<unknown> {
  readonly mappings: DefinitionMappings
  private readonly agentSideOf: MappingTable['agentSide']
  private readonly reading: DefinitionReading

  constructor(ctx: Context, table: MappingTable, reading: DefinitionReading) {
    super(ctx)
    this.mappings = table.mappings
    this.agentSideOf = table.agentSide
    this.reading = reading
  }

  readonly resolve: AgentAdoptions<unknown>['resolve'] = async (input): Promise<Resolved> => {
    const judged = judgeAdoption(input.adoption)
    if ('failure' in judged)
      return fail({ kind: 'invalid', field: 'adoption', reason: judged.failure.reason })
    const read = await this.reading.adopted({ tenant: input.tenant }, judged.ok)
    if (read.kind === 'unavailable')
      return fail({ kind: 'unavailable', owner: OWNER, diagnostic: read.diagnostic })
    if (read.kind === 'absent')
      return fail({ kind: 'invalid', field: 'adoption', reason: read.reason })
    return succeed({
      definition: read.side.definition,
      evaluator: agentEvaluator,
      extensions: read.side.extensions,
    })
  }

  readonly handover: AgentAdoptions<unknown>['handover'] = async input => {
    for (const field of ['from', 'to'] as const) {
      const judged = judgeAdoption(input[field])
      if ('failure' in judged)
        return fail({ kind: 'invalid', field, reason: judged.failure.reason })
      if (this.agentSideOf(judged.ok) === undefined)
        return fail({
          kind: 'invalid',
          field,
          reason: 'not a definition adoption of this deployment',
        })
    }
    return fail({ kind: 'unsupported' })
  }
}
