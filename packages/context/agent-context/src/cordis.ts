// The two plugins of agent-context. `AgentContextProvider` provides agentRequests and
// agentModelContext in one fiber, so the reads that one hands out are the material the other
// resolves. `AgentAccountOutletProvider` provides agentAccountOutlet. Each plugin stays pending and
// provides nothing while a key it injects is absent.
import type { Context } from '@deepseek-ai/cordis'
import type { AgentAccountOutlet, ModelContextReader } from '@omne-harness/agent-contract'
import {
  AgentAccountOutletService,
  ModelContextReaderService,
  RequestPreparationService,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ModelPreparationResources, ResultCapacity } from '@omne-harness/model-contract'
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
import { createAgentModelContext } from './model-context.ts'
import { createAgentRequests, type AgentRequests } from './requests.ts'
import { absentStepResults, firstWaveTools, unavailable } from './translate.ts'

/**
 * The key of the Model preparation resources (X-3). Its Cordis definition belongs to
 * model-cordis-contract and is not there yet; the plugin injects the key by this name and reads the
 * value as the `ModelPreparationResources` type of model-contract.
 */
export const MODEL_PREPARATION_RESOURCES = 'modelPreparationResources'

const ADOPTION_FIELDS = ['owner', 'name', 'revision', 'digest'] as const
const CAPACITY_FIELDS = ['bytes', 'blocks', 'attachmentBytes'] as const
const DECIMAL = /^(0|[1-9][0-9]*)$/u

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
function isCapacity(value: unknown): value is ResultCapacity {
  return (
    isRecord(value) &&
    hasExactly(value, CAPACITY_FIELDS) &&
    CAPACITY_FIELDS.every(name => {
      const member = value[name]
      return typeof member === 'string' && DECIMAL.test(member)
    })
  )
}

/** The plugin configuration: the adoption identity of the outlet, given as the sender. */
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

/**
 * Provides agentAccountOutlet. The first wave gives no target resolver (ACCT-TARGET), so every
 * delivery answers unavailable with scope-unresolved. The service ends with its fiber; a reference
 * kept past that answers unavailable, never a success.
 */
export class AgentAccountOutletProvider extends AgentAccountOutletService<unknown> {
  static readonly inject = [requestContextKey, contextAccountingInboxKey]
  /** Checked before the constructor runs; a configuration that does not fit fails the load. */
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

/** The initial capacity of each material table, when the configuration gives none. */
export const DEFAULT_MATERIAL_CAPACITY = 256

/**
 * The configuration of `AgentContextProvider`: the adoption identity that owns the registrations
 * and the evidence, the result capacity that a ready preparation carries, and the capacity of
 * each material table.
 */
export type AgentContextConfig = Readonly<{
  owner: Adoption
  resultCapacity: ResultCapacity
  materials?: number
}>

const decodeContextConfig: Decoder<AgentContextConfig> = (value, path) => {
  const fail = (message: string) => ({ ok: false as const, issues: [{ path, message }] })
  if (!isRecord(value)) return fail('The plugin configuration must be an object')
  const { owner, resultCapacity, materials } = value
  const known = ['owner', 'resultCapacity', 'materials']
  if (Object.keys(value).some(name => !known.includes(name)))
    return fail('The plugin configuration has the fields owner, resultCapacity and materials')
  if (!isAdoption(owner))
    return fail('owner must be an adoption: owner, name, revision and digest, all text')
  if (!isCapacity(resultCapacity))
    return fail('resultCapacity must give bytes, blocks and attachmentBytes as decimal text')
  if (materials === undefined) return { ok: true, value: { owner, resultCapacity } }
  if (typeof materials !== 'number' || !Number.isSafeInteger(materials) || materials < 1)
    return fail('materials must be a positive safe integer')
  return { ok: true, value: { owner, resultCapacity, materials } }
}

/** Provides agentModelContext in the fiber of the provider of agentRequests. */
class ModelContextProvider extends ModelContextReaderService<unknown> {
  readonly read: ModelContextReader<unknown>['read']
  constructor(ctx: Context, read: ModelContextReader<unknown>['read']) {
    super(ctx)
    this.read = read
  }
}

/**
 * Provides agentRequests and agentModelContext. It takes one lease of the holder parts (K-RQ) on its
 * fiber; when the fiber unloads the holder pulls the settlement, which withdraws every source set
 * this plugin registered. Both services end with the fiber; a reference kept past that answers
 * unavailable, never a success.
 */
export class AgentContextProvider extends RequestPreparationService<unknown> {
  static readonly inject = {
    [requestContextKey]: null,
    [contextHolderSourcesKey]: null,
    [runtimeContextReaderEligibilityKey]: null,
    [runtimeContextKey]: { consumer: 'model' },
    [modelRequestPreparationKey]: null,
    [MODEL_PREPARATION_RESOURCES]: null,
  }
  /** Checked before the constructor runs; a configuration that does not fit fails the load. */
  static readonly Config = standardSchema(decodeContextConfig)
  readonly prepare: RequestPreparationService<unknown>['prepare']
  readonly derive: RequestPreparationService<unknown>['derive']
  readonly resume: RequestPreparationService<unknown>['resume']

  constructor(ctx: Context, config: AgentContextConfig) {
    super(ctx)
    const materials = createContextMaterials<unknown>({
      owner: config.owner,
      capacity: config.materials ?? DEFAULT_MATERIAL_CAPACITY,
    })
    let requests: AgentRequests<unknown> | null = null
    let closed = false
    // The lease is an effect of this fiber: its unload ends the lease and the holder pulls this.
    const leased = ctx.contextHolderSources.lease({
      settle: () => requests?.close() ?? Promise.resolve({ kind: 'settled' }),
    })
    const preparation: ModelPreparationResources<unknown> = ctx.get(MODEL_PREPARATION_RESOURCES)
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
        resultCapacity: config.resultCapacity,
        tools: firstWaveTools,
        stepResults: absentStepResults,
      })
      read = createAgentModelContext({
        materials,
        parts,
        eligibility: ctx.runtimeContextReaderEligibility,
        runtimeContext: { bind: eligibility => ctx.runtimeContext.bind(eligibility) },
      }).read
    }
    // After the lease ends `requests` refuses by itself; the reader needs the flag below.
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
