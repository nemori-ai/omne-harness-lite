import type { Context } from '@deepseek-ai/cordis'
import {
  RequestPreparationService,
  agentAdoptionsKey,
  agentCompactionInputsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ModelPreparationResources } from '@omne-harness/model-contract'
import { modelRequestPreparationKey } from '@omne-harness/model-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import { createAbsentConversionResults } from '@omne-harness/request-context'
import { standardSchema, type Adoption, type Decoder } from '@omne-harness/request-context-contract'
import {
  contextHolderSourcesKey,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { createContextMaterials } from './materials.ts'
import type { ContextMeasure } from './measure.ts'
import { createAgentRequests, type AgentRequests } from './requests.ts'
import { absentToolLookup, toolsSourceOf, type ToolLookup } from './tools.ts'
import { definitionSourceOf, unavailable } from './translate.ts'

export const MODEL_PREPARATION_RESOURCES = 'modelPreparationResources'

const ADOPTION_FIELDS = ['owner', 'name', 'revision', 'digest'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function hasExactly(value: Record<string, unknown>, names: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === names.length && names.every(name => keys.includes(name))
}
function isAdoption(value: unknown): value is Adoption {
  return (
    isRecord(value) &&
    hasExactly(value, ADOPTION_FIELDS) &&
    ADOPTION_FIELDS.every(name => typeof value[name] === 'string')
  )
}

export type AgentContextConfig = Readonly<{
  owner: Adoption
}>

const decodeContextConfig: Decoder<AgentContextConfig> = (value, path) => {
  const fail = (message: string) => ({ ok: false as const, issues: [{ path, message }] })
  if (!isRecord(value)) return fail('The plugin configuration must be an object')
  const { owner } = value
  if (Object.keys(value).some(name => name !== 'owner'))
    return fail('The plugin configuration has the one field owner')
  if (!isAdoption(owner))
    return fail('owner must be an adoption: owner, name, revision and digest, all text')
  return { ok: true, value: { owner } }
}

export class AgentContextProvider extends RequestPreparationService<unknown> {
  static readonly inject = {
    [requestContextKey]: null,
    [contextHolderSourcesKey]: null,
    [modelRequestPreparationKey]: null,
    [MODEL_PREPARATION_RESOURCES]: null,
    [agentAdoptionsKey]: null,
    [agentCompactionInputsKey]: null,
  }
  static readonly Config = standardSchema(decodeContextConfig)
  readonly prepare: RequestPreparationService<unknown>['prepare']
  readonly assessCompaction: RequestPreparationService<unknown>['assessCompaction']
  readonly resume: RequestPreparationService<unknown>['resume']

  constructor(ctx: Context, config: AgentContextConfig, input: AgentContextPluginInput = {}) {
    super(ctx)
    const { measure } = input
    const toolLookup = input.toolLookup?.(ctx) ?? absentToolLookup
    const materials = createContextMaterials({ owner: config.owner })
    let requests: AgentRequests<unknown> | null = null
    const leased = ctx.contextHolderSources.lease({
      settle: () => requests?.close() ?? Promise.resolve({ kind: 'settled' }),
    })
    const preparation: ModelPreparationResources<unknown> = ctx[MODEL_PREPARATION_RESOURCES]
    const refused =
      leased.kind === 'leased'
        ? unavailable('agent-context-closed')
        : unavailable(leased.diagnostic, 'context-holder')
    if (leased.kind === 'leased') {
      const { parts } = leased.lease
      requests = createAgentRequests({
        materials,
        parts,
        requestContext: ctx.requestContext,
        preparation,
        conversions: createAbsentConversionResults(),
        model: ctx.modelRequestPreparation,
        tools: toolsSourceOf(toolLookup),
        compactionInputs: ctx.agentCompactionInputs,
        definitions: definitionSourceOf(ctx.agentAdoptions),
        ...(measure === undefined ? {} : { measure }),
      })
    }
    const live = requests
    this.prepare = async input => (live ? live.prepare(input) : fail(refused))
    this.assessCompaction = async input => (live ? live.assessCompaction(input) : fail(refused))
    this.resume = async input => (live ? live.resume(input) : fail(refused))
  }
}

export type AgentContextPluginInput = Readonly<{
  measure?: ContextMeasure
  toolLookup?: (ctx: Context) => ToolLookup<unknown>
}>

export function createAgentContextPlugin(
  input: AgentContextPluginInput = {},
): typeof AgentContextProvider {
  const given = { ...input }
  return class AgentContextAssembledPlugin extends AgentContextProvider {
    constructor(ctx: Context, config: AgentContextConfig) {
      super(ctx, config, given)
    }
  }
}
