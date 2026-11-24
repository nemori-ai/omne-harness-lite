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
const HEAD = evidence('history-tip')
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
  target: ContextTarget
  ready: Extract<Preparation, { kind: 'ready' }>
}>

export async function agentContextReady(tenant: TenantId): Promise<AgentContextReady> {
  const f = createAssemblyFixture({
    tenant,
    policies: {
      compaction: createDefaultCompactionPolicy(),
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

  const registry = createContextSourceRegistry<string>({
    principalBinding: createTestingPrincipalBinding<string>(),
    registrationAuthority: { check: async () => ({ kind: 'allowed' }) },
    policies: f.policies,
  })

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
        provider: supplier.provider,
        model: supplier.model,
        credential: { layer: 'official' as const },
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

  const materials = createContextMaterials({ owner })
  const requests = createAgentRequests<string>({
    materials,
    parts,
    requestContext: {
      register: input => registry.register(input),
      assembly: target => registry.assembly(target),
    },
    preparation: f.preparation,
    model,
    tools: toolsSourceOf(absentToolLookup),
    compactionInputs: {
      freeze: async () => ({
        failure: {
          kind: 'unavailable',
          owner: 'fixture',
          diagnostic: 'compaction is not available in this ready-request fixture',
        },
      }),
      read: async () => ({
        failure: {
          kind: 'unavailable',
          owner: 'fixture',
          diagnostic: 'no frozen compaction inputs',
        },
      }),
    },
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
    previous: null,
    alterations: [],
    beforeModelCall: [must(decodePassageId('passage-1'))],
  })
  if (!('ok' in prepared) || prepared.ok.kind !== 'ready')
    throw new Error(`fixture preparation is not ready: ${JSON.stringify(prepared)}`)
  return { target: f.target, ready: prepared.ok }
}
