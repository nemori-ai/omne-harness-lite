// The two service faces of the `agent-adoptions` row. They are built from one table object in one
// plugin body, so they share one content identity. An unknown adoption never falls back to a
// default definition.
import type { Context } from '@deepseek-ai/cordis'
import { agentEvaluator } from '@omne-harness/agent'
import { judgeAdoption, type AgentAdoptions } from '@omne-harness/agent-contract'
import { AgentAdoptionsService } from '@omne-harness/agent-cordis-contract/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  DefinitionMappingsService,
  type DefinitionMappingEntry,
  type DefinitionMappings,
} from '@omne-harness/server-entry/cordis'
import type { Adoption } from '@omne-harness/session-contract'
import type { MappingTable } from './table.ts'

/** The table of the deployment as the trusted `definitionMappings` service. */
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

/**
 * `agentAdoptions` over the table. `resolve` answers only for a candidate that the table holds.
 * `handover` is `unsupported` in wave 1: the table holds one candidate per definition name, so
 * there is no other adoption to hand an execution over to, and no proof is made up.
 */
export class AgentAdoptionsImpl extends AgentAdoptionsService<unknown> {
  /** The table that this face reads. A consumer of the same row sees the same object. */
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
