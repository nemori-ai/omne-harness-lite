// The world of the agentRequests and agentModelContext tests. Real: the Request Context registry and
// operation group with the default strategies, the Runtime Context mechanism, the history and
// adoption doubles of request-context-contract. Doubles: the holder parts (K-RQ), the reader
// eligibility handoff (K-RC), the Model request preparation, and the Model preparation resources,
// which stand in for the X-3 key until it is delivered. Every call the adapter makes downstream is
// counted here.
import type {
  ConsumerRef,
  DurableEvidence,
  ModelContextRead,
  RequestPreparation,
  RuntimeConditions,
  SelectedModel,
} from '@omne-harness/agent-contract'
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeExecutionAttachmentId,
  decodeInputBatchId,
  decodePassageId,
} from '@omne-harness/agent-contract'
import {
  createAgentModelContext,
  createAgentRequests,
  createContextMaterials,
  firstWaveTools,
  type StepResultSource,
  type ToolsSource,
} from '@omne-harness/agent-context'
import {
  accountCodec,
  organizationCodec,
  tenant as mintTenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  judgeMessage,
  parseMessageId,
  parseRecordEntryRef,
  type Message,
} from '@omne-harness/message'
import { decodeModelCallId, type ModelProfile } from '@omne-harness/model-contract'
import {
  createScriptedModelRequestPreparation,
  createScriptedTransport,
} from '@omne-harness/model-contract/testing'
import {
  createContextSourceRegistry,
  createDefaultCompactionPolicy,
  createDefaultRepresentationPolicy,
  createAbsentConversionResults,
} from '@omne-harness/request-context'
import {
  decodeCommitOrder,
  decodeHistorySequence,
  type Access,
  type AdoptedRequestFact,
  type AssemblyOperations,
  type AssemblyResult,
  type ContextSourceRegistry,
  type ContextSources,
  type HistoryEvidence,
  type HistoryRow,
  type RegistrationResult,
  type RequestCandidate,
  type SourceRead,
} from '@omne-harness/request-context-contract'
import {
  countingBasis,
  createAssemblyFixture,
  createScriptedInputMeter,
  createTestingPrincipalBinding,
  fixtureBudget,
  type AssemblyFixture,
  type MemoryAdoptedSource,
  type MeterScript,
} from '@omne-harness/request-context-contract/testing'
import type { ContextHolderParts } from '@omne-harness/request-context-cordis-contract'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import type {
  EligibilityId,
  ReaderEligibilityResult,
  ReaderOperations,
} from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { createScriptedReaderEligibility } from '@omne-harness/runtime-context-cordis-contract/testing'
import { tenantEquals } from '@omne-harness/legal-identity'

export function tenantOf(digit: string): TenantId {
  const org = organizationCodec.parse(`org_${digit.repeat(26)}`)
  const acc = accountCodec.parse(`acc_${digit.repeat(26)}`)
  if (!org.ok || !acc.ok) throw new Error('the fixture identity text is invalid')
  return mintTenant(org.value, acc.value)
}

function must<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(`fixture value refused: ${JSON.stringify(value.failure)}`)
  return value.ok
}

export const owner = { owner: 'agent-context', name: 'test', revision: '1', digest: 'd' }
export const evidence = (record: string): DurableEvidence => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `digest-${record}`,
})
/** The durable evidence of the history head that the holder resolves. */
export const HEAD = evidence('history-head')
export const RESULT_CAPACITY = { bytes: '1048576', blocks: '1024', attachmentBytes: '0' }

export function userMessage(index: number, text: string): Message {
  const id = parseMessageId(`msg_${String(index).padStart(22, 'a')}`)
  if (!id.ok) throw new Error('fixture message id')
  const judged = judgeMessage({
    role: 'user',
    id: id.value,
    blocks: [{ kind: 'text', id: `u${index}`, visibility: { toModel: true, toHuman: true }, text }],
  })
  if ('rejected' in judged) throw new Error(`fixture message refused: ${judged.rejected}`)
  return judged.ok
}
export function historyRow(index: number, text = 'hello'): HistoryRow {
  const seq = decodeHistorySequence(String(index))
  if ('failure' in seq) throw new Error('fixture sequence')
  const message = userMessage(index, text)
  if (message.role !== 'user') throw new Error('fixture role')
  const entry = parseRecordEntryRef(`entry:${index}`)
  if (entry === null) throw new Error('fixture entry')
  return { seq: seq.ok, entry, bytes: '5', prefixDigest: `chain:${index}`, message }
}

export const execution = must(decodeAgentExecutionId('execution-1'))
export function authority(attachment = 'attachment-1', run = execution) {
  return {
    execution: run,
    executionAttachment: must(decodeExecutionAttachmentId(attachment)),
    instance: must(decodeAgentInstanceId('instance-1')),
    generation: '1',
    source: evidence('authority'),
  }
}
/** A meter whose input tokens grow with the number of messages in the measured input. */
export const meterBy =
  (perMessage: number): MeterScript =>
  input => ({ ok: fixtureBudget(String(input.assembled.messages.length * perMessage)) })

export const position: ConsumerRef = {
  owner: 'agent',
  work: 'execution-1',
  position: 'main',
  purpose: 'main',
}

export type WorldOptions = Readonly<{
  tenant?: TenantId
  rows?: readonly HistoryRow[]
  meter?: MeterScript
  tools?: ToolsSource<string>
  stepResults?: StepResultSource<string>
  capacity?: number
  /** Wraps the operation group the adapter gets, to script or observe one outcome. */
  operations?: (real: AssemblyOperations<string>) => AssemblyOperations<string>
}>

export type World = Awaited<ReturnType<typeof createWorld>>

/** Counts the calls of every downstream port and gives the adapter the real ones behind them. */
export async function createWorld(options: WorldOptions = {}) {
  const tenant = options.tenant ?? tenantOf('1')
  const f: AssemblyFixture = createAssemblyFixture({
    tenant,
    rows: options.rows ?? [historyRow(0, 'read it'), historyRow(1, 'thanks')],
    policies: {
      compaction: createDefaultCompactionPolicy({
        config: { retainBudget: { kind: 'tokens', retainTokens: '600' } },
      }),
      representation: createDefaultRepresentationPolicy(),
    },
    ...(options.meter === undefined
      ? {}
      : { preparation: { meter: createScriptedInputMeter(countingBasis, options.meter) } }),
  })
  const access: Access<string> = { principal: 'ada', tenant }
  const counts = {
    resolveHistory: 0,
    eligibility: 0,
    bind: 0,
    register: 0,
    assemble: 0,
    planCompaction: 0,
    deriveStep: 0,
    resume: 0,
    model: 0,
  }

  const historyEvidence: HistoryEvidence = f.history.evidence()
  const parts: ContextHolderParts<string> = {
    history: f.sources.history,
    adopted: f.sources.adopted,
    eligibility: f.sources.eligibility,
    resolveHistory: async ({
      access: who,
      evidence: head,
    }): Promise<SourceRead<HistoryEvidence>> => {
      counts.resolveHistory++
      if (!tenantEquals(who.tenant, tenant)) return { kind: 'denied' }
      return head.record === HEAD.record
        ? { kind: 'value', value: historyEvidence }
        : { kind: 'invalid', field: 'evidence', reason: 'unknown-epoch' }
    },
  }

  // Runtime Context: the real mechanism, its scope bound to the tenant, one model eligibility.
  const ports = createTestAuthorityPorts<string>()
  const rc = createRuntimeContext<string>({ trust: ports })
  ports.bind(f.target.scope, tenant)
  const begun = await rc.beginReplay('holder', {
    scope: f.target.scope,
    tenant,
    through: null,
    supersedes: null,
  })
  if (begun.kind !== 'replaying') throw new Error(`fixture replay: ${begun.kind}`)
  const ready = await rc.finishReplay('holder', {
    replay: begun.replay,
    material: { registrations: [], checkpoints: [], end: null },
  })
  if (ready.kind !== 'ready') throw new Error(`fixture replay end: ${ready.kind}`)
  async function issue(supersedes: EligibilityId | null = null): Promise<EligibilityId> {
    const issued = await rc.issueEligibility('holder', {
      supersedes,
      scope: f.target.scope,
      consumer: 'model',
      principal: access.principal,
      tenant,
      keys: [],
      bindings: [],
      registrationRevision: 0,
    })
    if (issued.kind !== 'issued') throw new Error(`fixture eligibility: ${issued.kind}`)
    return issued.eligibility.id
  }
  let held: EligibilityId = await issue()
  const scriptOf = (result: ReaderEligibilityResult) =>
    createScriptedReaderEligibility<string>({
      scopes: [{ scope: f.target.scope, tenant }],
      answers: [
        {
          request: {
            principal: access.principal,
            tenant,
            scope: f.target.scope,
            consumer: 'model',
          },
          result,
        },
      ],
    })
  type Handed = ReaderEligibilityResult
  let handoff = scriptOf({ kind: 'current', eligibility: held })
  let queued: Handed[] = []
  function answer(result: Handed) {
    handoff = scriptOf(result)
  }
  const runtimeContext: ReaderOperations = {
    bind: async id => {
      counts.bind++
      return rc.bind(id, { consumer: 'model' })
    },
  }

  // Request Context: the real registry with the default strategies.
  const registry: ContextSourceRegistry<string> = createContextSourceRegistry<string>({
    principalBinding: createTestingPrincipalBinding<string>(),
    registrationAuthority: { check: async () => ({ kind: 'allowed' }) },
    policies: f.policies,
  })
  const candidates: RequestCandidate[] = []
  const registered: ContextSources<string>[] = []
  const observed = (real: AssemblyOperations<string>): AssemblyOperations<string> => ({
    assemble: async call => {
      counts.assemble++
      const result: AssemblyResult = await real.assemble(call)
      if ('candidate' in result) candidates.push(result.candidate)
      return result
    },
    planCompaction: async call => {
      counts.planCompaction++
      return real.planCompaction(call)
    },
    deriveStep: async input => {
      counts.deriveStep++
      return real.deriveStep(input)
    },
    resume: async call => {
      counts.resume++
      return real.resume(call)
    },
  })
  let registerAnswer: RegistrationResult | null = null
  const requestContext: Pick<ContextSourceRegistry<string>, 'register' | 'assembly'> = {
    register: async input => {
      counts.register++
      registered.push(input.sources)
      return registerAnswer ?? registry.register(input)
    },
    assembly: target => {
      const real = observed(registry.assembly(target))
      return options.operations === undefined ? real : options.operations(real)
    },
  }

  // Model: the request preparation double, with a plan for the fixture profile.
  const transport = createScriptedTransport({
    receipt: { supplier: owner, representation: owner, payloadDigest: 'none' },
    facts: [],
    ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
    rejection: null,
  })
  const modelDouble = createScriptedModelRequestPreparation<string>({
    transport: transport.transport,
  })
  modelDouble.setAccess(access, 'allow')
  const profile: ModelProfile = f.sources.values().model.profile
  const [supplier] = profile.definition.suppliers
  const plan = {
    suppliers: [
      {
        adoption: supplier.adoption,
        recipient: supplier.recipient,
        model: supplier.model,
        credential: { kind: 'factory' as const },
      },
    ] as const,
    parameterAdoptions: [],
  }
  let planAnswer: Parameters<typeof modelDouble.setPlan>[1] = { ok: plan }
  // The double answers only planned inputs; the plan is set for the input as it arrives, so the
  // double still runs its own checks of tenant, profile, modality and replay on every call.
  const model = {
    prepare: async (input: Parameters<typeof modelDouble.preparation.prepare>[0]) => {
      counts.model++
      modelDouble.setPlan(
        {
          tenant: input.tenant,
          principal: input.principal,
          profile: input.profile,
          required: input.required,
          parameters: input.assembled.parameters,
        },
        planAnswer,
      )
      return modelDouble.preparation.prepare(input)
    },
  }

  const materials = createContextMaterials<string>({ owner, capacity: options.capacity ?? 8 })
  const requests = createAgentRequests<string>({
    materials,
    parts,
    requestContext,
    preparation: f.preparation,
    conversions: createAbsentConversionResults<string>(),
    model,
    resultCapacity: RESULT_CAPACITY,
    tools: options.tools ?? firstWaveTools,
    stepResults: options.stepResults ?? (async () => ({ kind: 'unavailable', diagnostic: 'none' })),
  })
  const reader = createAgentModelContext<string>({
    materials,
    parts,
    eligibility: {
      current: async request => {
        counts.eligibility++
        const next = queued.shift()
        if (next !== undefined) answer(next)
        return handoff.current(request)
      },
    },
    runtimeContext,
  })

  const selection: SelectedModel = {
    recipient: { route: 'route', profile: profile.adoption },
    resolution: {
      kind: 'resolved',
      profile,
      source: evidence('profile'),
      selectable: true,
      reasons: [],
      credential: 'available',
      shadowed: [],
    },
    parameters: [],
    tools: evidence('tools'),
    evidence: evidence('selection'),
  }
  const conditions: RuntimeConditions = {
    source: evidence('conditions'),
    configuration: owner,
    progression: { kind: 'continue', basis: evidence('progression') },
    model: profile.adoption,
    context: evidence('conditions-context'),
    bindings: [],
  }

  function readInput(overrides: Partial<Parameters<typeof reader.read>[0]> = {}) {
    return {
      ...access,
      advance: authority(),
      position,
      recipient: selection.recipient,
      history: HEAD,
      adopted: null,
      transition: null,
      ...overrides,
    }
  }
  async function read(overrides: Partial<Parameters<typeof reader.read>[0]> = {}) {
    const result = await reader.read(readInput(overrides))
    if (!('ok' in result)) throw new Error(`read refused: ${JSON.stringify(result.failure)}`)
    return result.ok
  }
  type PrepareInput = Parameters<RequestPreparation<string>['prepare']>[0]
  function prepareInput(context: ModelContextRead, overrides: Partial<PrepareInput> = {}) {
    const input: PrepareInput = {
      ...access,
      advance: authority(),
      action: must(decodeActionId('action-1')),
      purpose: 'main',
      position,
      history: HEAD,
      inputs: {
        id: must(decodeInputBatchId('batch-1')),
        watermark: evidence('watermark'),
        ordered: [],
      },
      conditions,
      selection,
      context,
      previous: null,
      alterations: [],
      beforeModelCall: null,
      ...overrides,
    }
    return input
  }
  const passed = [must(decodePassageId('passage-1'))]
  const adopted = f.sources.adopted as MemoryAdoptedSource<string>
  /** Makes one candidate the fixed adoption of the target, as the session side would. */
  function adopt(candidate: RequestCandidate, continued = false) {
    const call = must(decodeModelCallId('mcall_fixed'))
    const caller = { tenant, call }
    const fact: AdoptedRequestFact = {
      coverage: candidate.coverage,
      target: f.target,
      call: caller,
      candidate: candidate.candidate,
      order: must(decodeCommitOrder('1')),
      committed: evidence('committed'),
      windowTokens: '1000',
      accounting: { kind: 'unsettled' },
      forecast: null,
      continuation: continued
        ? { ...candidate.continuation, call: caller, fixed: evidence('committed') }
        : null,
    }
    adopted.set(fact)
    return call
  }

  return {
    f,
    tenant,
    access,
    counts,
    parts,
    adopted,
    adopt,
    rc,
    ports,
    issue,
    get held() {
      return held
    },
    hold(id: EligibilityId) {
      held = id
      answer({ kind: 'current', eligibility: id })
    },
    answer,
    /** Each later handoff call first switches to the next of these answers. */
    answerInTurn(results: Handed[]) {
      queued = [...results]
    },
    registry,
    candidates,
    /** The source sets the adapter handed to the registry, in order. */
    registered,
    setRegisterAnswer(next: typeof registerAnswer) {
      registerAnswer = next
    },
    modelDouble,
    /** The Model request preparation the adapter calls, counted. */
    model,
    /** What the Model double answers from now on for every planned input. */
    planModel(next: typeof planAnswer) {
      planAnswer = next
    },
    materials,
    requests,
    reader,
    selection,
    conditions,
    readInput,
    read,
    prepareInput,
    passed,
  }
}
