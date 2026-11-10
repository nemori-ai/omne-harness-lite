import { expect, it } from 'vitest'
import * as agent from '../src/index.ts'
import { fail } from '@omne-harness/operation-result'
import { adoption, evidence, ok } from './journal-support.ts'
import { decodeActionId, decodePassageId } from '@omne-harness/agent-contract'
import { eventually, gate, invoke } from './loop-support.ts'
import { toolAssembly, deliverToolSuggestion } from './fixtures/tool-call.ts'

it('qualifies the original pending Agent action from its actual loop, received material and Tool description', async () => {
  const assembly = await toolAssembly()
  const held = gate()
  assembly.controls.admission.admit.always(async () => {
    await held.opened
    return { ok: { kind: 'deny', reason: 'fixture complete', evidence: evidence('done') } }
  })
  try {
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await eventually(async () => assembly.controls.admission.admit.calls.length === 1)
    const input = assembly.controls.admission.admit.calls[0]!
    let qualificationLoads = 0
    const qualifier = agent.createAgentActionQualification({
      ...assembly.dependencies,
      journal: {
        load: request => {
          qualificationLoads++
          return assembly.dependencies.journal.load(request)
        },
      },
    })
    const result = ok(await qualifier.qualify(input))
    const current = ok(await assembly.dependencies.journal.load(input))
    expect(result).toMatchObject({
      version: 1,
      agentDefinition: current.checkpoint.definition,
      revision: current.revision,
      request: {
        execution: input.execution,
        action: input.action,
        passage: input.passage,
        advance: input.advance,
        original: input.original,
        definition: input.definition,
        effectiveArguments: input.effectiveArguments,
      },
    })
    expect(result.request).not.toHaveProperty('principal')
    expect(qualificationLoads).toBe(1)
    expect(current.checkpoint.definition).not.toEqual(input.definition)
    const wrong = [
      { ...input, action: ok(decodeActionId('another-action')) },
      { ...input, passage: ok(decodePassageId('another-passage')) },
      { ...input, effectiveArguments: '{"changed":true}' },
      { ...input, advance: { ...input.advance, generation: 'another-generation' } },
      { ...input, original: { ...input.original, callId: 'another-call' } },
      { ...input, original: { ...input.original, name: 'another-tool' } },
      { ...input, definition: adoption('another-tool') },
    ]
    for (const request of wrong) expect(await qualifier.qualify(request)).toHaveProperty('failure')
    let deeper = 0
    const denied = agent.createAgentActionQualification({
      ...assembly.dependencies,
      journal: { load: async () => fail({ kind: 'denied' as const, action: 'load' }) },
      entries: {
        receivedOf: async () => {
          deeper++
          throw new Error('must not read')
        },
      },
    })
    expect(await denied.qualify(input)).toEqual({ failure: { kind: 'denied', action: 'load' } })
    expect(deeper).toBe(0)
    const missing = agent.createAgentActionQualification({
      ...assembly.dependencies,
      toolRequests: undefined,
    })
    expect(await missing.qualify(input)).toMatchObject({ failure: { kind: 'unavailable' } })
    const broken = agent.createAgentActionQualification({
      ...assembly.dependencies,
      materials: {
        read: async () => {
          throw new Error('secret storage detail')
        },
      },
    })
    expect(await broken.qualify(input)).toEqual({
      failure: {
        kind: 'unavailable',
        owner: 'agentActionQualification',
        diagnostic: 'The original action source is unavailable.',
      },
    })

    const reading = gate()
    const reached = gate()
    const slow = agent.createAgentActionQualification({
      ...assembly.dependencies,
      journal: {
        load: async request => {
          reached.open()
          await reading.opened
          return assembly.dependencies.journal.load(request)
        },
      },
    })
    const mutable = { ...input, advance: { ...input.advance }, original: { ...input.original } }
    const pending = slow.qualify(mutable)
    await reached.opened
    mutable.advance.generation = 'changed-during-read'
    mutable.original.name = 'changed-during-read'
    reading.open()
    expect(ok(await pending).request).toMatchObject({
      advance: input.advance,
      original: input.original,
    })

    held.open()
    await eventually(async () => {
      const snapshot = ok(await assembly.dependencies.journal.load(input))
      return (
        snapshot.checkpoint.batch?.actions.find(action => action.id === input.action)?.judgment
          .kind !== 'pending'
      )
    })
    expect(await qualifier.qualify(input)).toMatchObject({ failure: { kind: 'denied' } })
  } finally {
    held.open()
  }
})
