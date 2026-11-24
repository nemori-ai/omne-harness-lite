import { digest } from '../../src/records.ts'
import type {
  CompactionInput,
  CompactionInputStore,
  ConsumerRef,
  DurableEvidence,
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
  createAgentRequests,
  createContextMaterials,
  absentToolLookup,
  type ContextMeasure,
  type DefinitionSource,
  toolsSourceOf,
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
  type HistorySource,
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
import type {} from '@omne-harness/runtime-context-contract'
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
export const HEAD = evidence('history-tip')

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
export const meterBy =
  (perMessage: number): MeterScript =>
  input => ({ ok: fixtureBudget(String(input.assembled.messages.length * perMessage)) })

function upperAt(index: number): HistoryEvidence['upper'] {
  const seq = decodeHistorySequence(String(index))
  if ('failure' in seq) throw new Error('fixture sequence')
  return { kind: 'entry', seq: seq.ok }
}

export const position: ConsumerRef = {
  owner: 'agent',
  work: 'execution-1',
  position: 'main',
  purpose: 'main',
}

export type WorldOptions = Readonly<{
  tenant?: TenantId
  rows?: readonly HistoryRow[]
  upper?: number
  meter?: MeterScript
  tools?: ToolsSource<string>
  compactionInputs?: CompactionInputStore<string>
  definitions?: DefinitionSource<string>
  capacity?: number
  measure?: ContextMeasure
  operations?: (real: AssemblyOperations<string>) => AssemblyOperations<string>
}>

export type World = Awaited<ReturnType<typeof createWorld>>

const TRACKED_ROW_FIELDS = new Set([
  'seq',
  'entry',
  'message',
  'prefixDigest',
  'sourceCall',
  'bytes',
])

function createHistoryObservation() {
  let pages = 0
  let returned = new Set<string>()
  let returnedRows = 0
  let touched = new Map<string, Set<string>>()
  const touch = (seq: string, field: string) => {
    const fields = touched.get(seq) ?? new Set<string>()
    fields.add(field)
    touched.set(seq, fields)
  }
  return {
    wrap(row: HistoryRow): HistoryRow {
      returned.add(row.seq)
      returnedRows++
      return new Proxy(row, {
        get(target, field, receiver) {
          if (typeof field === 'string' && TRACKED_ROW_FIELDS.has(field)) touch(target.seq, field)
          return Reflect.get(target, field, receiver)
        },
      })
    },
    page() {
      pages++
    },
    reset() {
      pages = 0
      returnedRows = 0
      returned = new Set()
      touched = new Map()
    },
    counts() {
      const ofField = (field: string) =>
        [...touched.values()].filter(fields => fields.has(field)).length
      return {
        pageCalls: pages,
        returnedRows,
        messageRows: ofField('message'),
        touchedRows: touched.size,
        olderRowsTouched: [...touched.keys()].filter(seq => !returned.has(seq)).length,
      }
    },
  }
}

export async function createWorld(options: WorldOptions = {}) {
  const tenant = options.tenant ?? tenantOf('1')
  const allRows = options.rows ?? [historyRow(0, 'read it'), historyRow(1, 'thanks')]
  const f: AssemblyFixture = createAssemblyFixture({
    tenant,
    rows: allRows,
    policies: {
      compaction: createDefaultCompactionPolicy(),
      representation: createDefaultRepresentationPolicy(),
    },
    ...(options.meter === undefined
      ? {}
      : { preparation: { meter: createScriptedInputMeter(countingBasis, options.meter) } }),
  })
  const access: Access<string> = { principal: 'ada', tenant }
  const counts = {
    resolveHistory: 0,
    register: 0,
    assemble: 0,
    resume: 0,
    model: 0,
  }

  const historyEvidence: HistoryEvidence = f.history.evidence()
  let upper = options.upper ?? allRows.length - 1
  const observation = createHistoryObservation()
  const observedHistory: HistorySource<string> = {
    async read(input) {
      observation.page()
      const result = await f.history.read(input)
      return result.kind === 'page'
        ? {
            ...result,
            page: { ...result.page, rows: result.page.rows.map(row => observation.wrap(row)) },
          }
        : result
    },
    compactionContext: input => f.history.compactionContext(input),
  }
  let resolvedTenant: TenantId = tenant
  const parts: ContextHolderParts<string> = {
    history: observedHistory,
    adopted: f.sources.adopted,
    eligibility: f.sources.eligibility,
    resolveHistory: async ({
      access: who,
      evidence: head,
    }): Promise<SourceRead<HistoryEvidence>> => {
      counts.resolveHistory++
      if (!tenantEquals(who.tenant, tenant)) return { kind: 'denied' }
      return head.record === HEAD.record
        ? {
            kind: 'value',
            value: {
              ...historyEvidence,
              upper: upperAt(upper),
              target: { ...historyEvidence.target, tenant: resolvedTenant },
            },
          }
        : { kind: 'invalid', field: 'evidence', reason: 'unknown-epoch' }
    },
  }

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
        provider: supplier.provider,
        model: supplier.model,
        credential: { layer: 'official' as const },
      },
    ] as const,
    parameterAdoptions: [],
  }
  let planAnswer: Parameters<typeof modelDouble.setPlan>[1] = { ok: plan }
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

  const frozen: CompactionInput[] = []
  const compactionInputs: CompactionInputStore<string> = options.compactionInputs ?? {
    async freeze(input) {
      const outputMessageId = parseMessageId('msg_' + 'c'.repeat(22))
      if (!outputMessageId.ok) throw new Error('fixture message id')
      const value = structuredClone({ ...input.value, outputMessageId: outputMessageId.value })
      const hash = digest(value)
      const source = { ...evidence(`frozen-${frozen.length}`), digest: hash }
      frozen.push(value)
      return { ok: { source, schema: owner, digest: hash } }
    },
    async read(input) {
      const value = frozen.find(item => digest(item) === input.reference.digest)
      return value === undefined
        ? { failure: { kind: 'unavailable', owner: 'inputs', diagnostic: 'missing' } }
        : { ok: structuredClone(value) }
    },
  }

  const materials = createContextMaterials({ owner })
  const requests = createAgentRequests<string>({
    materials,
    parts,
    requestContext,
    preparation: f.preparation,
    model,
    tools: options.tools ?? toolsSourceOf(absentToolLookup),
    compactionInputs,
    ...(options.definitions === undefined ? {} : { definitions: options.definitions }),
    ...(options.measure === undefined ? {} : { measure: options.measure }),
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
    segments: [],
  }

  type PrepareInput = Parameters<RequestPreparation<string>['prepare']>[0]
  function prepareInput(overrides: Partial<PrepareInput> = {}) {
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
      previous: null,
      alterations: [],
      beforeModelCall: null,
      ...overrides,
    }
    return input
  }
  const passed = [must(decodePassageId('passage-1'))]
  const adopted = f.sources.adopted as MemoryAdoptedSource<string>
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
      continuation: continued
        ? { ...candidate.continuation, call: caller, fixed: evidence('committed') }
        : null,
    }
    adopted.set(fact)
    return call
  }

  return {
    f,
    observation,
    growTo(index: number) {
      upper = index
    },
    tenant,
    access,
    counts,
    parts,
    adopted,
    resolveTo(next: TenantId) {
      resolvedTenant = next
    },
    adopt,
    registry,
    candidates,
    registered,
    setRegisterAnswer(next: typeof registerAnswer) {
      registerAnswer = next
    },
    modelDouble,
    model,
    planModel(next: typeof planAnswer) {
      planAnswer = next
    },
    materials,
    compactionInputs,
    frozen,
    requests,
    selection,
    conditions,
    prepareInput,
    passed,
  }
}
