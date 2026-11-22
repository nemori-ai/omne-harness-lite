import type { Context } from '@deepseek-ai/cordis'
import { evaluate, layerInputsOf } from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { agentEvaluator } from '@omne-harness/agent'
import {
  judgeAdoption,
  type AgentAdoptions,
  type AgentDefinitionListing,
} from '@omne-harness/agent-contract'
import { AgentAdoptionsService } from '@omne-harness/agent-cordis-contract/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  DefinitionMappingsService,
  type DefinitionMappingEntry,
  type DefinitionMappings,
} from './definition-mappings.ts'
import type { Adoption } from '@omne-harness/session-contract'
import { AgentDefinitionCatalogService } from './definition-catalog.ts'
import { officialAssetRef } from '../../assets/official-holdings.ts'
import type { MappingTable } from './table.ts'

export const DEFINITION_CATEGORY = 'AgentDefinition'

/** A tenant sees a definition of the table while, read as that tenant, the official one is the one in force under its name. */
export class AgentDefinitionCatalogImpl extends AgentDefinitionCatalogService {
  private readonly listings: readonly AgentDefinitionListing[]
  constructor(ctx: Context, table: MappingTable) {
    super(ctx)
    this.listings = table.listings
  }
  visibleTo(tenant: TenantId): readonly AgentDefinitionListing[] | undefined {
    const categories = this.ctx.get(assetCategoriesKey)
    const encoded = tenantCodec.encode(tenant)
    if (categories === undefined || !encoded.ok) return undefined
    const seen: AgentDefinitionListing[] = []
    for (const listing of this.listings) {
      const capability = { category: DEFINITION_CATEGORY, name: listing.name }
      const layers = layerInputsOf(categories.held(capability, encoded.value), encoded.value)
      const answer = evaluate({ layers, eligible: () => 'yes' })
      if (answer.kind === 'unavailable') return undefined
      const official = officialAssetRef(DEFINITION_CATEGORY, listing.name)
      if (answer.kind === 'winner' && answer.candidate.asset === official) seen.push(listing)
    }
    return seen
  }
}

export class DefinitionMappingsImpl extends DefinitionMappingsService {
  readonly identity: string
  readonly table: DefinitionMappings
  constructor(ctx: Context, table: DefinitionMappings) {
    super(ctx)
    this.table = table
    this.identity = table.identity
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

export class AgentAdoptionsImpl extends AgentAdoptionsService<unknown> {
  readonly mappings: DefinitionMappings
  private readonly agentSideOf: MappingTable['agentSide']

  constructor(ctx: Context, table: MappingTable) {
    super(ctx)
    this.mappings = table.mappings
    this.agentSideOf = table.agentSide
  }

  readonly resolve: AgentAdoptions<unknown>['resolve'] = async (input): Promise<Resolved> => {
    const judged = judgeAdoption(input.adoption)
    if ('failure' in judged)
      return fail({ kind: 'invalid', field: 'adoption', reason: judged.failure.reason })
    const side = this.agentSideOf(judged.ok)
    if (side === undefined)
      return fail({
        kind: 'invalid',
        field: 'adoption',
        reason: 'not a definition adoption of this deployment',
      })
    return succeed({
      definition: side.definition,
      evaluator: agentEvaluator,
      extensions: side.extensions,
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
