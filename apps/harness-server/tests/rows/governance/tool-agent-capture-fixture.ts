import { createAgentToolQualification } from '@omne-harness/agent'
import type { ToolInvokeRequest } from '@omne-harness/tool-contract'
import { createCaptureAgent } from './agent-capture-fixture.ts'
import {
  fixedToolRequestSchema,
  toolIntentOf,
} from '../../../../../packages/agent/agent/src/loop/tools.ts'
import { json } from '../../../../../packages/agent/agent/src/receiving-values.ts'
import {
  ok,
  evidence,
} from '../../../../../packages/session/session-adapters/tests/fixtures/common-journal.ts'

/** Actual Journal/material writes; permission judgment and barrier are named setup fixtures. */
export async function saveCaptureToolIntent(
  agent: Awaited<ReturnType<typeof createCaptureAgent>>,
  template: ToolInvokeRequest,
) {
  const { principal, tenant, execution } = agent.request
  const source = agent.batch.actions[0]
  if (source === undefined) throw new Error('fixture action missing')
  const business = {
    ...template,
    consumer: {
      owner: '@omne-harness/agent',
      work: execution,
      position: source.id,
      purpose: 'action',
    },
    batchDecision: null,
  }
  const fixed = ok(
    await agent.view.materials.preserve({
      principal,
      tenant,
      execution,
      identity: 'captured-tool-request',
      consumer: business.consumer,
      value: { kind: 'facts', schema: fixedToolRequestSchema, value: json(business) },
    }),
  )
  const action = {
    ...source,
    effectiveArguments: business.arguments.effective,
    judgment: { kind: 'allowed' as const, evidence: evidence('capture-allowed'), request: fixed },
  }
  const intent = ok(toolIntentOf(execution, action))
  const barrier = evidence('capture-barrier')
  const batch = {
    ...agent.batch,
    actions: [{ ...action, call: intent }],
    barrier: { kind: 'open' as const, evidence: barrier, approved: [source.id] as const },
  }
  await agent.commit(batch, 'capture-tool-intent')
  return {
    business: { ...business, batchDecision: barrier },
    qualifier: createAgentToolQualification({ ...agent.view, targets: agent.view.toolTargets }),
    advance: () => agent.commit(null, 'advance-after-tool-qualification'),
    restore: () => agent.commit(batch, 'restore-original-tool-intent'),
  }
}
