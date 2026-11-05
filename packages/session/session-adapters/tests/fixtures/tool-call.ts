import {
  decodeActionId,
  decodeActionBatchId,
  type ActionBatch,
  type PendingCall,
  type ProducedResult,
} from '@omne-harness/agent-contract'
import {
  sampleReceivedModelResult,
  sampleReceivedToolAccount,
} from '@omne-harness/agent-contract/testing'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { ok, evidence } from './common-journal.ts'

/** Original Model/Tool facts are offline fixtures; every Agent and Session commit is real. */
export function toolCall(tenant: TenantId, name = 'tool') {
  const entry = sampleReceivedToolAccount(tenant, name),
    model = sampleReceivedModelResult(tenant, name)
  if (entry.delivery.producer !== 'tool' || model.delivery.producer !== 'model')
    throw new Error('wrong fixture producer')
  const reference = entry.delivery.key.reference,
    call = ok(resolveToolInvocationRef(reference, tenant)).call
  const action = ok(decodeActionId(`action-${name}`))
  const pending: Extract<PendingCall, { kind: 'tool'; association: 'associated' }> = {
    kind: 'tool',
    purpose: 'action',
    association: 'associated',
    reference,
    action,
    consumption: entry.consumption,
    position: entry.consumer,
    fixed: evidence(`request-${name}`),
  }
  const source: ProducedResult = {
    producer: {
      kind: 'model',
      call: ok(resolveModelInvocationRef(model.delivery.key.reference, tenant)).call,
    },
    version: 'model-1',
    delivery: null,
    source: evidence('model-result'),
  }
  const placeholder: ProducedResult = {
    producer: { kind: 'tool', call },
    version: 'background-1',
    delivery: 'background-delivery',
    source: evidence('background-result'),
  }
  const batch: ActionBatch = {
    id: ok(decodeActionBatchId(`batch-${name}`)),
    source,
    actions: [
      {
        id: action,
        original: { callId: call },
        effectiveArguments: '{}',
        judgment: {
          kind: 'allowed',
          evidence: evidence('action-allowed'),
          request: pending.fixed,
        },
        call: pending,
      },
    ],
    barrier: { kind: 'open', evidence: evidence('action-barrier'), approved: [action] },
    slots: [{ kind: 'dispatched', action, each: null, candidateDigest: null, handoff: null }],
    batchPass: null,
  }
  return {
    pending,
    entry,
    call,
    batch,
    placeholder,
    background: {
      ...batch,
      slots: [
        {
          kind: 'background' as const,
          action,
          each: null,
          candidateDigest: null,
          handoff: null,
          placeholder,
          confirmation: evidence('background-confirmation'),
        },
      ],
    },
  }
}
import type { ToolInvokeRequest } from '@omne-harness/tool-contract'
import type { AgentExecutionId, AgentMaterials, Material } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'

/** The JSON tree of a plain value, keys in order: how the Agent preserves a fixed request. */
function jsonOf(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(jsonOf) }
  return {
    kind: 'object',
    entries: Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, member]) => ({ key, value: jsonOf(member) })),
  }
}

/**
 * The Tool call of `toolCall` whose allowed request is a preserved material, as the Agent keeps it
 * (agent-contract SPEC "工具执行与结果承接" 10): the request body is in the material, the judgment
 * names it. The Journal reads the background permission from that material.
 */
export async function keptToolCall(
  s: Readonly<{
    view: Readonly<{ materials: AgentMaterials<string, ContentBlock> }>
    access: Readonly<{ principal: string; tenant: TenantId }>
    execution: AgentExecutionId
  }>,
  name = 'tool',
) {
  const tool = toolCall(s.access.tenant, name)
  const value: Material<ContentBlock> = {
    kind: 'facts',
    schema: {
      owner: 'agent',
      name: 'fixed-tool-request',
      revision: '1',
      digest: 'agent:fixed-tool-request/1',
    },
    value: jsonOf(request(tool.pending.position)),
  }
  const source = ok(
    await s.view.materials.preserve({
      ...s.access,
      execution: s.execution,
      identity: `request-${name}`,
      consumer: tool.pending.position,
      value,
    }),
  )
  const kept = <B extends typeof tool.batch>(batch: B): B => ({
    ...batch,
    actions: batch.actions.map(action =>
      action.judgment.kind === 'allowed'
        ? { ...action, judgment: { ...action.judgment, request: source } }
        : action,
    ),
  })
  return { ...tool, batch: kept(tool.batch), background: kept(tool.background) }
}

function request(consumer: PendingCall['position']): ToolInvokeRequest {
  const adoption = (name: string) => ({ owner: 'test', name, revision: '1', digest: name })
  return {
    availability: {
      kind: 'available',
      layer: { kind: 'official' },
      definition: {
        adoption: adoption('test'),
        name: 'test',
        description: 'Test tool',
        requiredCapabilities: [],
        backgroundAllowed: true,
        declarations: {
          adoption: adoption('declarations'),
          environment: null,
          attachments: [],
          inputModalities: [],
          outputModalities: [],
          settings: null,
        },
        kind: 'function',
        parameters: {
          schema: {
            kind: 'object',
            entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
          },
          vocabulary: adoption('json-schema'),
          descriptions: [],
        },
        returns: { kind: 'ordinary', program: { kind: 'none' } },
      },
      executor: adoption('executor'),
    },
    command: null,
    arguments: { original: '{}', effective: '{}', complete: true },
    settings: adoption('settings'),
    context: adoption('context'),
    workspace: null,
    environment: {
      adoption: adoption('environment'),
      value: { kind: 'string', value: 'declared requirement' },
    },
    requesterScope: ok(decodeScopeRef({ ref: 'test-requester-scope' })),
    resources: [],
    scope: { owner: 'test', key: 'scope', grant: evidence('scope') },
    consumer,
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
  }
}
