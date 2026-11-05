// One ready preparation that the real agent-context makes (FIXED-FACTS F3): `createAgentRequests`
// fixes a candidate of the real Request Context registry, so `ready.state` is the fixed request
// record and `ready.coverage` the coverage evidence that agent-context mints, with its own
// canonical text and digest. The tests of this member hand the two to AD-04 as the `a` part, so
// the digest check of AD-04 meets the evidence agent-context really makes. Real: agent-context,
// the Request Context registry with the default strategies, the Runtime Context mechanism. Doubles:
// the history and adoption sources of request-context-contract, the holder parts, the reader
// eligibility handoff and the Model request preparation. The world follows the one of the
// agent-context tests, cut to what one ready preparation needs.
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeExecutionAttachmentId,
  decodeInputBatchId,
  decodePassageId,
  type ConsumerRef,
  type DurableEvidence,
  type Preparation,
  type RuntimeConditions,
  type SelectedModel,
} from '@omne-harness/agent-contract'
import {
  absentToolLookup,
  createAgentModelContext,
  createAgentRequests,
  createContextMaterials,
  toolsSourceOf,
} from '@omne-harness/agent-context'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  createScriptedModelRequestPreparation,
  createScriptedTransport,
} from '@omne-harness/model-contract/testing'
import {
  createAbsentConversionResults,
  createContextSourceRegistry,
  createDefaultCompactionPolicy,
  createDefaultRepresentationPolicy,
} from '@omne-harness/request-context'
import type { Access, ContextTarget } from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  createTestingPrincipalBinding,
} from '@omne-harness/request-context-contract/testing'
import type { ContextHolderParts } from '@omne-harness/request-context-cordis-contract'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { createScriptedReaderEligibility } from '@omne-harness/runtime-context-cordis-contract/testing'

function must<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(`fixture value refused: ${JSON.stringify(value.failure)}`)
  return value.ok
}

const owner = { owner: 'agent-context', name: 'session-adapters-test', revision: '1', digest: 'd' }
const evidence = (record: string): DurableEvidence => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `digest-${record}`,
})
const HEAD = evidence('history-head')
const position: ConsumerRef = {
  owner: 'agent',
  work: 'execution-1',
  position: 'main',
  purpose: 'main',
}
const authority = () => ({
  execution: must(decodeAgentExecutionId('execution-1')),
  executionAttachment: must(decodeExecutionAttachmentId('attachment-1')),
  instance: must(decodeAgentInstanceId('instance-1')),
  generation: '1',
  source: evidence('authority'),
})

export type AgentContextReady = Readonly<{
  /** The target agent-context fixed the request for: the tenant given, the fixture scope. */
  target: ContextTarget
  ready: Extract<Preparation, { kind: 'ready' }>
}>

/** One main-purpose ready preparation of agent-context for `tenant`. */
export async function agentContextReady(tenant: TenantId): Promise<AgentContextReady> {
  const f = createAssemblyFixture({
    tenant,
    policies: {
      compaction: createDefaultCompactionPolicy({
        config: { retainBudget: { kind: 'tokens', retainTokens: '600' } },
      }),
      representation: createDefaultRepresentationPolicy(),
    },
  })
  const access: Access<string> = { principal: 'ada', tenant }
  const historyEvidence = f.history.evidence()
  const parts: ContextHolderParts<string> = {
    history: f.history,
    adopted: f.sources.adopted,
    eligibility: f.sources.eligibility,
    resolveHistory: async ({ evidence: head }) =>
      head.record === HEAD.record
        ? { kind: 'value', value: historyEvidence }
        : { kind: 'invalid', field: 'evidence', reason: 'unknown-epoch' },
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
  const replayed = await rc.finishReplay('holder', {
    replay: begun.replay,
    material: { registrations: [], checkpoints: [], end: null },
  })
  if (replayed.kind !== 'ready') throw new Error(`fixture replay end: ${replayed.kind}`)
  const issued = await rc.issueEligibility('holder', {
    supersedes: null,
    scope: f.target.scope,
    consumer: 'model',
    principal: access.principal,
    tenant,
    keys: [],
    bindings: [],
    registrationRevision: 0,
  })
  if (issued.kind !== 'issued') throw new Error(`fixture eligibility: ${issued.kind}`)
  const handoff = createScriptedReaderEligibility<string>({
    scopes: [{ scope: f.target.scope, tenant }],
    answers: [
      {
        request: { principal: access.principal, tenant, scope: f.target.scope, consumer: 'model' },
        result: { kind: 'current', eligibility: issued.eligibility.id },
      },
    ],
  })

  // Request Context: the real registry with the default strategies.
  const registry = createContextSourceRegistry<string>({
    principalBinding: createTestingPrincipalBinding<string>(),
    registrationAuthority: { check: async () => ({ kind: 'allowed' }) },
    policies: f.policies,
  })

  // Model: the request preparation double, planned for every input as it arrives.
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
  const profile = f.sources.values().model.profile
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
  const model = {
    prepare: async (input: Parameters<typeof modelDouble.preparation.prepare>[0]) => {
      modelDouble.setPlan(
        {
          tenant: input.tenant,
          principal: input.principal,
          profile: input.profile,
          required: input.required,
          parameters: input.assembled.parameters,
        },
        { ok: plan },
      )
      return modelDouble.preparation.prepare(input)
    },
  }

  const materials = createContextMaterials<string>({ owner, capacity: 8 })
  const requests = createAgentRequests<string>({
    materials,
    parts,
    requestContext: {
      register: input => registry.register(input),
      assembly: target => registry.assembly(target),
    },
    preparation: f.preparation,
    conversions: createAbsentConversionResults<string>(),
    model,
    resultCapacity: { bytes: '1048576', blocks: '1024', attachmentBytes: '0' },
    tools: toolsSourceOf(absentToolLookup),
    stepResults: async () => ({ kind: 'unavailable', diagnostic: 'none' }),
  })
  const reader = createAgentModelContext<string>({
    materials,
    parts,
    eligibility: { current: request => handoff.current(request) },
    runtimeContext: { bind: async id => rc.bind(id, { consumer: 'model' }) },
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
  const read = await reader.read({
    ...access,
    advance: authority(),
    position,
    recipient: selection.recipient,
    history: HEAD,
    adopted: null,
    transition: null,
  })
  if (!('ok' in read)) throw new Error(`fixture read refused: ${JSON.stringify(read.failure)}`)
  const prepared = await requests.prepare({
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
    context: read.ok,
    previous: null,
    alterations: [],
    beforeModelCall: [must(decodePassageId('passage-1'))],
  })
  if (!('ok' in prepared) || prepared.ok.kind !== 'ready')
    throw new Error(`fixture preparation is not ready: ${JSON.stringify(prepared)}`)
  return { target: f.target, ready: prepared.ok }
}
