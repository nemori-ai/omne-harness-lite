import { expect, it } from 'vitest'
import { createAgentToolQualification } from '@omne-harness/agent'
import {
  encodeToolInvocationRef,
  decodeToolCallId,
  decodeToolOperationId,
} from '@omne-harness/tool-contract'
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import { settingsPreparationWorld } from './settings-preparation-world.ts'
import { createCaptureAgent } from './agent-capture-fixture.ts'
import { candidateOf } from '../adoptions/support.ts'
import { fixedToolRequest } from '../../../../../packages/agent/agent/tests/fixtures/tool-call.ts'
import {
  fixedToolRequestSchema,
  toolIntentOf,
} from '../../../../../packages/agent/agent/src/loop/tools.ts'
import { json } from '../../../../../packages/agent/agent/src/receiving-values.ts'
import {
  ok,
  operation,
  evidence,
} from '../../../../../packages/session/session-adapters/tests/fixtures/common-journal.ts'

it('recognizes the original Agent of a saved Tool intent and its binding after a new Journal instance', async () => {
  const session = sessionStorageMaterials({ readOutputLimitBytes: 4 * 1024 * 1024 })
  const w = await settingsPreparationWorld({
    sessionWork: 'owner-session',
    extraParticipants: session.participants,
    extraMigrations: session.migrations,
    extraReadHandlers: session.readHandlers,
  })
  try {
    const adoption = candidateOf('original')
    const agent = await createCaptureAgent(w, adoption)
    const { principal, tenant, execution } = agent.request
    const access = { principal, tenant, execution }
    const source = agent.batch.actions[0]
    if (source === undefined) throw new Error('fixture action missing')
    const business = fixedToolRequest({
      owner: '@omne-harness/agent',
      work: execution,
      position: source.id,
      purpose: 'action',
    })
    const fixed = ok(
      await agent.view.materials.preserve({
        ...access,
        identity: 'real-tool-request',
        consumer: business.consumer,
        value: { kind: 'facts', schema: fixedToolRequestSchema, value: json(business) },
      }),
    )
    const allowed = {
      ...source,
      judgment: { kind: 'allowed' as const, evidence: evidence('fixture-allowed'), request: fixed },
    }
    const intent = ok(toolIntentOf(execution, allowed))
    if (intent.kind !== 'tool' || intent.association !== 'intent')
      throw new Error('expected Tool intent')
    const barrier = evidence('fixture-barrier')
    const batch = {
      ...agent.batch,
      actions: [{ ...allowed, call: intent }],
      barrier: { kind: 'open' as const, evidence: barrier, approved: [source.id] as const },
    }
    await agent.commit(batch, 'real-tool-intent')
    const input = {
      principal,
      tenant,
      call: ok(decodeToolCallId('real-tool-call')),
      admission: ok(decodeToolOperationId('real-tool-admission')),
      request: { ...business, batchDecision: barrier },
    }
    const qualifier = createAgentToolQualification({
      ...agent.view,
      targets: agent.view.toolTargets,
    })
    expect(ok(await qualifier.qualify(input))).toMatchObject({
      association: 'intent',
      agentDefinition: adoption,
    })
    const reference = ok(encodeToolInvocationRef(input))
    const associated = {
      ...intent,
      kind: 'tool' as const,
      association: 'associated' as const,
      reference,
    }
    await agent.commit(
      { ...batch, actions: [{ ...allowed, call: associated }] },
      'associate-real-tool',
    )
    expect(ok(await qualifier.qualify(input))).toMatchObject({
      association: 'associated',
      agentDefinition: adoption,
    })
    const current = ok(await agent.view.journal.load(access))
    if (current.executionAttachment === null) throw new Error('fixture attachment missing')
    ok(
      await agent.view.journal.commit({
        ...access,
        operation: operation('switch-after-tool'),
        authority: current.executionAttachment,
        expected: current.revision,
        checkpoint: {
          ...current.checkpoint,
          definition: candidateOf('later'),
          calls: [],
          batch: null,
        },
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    const next = agent.reopen()
    const recovered = createAgentToolQualification({ ...next, targets: next.toolTargets })
    expect(ok(await recovered.qualify(input))).toMatchObject({
      association: 'associated',
      agentDefinition: adoption,
    })
    expect(
      await recovered.qualify({
        ...input,
        request: { ...input.request, arguments: { ...business.arguments, effective: 'different' } },
      }),
    ).toHaveProperty('failure.kind', 'denied')
  } finally {
    await w.close()
  }
}, 30_000)
