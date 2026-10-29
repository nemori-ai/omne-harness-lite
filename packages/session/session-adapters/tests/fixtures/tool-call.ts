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
import { assistantMessage } from '@omne-harness/session-contract/testing'
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
  const part = assistantMessage('tool').blocks[0]!
  const batch: ActionBatch = {
    id: ok(decodeActionBatchId(`batch-${name}`)),
    source,
    actions: [
      {
        id: action,
        original: {
          kind: 'tool_call',
          id: part.id,
          visibility: { toHuman: true, toModel: true },
          callId: call,
          name: 'test',
          arguments: { kind: 'object', entries: [] },
        },
        effectiveArguments: '{}',
        judgment: {
          kind: 'allowed',
          evidence: evidence('action-allowed'),
          request: request(entry.consumer),
        },
        call: pending,
      },
    ],
    barrier: { kind: 'open', evidence: evidence('action-barrier'), approved: [action] },
    slots: [{ kind: 'dispatched', action, each: null, candidate: null, handoff: null }],
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
          candidate: null,
          handoff: null,
          placeholder,
          confirmation: evidence('background-confirmation'),
        },
      ],
    },
  }
}
import type { ToolInvokeRequest } from '@omne-harness/tool-contract'
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
    environment: adoption('environment'),
    resources: [],
    scope: { owner: 'test', key: 'scope', grant: evidence('scope') },
    consumer,
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
  }
}
