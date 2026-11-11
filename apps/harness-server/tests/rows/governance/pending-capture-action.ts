// Original Agent facts and material use the Session Journal on real SQLite Workers.
// Session access and Tool description are explicit fixtures; this does not prove a capture commit.
import { expect } from 'vitest'
import {
  decodeActionId,
  decodeActionBatchId,
  decodePassageId,
  type ActionBatch,
  type ActionQualificationRequest,
  type PendingCall,
  type AgentCheckpoint,
  type AgentExecutionId,
  type AgentJournal,
  type Adoption,
} from '@omne-harness/agent-contract'
import type { createSessionLogJournal } from '@omne-harness/session-adapters/cordis'
import type { SessionAccess } from '@omne-harness/session-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { judgeBlockIdentity } from '@omne-harness/content-block'
import {
  decodeOutputCursor,
  resolveModelInvocationRef,
  type ModelDelivery,
} from '@omne-harness/model-contract'
import {
  ok,
  operation,
} from '../../../../../packages/session/session-adapters/tests/fixtures/common-journal.ts'
import { mainConsumption } from '../../../../../packages/agent/agent/src/loop/identities.ts'
import {
  modelDeliveryMaterial,
  modelReceivedDraft,
} from '../../../../../packages/agent/agent/src/receiving-material.ts'

export async function pendingCaptureAction<P>(
  scene: {
    access: SessionAccess<P>
    execution: AgentExecutionId
    view: ReturnType<ReturnType<typeof createSessionLogJournal<P>>['forSession']>
    openInput: Parameters<AgentJournal<P>['open']>[0]
    checkpoint: AgentCheckpoint
  },
  definition: Adoption,
) {
  const { access, execution, view } = scene
  const opened = ok(await view.journal.open(scene.openInput))
  const accessToExecution = { ...access, execution }
  const received = sampleReceivedModelResult(access.tenant, 'qualification')
  if (received.delivery.producer !== 'model' || received.delivery.key.kind !== 'result')
    throw new Error('wrong result fixture')
  const source = {
    owner: 'qualification-test',
    record: 'model-result',
    revision: '1',
    digest: 'fixture:model-result',
  }
  const identity = judgeBlockIdentity({
    id: 'block-qualification',
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in identity) throw new Error(identity.rejected)
  const original = {
    ...identity.ok,
    kind: 'tool_call' as const,
    callId: 'call-qualification',
    name: 'Shell',
    arguments: { kind: 'object' as const, entries: [] },
  }
  const action = ok(decodeActionId('action-qualification'))
  const passage = ok(decodePassageId('passage-qualification'))
  const consumption = mainConsumption(execution, scene.checkpoint.step)
  const pending: PendingCall = {
    kind: 'model',
    purpose: 'main',
    action,
    reference: received.delivery.key.reference,
    consumption,
    position: received.consumer,
    fixed: source,
  }
  const commit = async (batch: ActionBatch | null, name: string) => {
    const current = ok(await view.journal.load(accessToExecution))
    return ok(
      await view.journal.commit({
        ...accessToExecution,
        operation: operation(name),
        authority: opened.authority,
        expected: current.revision,
        checkpoint: { ...current.checkpoint, calls: [pending], batch },
        state: { kind: 'advancing' },
        events: [],
        effects: batch === null ? [{ pending, action, authority: opened.authority }] : [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
  }
  await commit(null, 'pending-model')
  const delivery: Extract<ModelDelivery, { kind: 'result' }> = {
    kind: 'result',
    key: received.delivery.key,
    consumer: received.consumer,
    accounts: [],
    settlement: {
      version: received.delivery.key.result,
      termination: { kind: 'completed', reason: 'tool-suggestions' },
      cursor: ok(decodeOutputCursor('1')),
      source,
    },
    parts: [{ kind: 'sealed', trims: [], block: original }],
  }
  const saved = ok(
    await view.received.commit({
      ...accessToExecution,
      operation: operation('receive-model'),
      entry: modelReceivedDraft(delivery, consumption),
      material: modelDeliveryMaterial(access, delivery),
    }),
  )
  expect(saved.kind).toBe('committed')
  const batch: ActionBatch = {
    id: ok(decodeActionBatchId('batch-qualification')),
    source: {
      producer: {
        kind: 'model',
        call: ok(resolveModelInvocationRef(delivery.key.reference, access.tenant)).call,
      },
      version: delivery.key.result,
      delivery: null,
      source,
    },
    actions: [
      {
        id: action,
        original: { callId: original.callId },
        effectiveArguments: '{}',
        judgment: { kind: 'pending', passage },
        call: null,
      },
    ],
    barrier: { kind: 'closed', judging: [action], asked: [] },
    slots: [],
    batchPass: null,
  }
  await commit(batch, 'pending-action')
  const request: ActionQualificationRequest<P> = {
    ...accessToExecution,
    action,
    passage,
    advance: opened.authority,
    original,
    definition,
    effectiveArguments: '{}',
  }
  const toolRequests = { describe: async () => ({ ok: { kind: 'tool' as const, definition } }) }
  return { request, toolRequests, commit, batch }
}
