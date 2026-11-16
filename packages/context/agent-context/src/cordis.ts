import type { Context } from '@deepseek-ai/cordis'
import type { AgentAccountOutlet, ModelContextReader } from '@omne-harness/agent-contract'
import {
  AgentAccountOutletService,
  ModelContextReaderService,
  RequestPreparationService,
  agentAdoptionsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ModelPreparationResources } from '@omne-harness/model-contract'
import { modelRequestPreparationKey } from '@omne-harness/model-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import { createAbsentConversionResults } from '@omne-harness/request-context'
import { standardSchema, type Adoption, type Decoder } from '@omne-harness/request-context-contract'
import {
  contextAccountingInboxKey,
  contextHolderSourcesKey,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import {
  runtimeContextKey,
  runtimeContextReaderEligibilityKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { absentAccountTarget, createAgentAccountOutlet } from './account-outlet.ts'
import { createContextMaterials } from './materials.ts'
import type { ContextMeasure } from './measure.ts'
import { createAgentModelContext } from './model-context.ts'
import { createAgentRequests, type AgentRequests } from './requests.ts'
import { absentToolLookup, toolsSourceOf, type ToolLookup } from './tools.ts'
import { absentStepResults, definitionSourceOf, unavailable } from './translate.ts'

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

export type AgentAccountOutletConfig = Readonly<{ sender: Adoption }>

const decodeOutletConfig: Decoder<AgentAccountOutletConfig> = (value, path) => {
  const fail = (message: string) => ({ ok: false as const, issues: [{ path, message }] })
  if (!isRecord(value)) return fail('The plugin configuration must be an object')
  if (!hasExactly(value, ['sender']))
    return fail('The plugin configuration has exactly one field: sender')
  return isAdoption(value['sender'])
    ? { ok: true, value: { sender: value['sender'] } }
    : fail('sender must be an adoption: owner, name, revision and digest, all text')
}

export class AgentAccountOutletProvider extends AgentAccountOutletService<unknown> {
  static readonly inject = [requestContextKey, contextAccountingInboxKey]
  static readonly Config = standardSchema(decodeOutletConfig)
  private closed = false
  readonly deliver: AgentAccountOutlet<unknown>['deliver']

  constructor(ctx: Context, config: AgentAccountOutletConfig) {
    super(ctx)
    const outlet = createAgentAccountOutlet({
      inbox: ctx.contextAccountingInbox,
      sender: config.sender,
      resolveTarget: absentAccountTarget,
    })
    this.deliver = async input =>
      this.closed ? { kind: 'unavailable', diagnostic: 'outlet-closed' } : outlet.deliver(input)
    ctx.effect(() => () => {
      this.closed = true
    })
  }
}

export const DEFAULT_MATERIAL_CAPACITY = 256

export type AgentContextConfig = Readonly<{
  owner: Adoption
  materials?: number
}>

const decodeContextConfig: Decoder<AgentContextConfig> = (value, path) => {
  const fail = (message: string) => ({ ok: false as const, issues: [{ path, message }] })
  if (!isRecord(value)) return fail('The plugin configuration must be an object')
  const { owner, materials } = value
  const known = ['owner', 'materials']
  if (Object.keys(value).some(name => !known.includes(name)))
    return fail('The plugin configuration has the fields owner and materials')
  if (!isAdoption(owner))
    return fail('owner must be an adoption: owner, name, revision and digest, all text')
  if (materials === undefined) return { ok: true, value: { owner } }
  if (typeof materials !== 'number' || !Number.isSafeInteger(materials) || materials < 1)
    return fail('materials must be a positive safe integer')
  return { ok: true, value: { owner, materials } }
}

class ModelContextProvider extends ModelContextReaderService<unknown> {
  readonly read: ModelContextReader<unknown>['read']
  constructor(ctx: Context, read: ModelContextReader<unknown>['read']) {
    super(ctx)
    this.read = read
  }
}

export class AgentContextProvider extends RequestPreparationService<unknown> {
  static readonly inject = {
    [requestContextKey]: null,
    [contextHolderSourcesKey]: null,
    [runtimeContextReaderEligibilityKey]: null,
    [runtimeContextKey]: { consumer: 'model' },
    [modelRequestPreparationKey]: null,
    [MODEL_PREPARATION_RESOURCES]: null,
    [agentAdoptionsKey]: null,
  }
  static readonly Config = standardSchema(decodeContextConfig)
  readonly prepare: RequestPreparationService<unknown>['prepare']
  readonly derive: RequestPreparationService<unknown>['derive']
  readonly resume: RequestPreparationService<unknown>['resume']

  constructor(ctx: Context, config: AgentContextConfig, input: AgentContextPluginInput = {}) {
    super(ctx)
    const { measure } = input
    const toolLookup = input.toolLookup?.(ctx) ?? absentToolLookup
    const materials = createContextMaterials<unknown>({
      owner: config.owner,
      capacity: config.materials ?? DEFAULT_MATERIAL_CAPACITY,
    })
    let requests: AgentRequests<unknown> | null = null
    let closed = false
    const leased = ctx.contextHolderSources.lease({
      settle: () => requests?.close() ?? Promise.resolve({ kind: 'settled' }),
    })
    const preparation: ModelPreparationResources<unknown> = ctx[MODEL_PREPARATION_RESOURCES]
    const refused =
      leased.kind === 'leased'
        ? unavailable('agent-context-closed')
        : unavailable(leased.diagnostic, 'context-holder')
    let read: ModelContextReader<unknown>['read'] = async () => fail(refused)
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
        stepResults: absentStepResults,
        definitions: definitionSourceOf(ctx.agentAdoptions),
        ...(measure === undefined ? {} : { measure }),
      })
      read = createAgentModelContext({
        materials,
        parts,
        eligibility: ctx.runtimeContextReaderEligibility,
        runtimeContext: { bind: eligibility => ctx.runtimeContext.bind(eligibility) },
        ...(measure === undefined ? {} : { measure }),
      }).read
    }
    const live = requests
    this.prepare = async input => (live ? live.prepare(input) : fail(refused))
    this.derive = async input => (live ? live.derive(input) : fail(refused))
    this.resume = async input => (live ? live.resume(input) : fail(refused))
    const modelRead = read
    new ModelContextProvider(ctx, async input => (closed ? fail(refused) : modelRead(input)))
    ctx.effect(
      () => () => {
        closed = true
        materials.close()
      },
      'agentContext.close',
    )
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
